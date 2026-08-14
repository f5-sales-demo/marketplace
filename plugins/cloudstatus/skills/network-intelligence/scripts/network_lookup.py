#!/usr/bin/env python3
"""Live Internet and F5 network evidence collector for cloudstatus.

The module deliberately stores no production topology. Every network, route,
facility, exchange, address, and Regional Edge component is obtained during the
current invocation.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import email.utils
import ipaddress
import json
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

HTTP_TIMEOUT = 15
HTTP_ATTEMPTS = 3
MAX_RETRY_AFTER = 10
DIAGNOSTIC_TIMEOUT = 45
MAX_RPKI_PREFIXES = 25
MAX_NEIGHBOUR_DETAILS = 200

STATUSPAGE_COMPONENTS = "https://www.f5cloudstatus.com/api/v2/components.json"
PEERINGDB_API = "https://www.peeringdb.com/api"
RIPESTAT_API = "https://stat.ripe.net/data"
IANA_RDAP = "https://data.iana.org/rdap"


class InvalidInput(ValueError):
    """Raised when a user query cannot be normalized safely."""


class SourceError(RuntimeError):
    """Raised when one live source cannot provide a usable response."""

    def __init__(self, source: str, message: str, url: str | None = None):
        super().__init__(message)
        self.source = source
        self.message = message
        self.url = url


@dataclasses.dataclass(frozen=True)
class Query:
    raw: str
    kind: str
    value: str
    asn: int | None = None
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address | None = None
    network: ipaddress.IPv4Network | ipaddress.IPv6Network | None = None


def _utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _validate_text(raw: str, *, label: str, maximum: int) -> str:
    value = raw.strip()
    if not value:
        raise InvalidInput(f"{label} is empty")
    if len(value) > maximum:
        raise InvalidInput(f"{label} is longer than {maximum} characters")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise InvalidInput(f"{label} contains control characters")
    return value


def normalize_query(raw: str) -> Query:
    """Normalize a hostname, address, prefix, or ASN without guessing topology."""

    value = _validate_text(raw, label="query", maximum=253)

    if "/" in value:
        try:
            network = ipaddress.ip_network(value, strict=False)
        except ValueError as error:
            raise InvalidInput(f"invalid IP prefix: {value}") from error
        return Query(raw=raw, kind="prefix", value=str(network), network=network)

    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        address = None
    if address is not None:
        return Query(raw=raw, kind="ip", value=str(address), ip=address)

    asn_match = re.fullmatch(r"(?i:AS)?0*([0-9]+)", value)
    if asn_match:
        asn = int(asn_match.group(1))
        if not 1 <= asn <= 4_294_967_295:
            raise InvalidInput("ASN must be between 1 and 4294967295")
        return Query(raw=raw, kind="asn", value=f"AS{asn}", asn=asn)

    try:
        hostname = value.rstrip(".").encode("idna").decode("ascii").lower()
    except UnicodeError as error:
        raise InvalidInput(f"invalid hostname: {value}") from error
    if not hostname or len(hostname) > 253:
        raise InvalidInput(f"invalid hostname: {value}")
    labels = hostname.split(".")
    label_pattern = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")
    if len(labels) < 2 or any(not label_pattern.fullmatch(label) for label in labels):
        raise InvalidInput(f"invalid hostname: {value}")
    return Query(raw=raw, kind="hostname", value=hostname)


def normalize_location_query(raw: str, *, optional: bool = False) -> str:
    value = raw.strip()
    if optional and not value:
        return ""
    value = _validate_text(raw, label="location query", maximum=100)
    if not re.fullmatch(r"[\w .,'’()/-]+", value, flags=re.UNICODE):
        raise InvalidInput("location query contains unsupported punctuation")
    return value


def _url(base: str, path: str, params: dict[str, Any] | None = None) -> str:
    target = f"{base.rstrip('/')}/{path.lstrip('/')}"
    if params:
        target += "?" + urllib.parse.urlencode(params, doseq=True, quote_via=urllib.parse.quote)
    return target


def _retry_delay(value: str | None, attempt: int) -> float:
    if value:
        try:
            return min(MAX_RETRY_AFTER, max(0.0, float(value)))
        except ValueError:
            try:
                parsed = email.utils.parsedate_to_datetime(value)
                now = dt.datetime.now(parsed.tzinfo or dt.timezone.utc)
                return min(MAX_RETRY_AFTER, max(0.0, (parsed - now).total_seconds()))
            except (TypeError, ValueError, OverflowError):
                pass
    return min(MAX_RETRY_AFTER, float(attempt))


class HttpClient:
    """Small JSON client with per-invocation caching and bounded retries."""

    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}

    def get_json(self, url: str, source: str) -> Any:
        if url in self._cache:
            cached = self._cache[url]
            if isinstance(cached, SourceError):
                raise cached
            return cached

        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "cloudstatus-network-intelligence/1.4.0",
            },
        )
        last_error: SourceError | None = None
        for attempt in range(1, HTTP_ATTEMPTS + 1):
            try:
                with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
                    charset = response.headers.get_content_charset() or "utf-8"
                    result = json.loads(response.read().decode(charset))
                    self._cache[url] = result
                    return result
            except urllib.error.HTTPError as error:
                retryable = error.code == 429 or 500 <= error.code <= 599
                last_error = SourceError(source, f"HTTP {error.code}: {error.reason}", url)
                if retryable and attempt < HTTP_ATTEMPTS:
                    time.sleep(_retry_delay(error.headers.get("Retry-After"), attempt))
                    continue
                break
            except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as error:
                last_error = SourceError(source, f"request failed: {error}", url)
                break
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                last_error = SourceError(source, f"invalid JSON response: {error}", url)
                break

        assert last_error is not None
        self._cache[url] = last_error
        raise last_error


class RdapResolver:
    """Resolve the responsible RDAP service from current IANA bootstrap data."""

    def __init__(self, http: HttpClient):
        self.http = http

    @staticmethod
    def bootstrap_url(query: Query) -> str:
        if query.kind == "asn":
            return f"{IANA_RDAP}/asn.json"
        if query.kind == "hostname":
            return f"{IANA_RDAP}/dns.json"
        address = query.ip or (query.network.network_address if query.network else None)
        if address is None:
            raise InvalidInput(f"RDAP does not support {query.kind}")
        family = "ipv4" if address.version == 4 else "ipv6"
        return f"{IANA_RDAP}/{family}.json"

    def base_for(self, query: Query) -> str:
        bootstrap = self.http.get_json(self.bootstrap_url(query), "IANA RDAP bootstrap")
        services = bootstrap.get("services", []) if isinstance(bootstrap, dict) else []

        # Each IANA service is [list-of-ranges-or-tlds, list-of-service-URLs].
        if len(services) == 2 and all(isinstance(item, list) for item in services):
            if services and services[0] and isinstance(services[0][0], str):
                services = [services]

        if query.kind == "hostname":
            tld = query.value.rsplit(".", 1)[-1].lower()
            for keys, urls in services:
                if tld in {str(key).lower() for key in keys} and urls:
                    return str(urls[0])
        elif query.kind == "asn":
            assert query.asn is not None
            for ranges, urls in services:
                for value in ranges:
                    match = re.fullmatch(r"(\d+)-(\d+)", str(value))
                    if match and int(match.group(1)) <= query.asn <= int(match.group(2)) and urls:
                        return str(urls[0])
        else:
            address = query.ip or (query.network.network_address if query.network else None)
            assert address is not None
            for ranges, urls in services:
                for value in ranges:
                    try:
                        if address in ipaddress.ip_network(str(value)) and urls:
                            return str(urls[0])
                    except ValueError:
                        continue
        raise SourceError("IANA RDAP bootstrap", f"no responsible RDAP service found for {query.value}")


def _compact_rdap(data: dict[str, Any]) -> dict[str, Any]:
    names: list[str] = []
    roles: list[dict[str, Any]] = []
    for entity in data.get("entities", []) or []:
        vcard = entity.get("vcardArray") or []
        entity_name = None
        if len(vcard) == 2 and isinstance(vcard[1], list):
            for field in vcard[1]:
                if isinstance(field, list) and len(field) >= 4 and field[0] in {"fn", "org"}:
                    entity_name = field[3]
                    break
        if entity_name:
            names.append(str(entity_name))
        if entity.get("roles"):
            roles.append({"handle": entity.get("handle"), "roles": entity.get("roles"), "name": entity_name})
    return {
        "handle": data.get("handle"),
        "name": data.get("name") or data.get("ldhName"),
        "type": data.get("type"),
        "country": data.get("country"),
        "status": data.get("status") or [],
        "start_address": data.get("startAddress"),
        "end_address": data.get("endAddress"),
        "entities": roles,
        "entity_names": list(dict.fromkeys(names)),
        "events": data.get("events") or [],
        "notices": [notice.get("title") for notice in data.get("notices", []) if notice.get("title")],
    }


def _site_codes(name: str) -> list[str]:
    codes = []
    for candidate in re.findall(r"\(([^()]*)\)", name):
        value = candidate.strip().lower()
        if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value) and any(char.isdigit() for char in value):
            codes.append(value)
    return list(dict.fromkeys(codes))


def _plain_text(value: Any, maximum: int = 65_536) -> str:
    text = "" if value is None else str(value)
    return text if len(text) <= maximum else text[:maximum] + "\n[output truncated]"


class Investigator:
    """Collect current facts and carefully labelled correlations for one operation."""

    def __init__(self, http: HttpClient | None = None):
        self.http = http or HttpClient()
        self.sources: list[dict[str, str]] = []
        self.errors: list[dict[str, str]] = []
        self.inferences: list[dict[str, Any]] = []
        self._source_urls: set[str] = set()
        self._required_successes = 0

    def _reset(self) -> None:
        self.sources = []
        self.errors = []
        self.inferences = []
        self._source_urls = set()
        self._required_successes = 0

    def _source(self, name: str, url: str, *, required: bool = True) -> None:
        if url not in self._source_urls:
            self.sources.append({"name": name, "url": url})
            self._source_urls.add(url)
        if required:
            self._required_successes += 1

    def _error(self, source: str, message: str, url: str | None = None) -> None:
        item = {"source": source, "message": message}
        if url:
            item["url"] = url
        if item not in self.errors:
            self.errors.append(item)

    def _request(self, url: str, source: str, *, required: bool = True) -> Any | None:
        try:
            result = self.http.get_json(url, source)
        except SourceError as error:
            self._error(error.source, error.message, error.url or url)
            return None
        self._source(source, url, required=required)
        return result

    def run(self, operation: str, raw_query: str = "") -> dict[str, Any]:
        self._reset()
        if operation == "edges":
            query_text = normalize_location_query(raw_query, optional=True)
            facts = self._collect_edges(query_text)
            normalized = query_text
        elif operation == "location":
            query_text = normalize_location_query(raw_query)
            facts = self._collect_location(query_text)
            normalized = query_text
        else:
            query = normalize_query(raw_query)
            normalized = query.value
            if operation == "inspect":
                facts = self._inspect(query)
            elif operation == "route":
                facts = self._collect_route(query)
            elif operation == "peering":
                if query.kind != "asn":
                    raise InvalidInput("peering requires an ASN")
                facts = self._collect_peering(query.asn or 0, include_relationship_context=True)
            elif operation == "path":
                if query.kind not in {"hostname", "ip"}:
                    raise InvalidInput("path requires a hostname or IP address")
                facts = self._collect_path(query)
            else:
                raise InvalidInput(f"unknown operation: {operation}")

        if self._required_successes == 0:
            status = "unavailable"
        elif self.errors:
            status = "partial"
        else:
            status = "complete"
        return {
            "operation": operation,
            "query": normalized,
            "observed_at": _utc_now(),
            "status": status,
            "facts": facts,
            "inferences": self.inferences,
            "sources": self.sources,
            "errors": self.errors,
        }

    def _inspect(self, query: Query) -> dict[str, Any]:
        facts: dict[str, Any] = {"identity": {"kind": query.kind, "normalized": query.value}}
        if query.kind == "hostname":
            try:
                answers = socket.getaddrinfo(query.value, None, type=socket.SOCK_STREAM)
                addresses = sorted({item[4][0] for item in answers}, key=lambda value: (":" in value, value))
                facts["dns"] = {"hostname": query.value, "addresses": addresses}
                self._source("system DNS resolver", f"dns://{query.value}")
            except socket.gaierror as error:
                addresses = []
                self._error("system DNS resolver", str(error), f"dns://{query.value}")
            registration = self._collect_rdap(query)
            if registration is not None:
                facts["domain_registration"] = registration
            routed: list[dict[str, Any]] = []
            for address in addresses[:4]:
                ip_query = normalize_query(address)
                route = self._collect_route(ip_query)
                routed.append({"address": address, **route})
            if len(addresses) > 4:
                self._error("investigation bound", f"route evidence limited to 4 of {len(addresses)} DNS addresses")
            if routed:
                facts["address_routing"] = routed
            return facts

        route = self._collect_route(query)
        facts.update(route)
        registration = self._collect_rdap(query)
        if registration is not None:
            facts["registration"] = registration
        if query.kind == "asn":
            facts["interconnection"] = self._collect_peering(query.asn or 0, include_relationship_context=False)
        return facts

    def _ripe(self, endpoint: str, resource: str, **params: Any) -> Any | None:
        query = {"resource": resource, **params}
        url = _url(RIPESTAT_API, f"{endpoint}/data.json", query)
        payload = self._request(url, f"RIPEstat {endpoint}")
        return payload.get("data") if isinstance(payload, dict) else None

    def _collect_route(self, query: Query) -> dict[str, Any]:
        if query.kind == "hostname":
            raise InvalidInput("route requires an IP address, prefix, or ASN")
        if query.kind == "asn":
            return self._collect_asn_route(query)
        return self._collect_ip_route(query)

    def _collect_ip_route(self, query: Query) -> dict[str, Any]:
        network_info = self._ripe("network-info", query.value)
        route_resource = query.value
        origins: list[str] = []
        prefix = query.value if query.kind == "prefix" else None
        if isinstance(network_info, dict):
            prefix = network_info.get("prefix") or prefix
            origins = [f"AS{int(value)}" for value in network_info.get("asns", []) if str(value).isdigit()]
            route_resource = prefix or route_resource

        routing_status = self._ripe("routing-status", route_resource)
        looking_glass = self._ripe("looking-glass", route_resource)

        facts: dict[str, Any] = {}
        if network_info is not None:
            facts["route"] = {
                "prefix": prefix,
                "origins": origins,
                "origin_observation": "BGP route origin, not ASN registration",
            }
        if routing_status is not None:
            facts["routing_status"] = routing_status
        if looking_glass is not None:
            facts["looking_glass"] = self._summarize_looking_glass(looking_glass)

        rpki: list[dict[str, Any]] = []
        if prefix:
            for origin in origins:
                result = self._ripe("rpki-validation", origin, prefix=prefix)
                if result is not None:
                    rpki.append({
                        "origin": origin,
                        "prefix": prefix,
                        "status": result.get("status", "unknown") if isinstance(result, dict) else "unknown",
                        "details": result,
                    })
        if rpki:
            facts["rpki"] = rpki
        if len(origins) > 1:
            self.inferences.append({
                "assessment": "multi-origin-observed",
                "basis": f"RIPEstat network-info returned {len(origins)} origins for {prefix}",
                "limitation": "This does not by itself identify intent, traffic share, or a route leak.",
            })
        return facts

    def _collect_asn_route(self, query: Query) -> dict[str, Any]:
        announced = self._ripe("announced-prefixes", query.value)
        neighbours = self._ripe("asn-neighbours", query.value)
        prefixes = []
        if isinstance(announced, dict):
            prefixes = [item.get("prefix") for item in announced.get("prefixes", []) if item.get("prefix")]
        route_sample = prefixes[0] if prefixes else None
        routing_status = self._ripe("routing-status", route_sample) if route_sample else None
        looking_glass = self._ripe("looking-glass", route_sample) if route_sample else None
        facts: dict[str, Any] = {
            "asn": query.value,
            "announced_prefixes": prefixes,
            "announcement_observation": {
                "query_starttime": announced.get("query_starttime"),
                "query_endtime": announced.get("query_endtime"),
                "earliest_time": announced.get("earliest_time"),
                "latest_time": announced.get("latest_time"),
                "meaning": "Prefixes observed during the RIPEstat source window, not an instantaneous routing-table snapshot.",
            } if isinstance(announced, dict) else None,
            "route_sample": route_sample,
        }
        if neighbours is not None:
            facts["observed_neighbours"] = self._summarize_neighbours(neighbours)
        if routing_status is not None:
            facts["routing_status"] = routing_status
        if looking_glass is not None:
            facts["looking_glass"] = self._summarize_looking_glass(looking_glass)

        rpki: list[dict[str, Any]] = []
        for prefix in prefixes[:MAX_RPKI_PREFIXES]:
            result = self._ripe("rpki-validation", query.value, prefix=prefix)
            if result is not None:
                rpki.append({"origin": query.value, "prefix": prefix, "status": result.get("status", "unknown"), "details": result})
        if rpki:
            facts["rpki"] = rpki
        facts["rpki_coverage"] = {
            "announced_prefix_count": len(prefixes),
            "checked_prefix_count": len(rpki),
            "limit": MAX_RPKI_PREFIXES,
            "complete": len(prefixes) <= MAX_RPKI_PREFIXES and len(rpki) == len(prefixes),
        }
        if len(prefixes) > MAX_RPKI_PREFIXES:
            self._error(
                "investigation bound",
                f"RPKI validation limited to {MAX_RPKI_PREFIXES} of {len(prefixes)} announced prefixes",
            )
        self.inferences.append({
            "assessment": "adjacency-only",
            "basis": "RIPEstat neighbour and looking-glass observations, when present",
            "limitation": "Observed BGP adjacency does not establish commercial peering or transit.",
        })
        return facts

    def _summarize_neighbours(self, data: Any) -> dict[str, Any]:
        if not isinstance(data, dict):
            return {"observations": data}
        records = data.get("neighbours") or []
        counts: dict[tuple[int, str], int] = {}
        for record in records:
            if not isinstance(record, dict) or record.get("asn") is None:
                continue
            key = (int(record["asn"]), str(record.get("type") or "unknown"))
            counts[key] = counts.get(key, 0) + 1
        unique = [
            {"asn": f"AS{asn}", "position": position, "observations": count}
            for (asn, position), count in sorted(
                counts.items(), key=lambda item: (-item[1], item[0][0], item[0][1])
            )
        ]
        returned = unique[:MAX_NEIGHBOUR_DETAILS]
        omitted = len(unique) - len(returned)
        if omitted:
            self._error(
                "investigation bound",
                f"Neighbour detail limited to {MAX_NEIGHBOUR_DETAILS} of {len(unique)} unique ASN/position observations",
            )
        return {
            "observation_count": len(records),
            "unique_neighbour_count": len({asn for asn, _ in counts}),
            "detail_count": len(returned),
            "detail_omitted": omitted,
            "neighbours": returned,
            "source_counts": data.get("neighbour_counts") or {},
            "earliest_time": data.get("earliest_time"),
            "latest_time": data.get("latest_time"),
        }

    @staticmethod
    def _summarize_looking_glass(data: Any) -> dict[str, Any]:
        if not isinstance(data, dict):
            return {"observations": data}
        rrcs = data.get("rrcs") or []
        if isinstance(rrcs, dict):
            rrcs = [{"rrc": key, "peers": value} for key, value in rrcs.items()]
        observations: list[dict[str, Any]] = []
        for rrc in rrcs[:20]:
            if not isinstance(rrc, dict):
                continue
            peers = rrc.get("peers") or []
            if isinstance(peers, dict):
                peers = list(peers.values())
            for peer in peers[:20]:
                if isinstance(peer, dict):
                    observations.append({
                        "collector": rrc.get("rrc") or rrc.get("location"),
                        "peer": peer.get("peer") or peer.get("asn"),
                        "origin": peer.get("asn_origin") or peer.get("origin"),
                        "as_path": peer.get("as_path") or peer.get("path"),
                    })
        return {"observation_count_returned": len(observations), "observations": observations}

    def _collect_rdap(self, query: Query) -> dict[str, Any] | None:
        resolver = RdapResolver(self.http)
        bootstrap_url = resolver.bootstrap_url(query)
        try:
            base = resolver.base_for(query)
            self._source("IANA RDAP bootstrap", bootstrap_url, required=False)
        except SourceError as error:
            self._error(error.source, error.message, error.url or bootstrap_url)
            return None

        if query.kind == "asn":
            suffix = f"autnum/{query.asn}"
        elif query.kind == "hostname":
            suffix = f"domain/{urllib.parse.quote(query.value, safe='')}"
        else:
            suffix = f"ip/{urllib.parse.quote(query.value, safe='')}"
        url = f"{base.rstrip('/')}/{suffix}"
        payload = self._request(url, "responsible RIR RDAP" if query.kind != "hostname" else "responsible registry RDAP")
        return _compact_rdap(payload) if isinstance(payload, dict) else None

    def _collect_peering(self, asn: int, *, include_relationship_context: bool) -> dict[str, Any]:
        net_url = _url(PEERINGDB_API, "net", {"asn": asn})
        net_payload = self._request(net_url, "PeeringDB net")
        networks = net_payload.get("data", []) if isinstance(net_payload, dict) else []
        if not networks:
            facts: dict[str, Any] = {
                "network": None,
                "direct_facilities": [],
                "ix_participation": [],
                "ix_facility_candidates": [],
            }
            if include_relationship_context:
                facts["observed_neighbours"] = self._ripe("asn-neighbours", f"AS{asn}") or []
                self._add_transit_assessment()
            return facts

        network = sorted(networks, key=lambda item: int(item.get("id", 0)))[0]
        net_id = network.get("id")
        if net_id is None:
            self._error("PeeringDB net", f"ASN {asn} record did not contain a network ID", net_url)
            return {"network": network, "direct_facilities": [], "ix_participation": [], "ix_facility_candidates": []}

        netfac_url = _url(PEERINGDB_API, "netfac", {"net_id": net_id})
        netixlan_url = _url(PEERINGDB_API, "netixlan", {"net_id": net_id})
        netfac_payload = self._request(netfac_url, "PeeringDB netfac")
        netixlan_payload = self._request(netixlan_url, "PeeringDB netixlan")
        netfac = netfac_payload.get("data", []) if isinstance(netfac_payload, dict) else []
        netixlan = netixlan_payload.get("data", []) if isinstance(netixlan_payload, dict) else []

        ix_ids = sorted({int(item["ix_id"]) for item in netixlan if item.get("ix_id") is not None})
        exchanges: list[dict[str, Any]] = []
        ixfac: list[dict[str, Any]] = []
        if ix_ids:
            joined = ",".join(str(value) for value in ix_ids)
            ix_url = _url(PEERINGDB_API, "ix", {"id__in": joined})
            ixfac_url = _url(PEERINGDB_API, "ixfac", {"ix_id__in": joined})
            ix_payload = self._request(ix_url, "PeeringDB ix")
            ixfac_payload = self._request(ixfac_url, "PeeringDB ixfac")
            exchanges = ix_payload.get("data", []) if isinstance(ix_payload, dict) else []
            ixfac = ixfac_payload.get("data", []) if isinstance(ixfac_payload, dict) else []

        direct_facility_ids = {int(item["fac_id"]) for item in netfac if item.get("fac_id") is not None}
        ix_facility_ids = {int(item["fac_id"]) for item in ixfac if item.get("fac_id") is not None}
        all_facility_ids = sorted(direct_facility_ids | ix_facility_ids)
        facilities: list[dict[str, Any]] = []
        if all_facility_ids:
            joined = ",".join(str(value) for value in all_facility_ids)
            fac_url = _url(PEERINGDB_API, "fac", {"id__in": joined})
            fac_payload = self._request(fac_url, "PeeringDB fac")
            facilities = fac_payload.get("data", []) if isinstance(fac_payload, dict) else []
        facility_by_id = {int(item["id"]): item for item in facilities if item.get("id") is not None}
        ix_by_id = {int(item["id"]): item for item in exchanges if item.get("id") is not None}

        direct_facilities = [facility_by_id[value] for value in sorted(direct_facility_ids) if value in facility_by_id]
        ix_participation = []
        for record in netixlan:
            ix_id = int(record["ix_id"]) if record.get("ix_id") is not None else None
            ix_participation.append({
                "ix_id": ix_id,
                "name": (ix_by_id.get(ix_id, {}) if ix_id is not None else {}).get("name") or record.get("name"),
                "ipaddr4": record.get("ipaddr4"),
                "ipaddr6": record.get("ipaddr6"),
                "speed": record.get("speed"),
            })
        ix_candidates = []
        for record in ixfac:
            fac_id = int(record["fac_id"]) if record.get("fac_id") is not None else None
            ix_id = int(record["ix_id"]) if record.get("ix_id") is not None else None
            ix_candidates.append({
                "ix_id": ix_id,
                "ix_name": ix_by_id.get(ix_id, {}).get("name") if ix_id is not None else None,
                "facility": facility_by_id.get(fac_id) if fac_id is not None else None,
                "evidence": "IX facility record; not direct ASN facility presence",
            })

        facts = {
            "network": network,
            "network_candidates": networks,
            "direct_facilities": direct_facilities,
            "ix_participation": ix_participation,
            "ix_facility_candidates": ix_candidates,
        }
        if include_relationship_context:
            neighbours = self._ripe("asn-neighbours", f"AS{asn}")
            if neighbours is not None:
                facts["observed_neighbours"] = self._summarize_neighbours(neighbours)
            self._add_transit_assessment()
        return facts

    def _add_transit_assessment(self) -> None:
        self.inferences.append({
            "assessment": "indeterminate",
            "question": "potentially transit-free",
            "basis": "Public facility, IX, and observed-neighbour records do not encode complete commercial relationships.",
            "next_evidence": "Corroborate with CAIDA AS relationships, route-server policy, and official network statements.",
        })

    def _collect_edges(self, query: str = "") -> dict[str, Any]:
        payload = self._request(STATUSPAGE_COMPONENTS, "F5 Statuspage components")
        components = payload.get("components", []) if isinstance(payload, dict) else []
        group_pattern = re.compile(r"regional\s+edges?|\bpops?\b", re.IGNORECASE)
        groups = {
            item.get("id"): item.get("name")
            for item in components
            if item.get("group") is True and group_pattern.search(str(item.get("name", "")))
        }
        edges = []
        query_lower = query.casefold()
        for item in components:
            if item.get("group") is True or item.get("group_id") not in groups:
                continue
            record = {
                "id": item.get("id"),
                "name": item.get("name"),
                "status": item.get("status"),
                "group": groups[item.get("group_id")],
                "site_codes": _site_codes(str(item.get("name", ""))),
                "updated_at": item.get("updated_at"),
            }
            searchable = " ".join([str(record["name"]), str(record["group"]), *record["site_codes"]]).casefold()
            if not query_lower or query_lower in searchable:
                edges.append(record)
        return {
            "regional_edge_groups": [{"id": key, "name": value} for key, value in groups.items()],
            "edge_components": edges,
        }

    def _collect_location(self, query: str) -> dict[str, Any]:
        edge_facts = self._collect_edges("")
        query_folded = query.casefold()
        matching_edges = [
            edge
            for edge in edge_facts["edge_components"]
            if query_folded in str(edge.get("name", "")).casefold()
            or query_folded in str(edge.get("group", "")).casefold()
            or query_folded in {code.casefold() for code in edge.get("site_codes", [])}
        ]
        peering = self._collect_peering(35280, include_relationship_context=False)
        direct = peering.get("direct_facilities", [])

        codes = list(dict.fromkeys(code for edge in matching_edges for code in edge.get("site_codes", [])))
        metro_terms = {query_folded}
        for edge in matching_edges:
            name = str(edge.get("name", ""))
            metro = re.split(r"\s*\(|,", name, maxsplit=1)[0].strip().casefold()
            if metro:
                metro_terms.add(metro)

        direct_metro = [
            facility
            for facility in direct
            if any(
                term and (term in str(facility.get("city", "")).casefold() or term in str(facility.get("name", "")).casefold())
                for term in metro_terms
            )
        ]
        exact = [
            facility
            for facility in direct_metro
            if any(re.search(rf"(?<![a-z0-9]){re.escape(code)}(?![a-z0-9])", str(facility.get("name", "")), re.IGNORECASE) for code in codes)
        ]
        facts = {
            "regional_edge_groups": edge_facts["regional_edge_groups"],
            "edge_components": matching_edges,
            "site_codes_observed_live": codes,
            "as35280_network": peering.get("network"),
            "direct_metro_facilities": direct_metro,
            "ix_participation": peering.get("ix_participation", []),
            "ix_facility_candidates": peering.get("ix_facility_candidates", []),
        }
        if exact:
            facts["exact_site_code_facility_candidates"] = exact
            self.inferences.append({
                "assessment": "strongest-public-correlation",
                "basis": "A site code visible in a live F5 component name also appears in a facility where AS35280 has direct PeeringDB presence.",
                "candidates": [facility.get("name") for facility in exact],
                "limitation": "This is not proof that a particular F5 service instance occupies that building.",
            })
        elif len(direct_metro) > 1:
            self.inferences.append({
                "assessment": "unresolved",
                "basis": "AS35280 has direct presence at multiple facilities in the metro and no exact live site-code match selects one.",
                "candidates": [facility.get("name") for facility in direct_metro],
                "limitation": "Metro presence does not establish the Regional Edge building.",
            })
        elif len(direct_metro) == 1:
            self.inferences.append({
                "assessment": "direct-as-metro-presence",
                "basis": "AS35280 has direct PeeringDB facility presence in the metro.",
                "candidates": [direct_metro[0].get("name")],
                "limitation": "The exact Regional Edge building remains unproven.",
            })
        else:
            self.inferences.append({
                "assessment": "unresolved",
                "basis": "No direct AS35280 facility record converged with the live F5 component evidence.",
                "limitation": "IX participation or a facility candidate alone cannot locate an F5 Regional Edge.",
            })
        return facts

    def _collect_path(self, query: Query) -> dict[str, Any]:
        target = query.value
        start = time.monotonic()
        facts: dict[str, Any] = {"target": target, "diagnostics": []}
        # A validated, user-supplied target makes missing or blocked probes a partial
        # diagnostic result instead of an unavailable-source failure.
        self._required_successes = 1

        probes: list[tuple[str, list[str]] | None] = []
        ping = shutil.which("ping")
        if ping:
            probes.append(("ping", [ping, "-c", "4", target]))
        else:
            self._error("active diagnostics", "ping is not installed")

        tracepath = shutil.which("tracepath")
        traceroute = shutil.which("traceroute")
        if tracepath:
            probes.append(("tracepath", [tracepath, "-m", "30", target]))
        elif traceroute:
            probes.append(("traceroute", [traceroute, "-m", "30", target]))
        else:
            self._error("active diagnostics", "neither tracepath nor traceroute is installed")

        mtr = shutil.which("mtr")
        if mtr:
            probes.append(("mtr", [mtr, "--report", "--report-cycles", "5", target]))
        else:
            self._error("active diagnostics", "mtr is not installed")

        for name, args in [probe for probe in probes if probe is not None]:
            remaining = DIAGNOSTIC_TIMEOUT - (time.monotonic() - start)
            if remaining <= 0:
                self._error("active diagnostics", "aggregate diagnostic timeout reached before all probes ran")
                break
            try:
                result = subprocess.run(
                    args,
                    capture_output=True,
                    text=True,
                    timeout=remaining,
                    check=False,
                )
                facts["diagnostics"].append({
                    "tool": name,
                    "arguments": args[1:-1],
                    "returncode": result.returncode,
                    "stdout": _plain_text(result.stdout),
                    "stderr": _plain_text(result.stderr),
                })
                self._source(f"local {name}", f"diagnostic://{name}/{urllib.parse.quote(target, safe='')}", required=False)
                if result.returncode != 0:
                    self._error(
                        "active diagnostics",
                        f"{name} exited {result.returncode}; ICMP filtering, policy, routing, or privileges may limit the result",
                    )
            except subprocess.TimeoutExpired as error:
                facts["diagnostics"].append({
                    "tool": name,
                    "arguments": args[1:-1],
                    "timed_out": True,
                    "stdout": _plain_text(error.stdout),
                    "stderr": _plain_text(error.stderr),
                })
                self._error("active diagnostics", f"{name} reached the aggregate diagnostic timeout")
                break
            except OSError as error:
                self._error("active diagnostics", f"could not execute {name}: {error}")
        return facts


def invalid_report(operation: str, query: str, message: str) -> dict[str, Any]:
    return {
        "operation": operation,
        "query": query,
        "observed_at": _utc_now(),
        "status": "invalid",
        "facts": {},
        "inferences": [],
        "sources": [],
        "errors": [{"source": "input validation", "message": message}],
    }


def exit_code(report: dict[str, Any]) -> int:
    if report.get("status") == "invalid":
        return 2
    if report.get("status") == "unavailable":
        return 3
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect live Internet and F5 network evidence")
    subparsers = parser.add_subparsers(dest="operation", required=True)
    for operation in ("inspect", "route", "peering", "location", "path"):
        command = subparsers.add_parser(operation)
        command.add_argument("query")
    edges = subparsers.add_parser("edges")
    edges.add_argument("query", nargs="?", default="")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    try:
        namespace = parser.parse_args(arguments)
    except SystemExit as error:
        return int(error.code)
    operation = namespace.operation
    query = namespace.query
    try:
        report = Investigator().run(operation, query)
    except InvalidInput as error:
        report = invalid_report(operation, query, str(error))
    print(json.dumps(report, indent=2, sort_keys=False, ensure_ascii=False))
    return exit_code(report)


if __name__ == "__main__":
    raise SystemExit(main())
