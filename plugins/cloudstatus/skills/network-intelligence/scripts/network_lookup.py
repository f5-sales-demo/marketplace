#!/usr/bin/env python3
# ruff: noqa: EM101, EM102, PLR2004, TRY003
# pylint: disable=too-many-lines
"""Live Internet and F5 network evidence collector for cloudstatus.

The module deliberately stores no production topology. Every network, route,
facility, exchange, address, and Regional Edge component is obtained during the
current invocation. It intentionally remains a single executable because xcsh
loads this standard-library collector through a namespaced skill resource,
without assuming a Python package or the user's working directory.
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
WIKIDATA_QUERY_SERVICE = "https://query.wikidata.org"
MAX_WIKIDATA_METROS = 100


class InvalidInputError(ValueError):
    """Raised when a user query cannot be normalized safely."""


class SourceError(RuntimeError):
    """Raised when one live source cannot provide a usable response."""

    def __init__(self, source: str, message: str, url: str | None = None) -> None:
        """Record the source and URL alongside the human-readable message."""
        super().__init__(message)
        self.source = source
        self.message = message
        self.url = url


@dataclasses.dataclass(frozen=True)
class Query:
    """Normalized form of an accepted user network query."""

    raw: str
    kind: str
    value: str
    asn: int | None = None
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address | None = None
    network: ipaddress.IPv4Network | ipaddress.IPv6Network | None = None


def _utc_now() -> str:
    return (
        dt.datetime.now(dt.UTC)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _validate_text(raw: str, *, label: str, maximum: int) -> str:
    value = raw.strip()
    if not value:
        raise InvalidInputError(f"{label} is empty")
    if len(value) > maximum:
        raise InvalidInputError(f"{label} is longer than {maximum} characters")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise InvalidInputError(f"{label} contains control characters")
    return value


def normalize_query(raw: str) -> Query:
    """Normalize a hostname, address, prefix, or ASN without guessing topology."""
    value = _validate_text(raw, label="query", maximum=253)

    if "/" in value:
        try:
            network = ipaddress.ip_network(value, strict=False)
        except ValueError as error:
            raise InvalidInputError(f"invalid IP prefix: {value}") from error
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
            raise InvalidInputError("ASN must be between 1 and 4294967295")
        return Query(raw=raw, kind="asn", value=f"AS{asn}", asn=asn)

    try:
        hostname = value.rstrip(".").encode("idna").decode("ascii").lower()
    except UnicodeError as error:
        raise InvalidInputError(f"invalid hostname: {value}") from error
    if not hostname or len(hostname) > 253:
        raise InvalidInputError(f"invalid hostname: {value}")
    labels = hostname.split(".")
    label_pattern = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")
    if len(labels) < 2 or any(not label_pattern.fullmatch(label) for label in labels):
        raise InvalidInputError(f"invalid hostname: {value}")
    return Query(raw=raw, kind="hostname", value=hostname)


def normalize_location_query(raw: str, *, optional: bool = False) -> str:
    """Normalize a bounded, human-readable metro or site-code query."""
    value = raw.strip()
    if optional and not value:
        return ""
    value = _validate_text(raw, label="location query", maximum=100)
    if not re.fullmatch(r"[\w .,'()/-]+", value, flags=re.UNICODE):
        raise InvalidInputError("location query contains unsupported punctuation")
    return value


def build_url(base: str, path: str, params: dict[str, Any] | None = None) -> str:
    """Build an encoded URL for a known live-source endpoint."""
    target = f"{base.rstrip('/')}/{path.lstrip('/')}"
    if params:
        target += "?" + urllib.parse.urlencode(
            params, doseq=True, quote_via=urllib.parse.quote
        )
    return target


def _retry_delay(value: str | None, attempt: int) -> float:
    if value:
        try:
            return min(MAX_RETRY_AFTER, max(0.0, float(value)))
        except ValueError:
            try:
                parsed = email.utils.parsedate_to_datetime(value)
                now = dt.datetime.now(parsed.tzinfo or dt.UTC)
                return min(MAX_RETRY_AFTER, max(0.0, (parsed - now).total_seconds()))
            except (TypeError, ValueError, OverflowError):
                pass
    return min(MAX_RETRY_AFTER, float(attempt))


class HttpClient:
    """Small JSON client with per-invocation caching and bounded retries."""

    def __init__(self) -> None:
        """Create an empty cache scoped to this collector invocation."""
        self._cache: dict[str, Any] = {}

    def get_json(self, url: str, source: str) -> Any:
        """Fetch one approved HTTPS JSON resource with bounded retries."""
        if url in self._cache:
            cached = self._cache[url]
            if isinstance(cached, SourceError):
                raise cached
            return cached

        parsed_url = urllib.parse.urlsplit(url)
        if parsed_url.scheme != "https" or not parsed_url.netloc:
            raise SourceError(
                source, "only absolute HTTPS source URLs are permitted", url
            )
        request = urllib.request.Request(  # noqa: S310
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "cloudstatus-network-intelligence/1.5.1 (+https://github.com/f5-sales-demo/marketplace)",
            },
        )
        last_error: SourceError | None = None
        for attempt in range(1, HTTP_ATTEMPTS + 1):
            try:
                # The scheme and authority are checked above; every call site builds
                # query strings through build_url or a verified RDAP bootstrap response.
                with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:  # noqa: S310
                    charset = response.headers.get_content_charset() or "utf-8"
                    result = json.loads(response.read().decode(charset))
                    self._cache[url] = result
                    return result
            except urllib.error.HTTPError as error:
                retryable = error.code == 429 or 500 <= error.code <= 599
                last_error = SourceError(
                    source, f"HTTP {error.code}: {error.reason}", url
                )
                if retryable and attempt < HTTP_ATTEMPTS:
                    time.sleep(_retry_delay(error.headers.get("Retry-After"), attempt))
                    continue
                break
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                last_error = SourceError(source, f"request failed: {error}", url)
                break
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                last_error = SourceError(source, f"invalid JSON response: {error}", url)
                break

        if last_error is None:
            raise SourceError(source, "request ended without a response or error", url)
        self._cache[url] = last_error
        raise last_error


class RdapResolver:
    """Resolve the responsible RDAP service from current IANA bootstrap data."""

    def __init__(self, http: HttpClient) -> None:
        """Use the invocation-scoped HTTP client for bootstrap requests."""
        self.http = http

    @staticmethod
    def bootstrap_url(query: Query) -> str:
        """Return the IANA bootstrap document appropriate to a query type."""
        if query.kind == "asn":
            return f"{IANA_RDAP}/asn.json"
        if query.kind == "hostname":
            return f"{IANA_RDAP}/dns.json"
        address = query.ip or (query.network.network_address if query.network else None)
        if address is None:
            raise InvalidInputError(f"RDAP does not support {query.kind}")
        family = "ipv4" if address.version == 4 else "ipv6"
        return f"{IANA_RDAP}/{family}.json"

    def base_for(self, query: Query) -> str:
        """Find the responsible registry endpoint in current bootstrap data."""
        bootstrap = self.http.get_json(self.bootstrap_url(query), "IANA RDAP bootstrap")
        services = bootstrap.get("services", []) if isinstance(bootstrap, dict) else []

        # Each IANA service is [list-of-ranges-or-tlds, list-of-service-URLs].
        if (
            len(services) == 2
            and all(isinstance(item, list) for item in services)
            and services
            and services[0]
            and isinstance(services[0][0], str)
        ):
            services = [services]

        if query.kind == "hostname":
            tld = query.value.rsplit(".", 1)[-1].lower()
            for keys, urls in services:
                if tld in {str(key).lower() for key in keys} and urls:
                    return str(urls[0])
        elif query.kind == "asn":
            if query.asn is None:
                raise InvalidInputError("ASN query is missing its numeric value")
            for ranges, urls in services:
                for value in ranges:
                    match = re.fullmatch(r"(\d+)-(\d+)", str(value))
                    if (
                        match
                        and int(match.group(1)) <= query.asn <= int(match.group(2))
                        and urls
                    ):
                        return str(urls[0])
        else:
            address = query.ip or (
                query.network.network_address if query.network else None
            )
            if address is None:
                raise InvalidInputError("IP query is missing its address value")
            for ranges, urls in services:
                for value in ranges:
                    try:
                        if address in ipaddress.ip_network(str(value)) and urls:
                            return str(urls[0])
                    except ValueError:
                        continue
        raise SourceError(
            "IANA RDAP bootstrap",
            f"no responsible RDAP service found for {query.value}",
        )


def _compact_rdap(data: dict[str, Any]) -> dict[str, Any]:
    names: list[str] = []
    roles: list[dict[str, Any]] = []
    for entity in data.get("entities", []) or []:
        vcard = entity.get("vcardArray") or []
        entity_name = None
        if len(vcard) == 2 and isinstance(vcard[1], list):
            for field in vcard[1]:
                if (
                    isinstance(field, list)
                    and len(field) >= 4
                    and field[0] in {"fn", "org"}
                ):
                    entity_name = field[3]
                    break
        if entity_name:
            names.append(str(entity_name))
        if entity.get("roles"):
            roles.append(
                {
                    "handle": entity.get("handle"),
                    "roles": entity.get("roles"),
                    "name": entity_name,
                }
            )
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
        "notices": [
            notice.get("title")
            for notice in data.get("notices", [])
            if notice.get("title")
        ],
    }


def _site_codes(name: str) -> list[str]:
    codes = []
    for candidate in re.findall(r"\(([^()]*)\)", name):
        value = candidate.strip().lower()
        if len(value) <= 32 and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            codes.append(value)
    return list(dict.fromkeys(codes))


def _component_place(name: str) -> tuple[str, str]:
    """Extract only the metro and country text published in a component name."""
    parts = [part.strip() for part in name.split(",")]
    metro = re.sub(r"\s*\([^()]*\)\s*$", "", parts[0]).strip() if parts else ""
    country = parts[-1] if len(parts) > 1 else ""
    return metro, country


def _component_region(group: str) -> str:
    """Return the live group name without inventing a regional taxonomy."""
    return re.sub(
        r"\s*(?:regional\s+edges?|pops?)\s*$", "", group, flags=re.IGNORECASE
    ).strip()


def _coordinate(record: dict[str, Any]) -> tuple[float, float] | None:
    """Read coordinates only from documented, source-supplied field pairs."""
    pairs = (("longitude", "latitude"), ("lon", "lat"))
    for longitude_key, latitude_key in pairs:
        try:
            longitude = float(record[longitude_key])
            latitude = float(record[latitude_key])
        except (KeyError, TypeError, ValueError):
            continue
        if -180 <= longitude <= 180 and -90 <= latitude <= 90:
            return longitude, latitude
    return None


def _published_location(record: dict[str, Any]) -> dict[str, Any]:
    """Retain current source fields without creating an embedded location dataset."""
    result: dict[str, Any] = {}
    coordinates = _coordinate(record)
    if coordinates:
        result["longitude"], result["latitude"] = coordinates
    for field in ("address", "address1", "address2", "city", "state", "country"):
        if record.get(field):
            result[field] = record[field]
    return result


def _location_id(value: Any, index: int) -> str:
    """Build a stable render_map-compatible ID from the live component ID."""
    candidate = re.sub(r"[^A-Za-z0-9_.:-]+", "-", str(value or "")).strip("-.")
    if not candidate or not candidate[0].isalnum():
        candidate = f"regional-edge-{index + 1}"
    return candidate[:128]


def _wikidata_point(value: Any) -> tuple[float, float] | None:
    """Parse the WKT Point value returned by the current Wikidata query."""
    match = re.fullmatch(
        r"Point\((-?(?:\d+(?:\.\d+)?|\.\d+)) (-?(?:\d+(?:\.\d+)?|\.\d+))\)",
        str(value),
    )
    if not match:
        return None
    longitude, latitude = float(match.group(1)), float(match.group(2))
    if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
        return None
    return longitude, latitude


def _plain_text(value: Any, maximum: int = 65_536) -> str:
    text = "" if value is None else str(value)
    return text if len(text) <= maximum else text[:maximum] + "\n[output truncated]"


class Investigator:
    """Collect current facts and carefully labelled correlations for one operation."""

    def __init__(self, http: HttpClient | None = None) -> None:
        """Initialize collector state and optionally inject an HTTP client."""
        self.http = http or HttpClient()
        self.sources: list[dict[str, str]] = []
        self.errors: list[dict[str, str]] = []
        self.inferences: list[dict[str, Any]] = []
        self._source_urls: set[str] = set()
        self._required_successes = 0
        self.observed_at = _utc_now()

    def _reset(self) -> None:
        self.sources = []
        self.errors = []
        self.inferences = []
        self._source_urls = set()
        self._required_successes = 0
        self.observed_at = _utc_now()

    def _source(self, name: str, url: str, *, required: bool = True) -> None:
        if url not in self._source_urls:
            self.sources.append(
                {"name": name, "url": url, "observed_at": self.observed_at}
            )
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
        """Run one supported evidence operation and return its JSON-ready report."""
        self._reset()
        if operation in {"edges", "locations"}:
            query_text = normalize_location_query(raw_query, optional=True)
            facts = (
                self._collect_locations(query_text)
                if operation == "locations"
                else self._collect_edges(query_text)
            )
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
                    raise InvalidInputError("peering requires an ASN")
                facts = self._collect_peering(
                    query.asn or 0, include_relationship_context=True
                )
            elif operation == "path":
                if query.kind not in {"hostname", "ip"}:
                    raise InvalidInputError("path requires a hostname or IP address")
                facts = self._collect_path(query)
            else:
                raise InvalidInputError(f"unknown operation: {operation}")

        if self._required_successes == 0:
            status = "unavailable"
        elif self.errors:
            status = "partial"
        else:
            status = "complete"
        return {
            "operation": operation,
            "query": normalized,
            "observed_at": self.observed_at,
            "status": status,
            "facts": facts,
            "inferences": self.inferences,
            "sources": self.sources,
            "errors": self.errors,
        }

    def _inspect(self, query: Query) -> dict[str, Any]:
        facts: dict[str, Any] = {
            "identity": {"kind": query.kind, "normalized": query.value}
        }
        if query.kind == "hostname":
            try:
                answers = socket.getaddrinfo(query.value, None, type=socket.SOCK_STREAM)
                addresses = sorted(
                    {
                        address
                        for item in answers
                        if isinstance(address := item[4][0], str)
                    },
                    key=lambda value: (":" in value, value),
                )
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
                self._error(
                    "investigation bound",
                    f"route evidence limited to 4 of {len(addresses)} DNS addresses",
                )
            if routed:
                facts["address_routing"] = routed
            return facts

        route = self._collect_route(query)
        facts.update(route)
        registration = self._collect_rdap(query)
        if registration is not None:
            facts["registration"] = registration
        if query.kind == "asn":
            facts["interconnection"] = self._collect_peering(
                query.asn or 0, include_relationship_context=False
            )
        return facts

    def _ripe(self, endpoint: str, resource: str, **params: Any) -> Any | None:
        query = {"resource": resource, **params}
        url = build_url(RIPESTAT_API, f"{endpoint}/data.json", query)
        payload = self._request(url, f"RIPEstat {endpoint}")
        return payload.get("data") if isinstance(payload, dict) else None

    def _collect_route(self, query: Query) -> dict[str, Any]:
        if query.kind == "hostname":
            raise InvalidInputError("route requires an IP address, prefix, or ASN")
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
            origins = [
                f"AS{int(value)}"
                for value in network_info.get("asns", [])
                if str(value).isdigit()
            ]
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
                    rpki.append(
                        {
                            "origin": origin,
                            "prefix": prefix,
                            "status": result.get("status", "unknown")
                            if isinstance(result, dict)
                            else "unknown",
                            "details": result,
                        }
                    )
        if rpki:
            facts["rpki"] = rpki
        if len(origins) > 1:
            self.inferences.append(
                {
                    "assessment": "multi-origin-observed",
                    "basis": f"RIPEstat network-info returned {len(origins)} origins for {prefix}",
                    "limitation": "This does not by itself identify intent, traffic share, or a route leak.",
                }
            )
        return facts

    def _collect_asn_route(self, query: Query) -> dict[str, Any]:
        announced = self._ripe("announced-prefixes", query.value)
        neighbours = self._ripe("asn-neighbours", query.value)
        prefixes = []
        if isinstance(announced, dict):
            prefixes = [
                item.get("prefix")
                for item in announced.get("prefixes", [])
                if item.get("prefix")
            ]
        route_sample = prefixes[0] if prefixes else None
        routing_status = (
            self._ripe("routing-status", route_sample) if route_sample else None
        )
        looking_glass = (
            self._ripe("looking-glass", route_sample) if route_sample else None
        )
        facts: dict[str, Any] = {
            "asn": query.value,
            "announced_prefixes": prefixes,
            "announcement_observation": {
                "query_starttime": announced.get("query_starttime"),
                "query_endtime": announced.get("query_endtime"),
                "earliest_time": announced.get("earliest_time"),
                "latest_time": announced.get("latest_time"),
                "meaning": "Prefixes observed during the RIPEstat source window, not an instantaneous routing-table snapshot.",
            }
            if isinstance(announced, dict)
            else None,
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
                rpki.append(
                    {
                        "origin": query.value,
                        "prefix": prefix,
                        "status": result.get("status", "unknown"),
                        "details": result,
                    }
                )
        if rpki:
            facts["rpki"] = rpki
        facts["rpki_coverage"] = {
            "announced_prefix_count": len(prefixes),
            "checked_prefix_count": len(rpki),
            "limit": MAX_RPKI_PREFIXES,
            "complete": len(prefixes) <= MAX_RPKI_PREFIXES
            and len(rpki) == len(prefixes),
        }
        if len(prefixes) > MAX_RPKI_PREFIXES:
            self._error(
                "investigation bound",
                f"RPKI validation limited to {MAX_RPKI_PREFIXES} of {len(prefixes)} announced prefixes",
            )
        self.inferences.append(
            {
                "assessment": "adjacency-only",
                "basis": "RIPEstat neighbour and looking-glass observations, when present",
                "limitation": "Observed BGP adjacency does not establish commercial peering or transit.",
            }
        )
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
            observations.extend(
                {
                    "collector": rrc.get("rrc") or rrc.get("location"),
                    "peer": peer.get("peer") or peer.get("asn"),
                    "origin": peer.get("asn_origin") or peer.get("origin"),
                    "as_path": peer.get("as_path") or peer.get("path"),
                }
                for peer in peers[:20]
                if isinstance(peer, dict)
            )
        return {
            "observation_count_returned": len(observations),
            "observations": observations,
        }

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
        payload = self._request(
            url,
            "responsible RIR RDAP"
            if query.kind != "hostname"
            else "responsible registry RDAP",
        )
        return _compact_rdap(payload) if isinstance(payload, dict) else None

    def _collect_peering(
        self,
        asn: int,
        *,
        include_relationship_context: bool,
        include_ix_facilities: bool = True,
    ) -> dict[str, Any]:
        net_url = build_url(PEERINGDB_API, "net", {"asn": asn})
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
                facts["observed_neighbours"] = (
                    self._ripe("asn-neighbours", f"AS{asn}") or []
                )
                self._add_transit_assessment()
            return facts

        network = min(networks, key=lambda item: int(item.get("id", 0)))
        net_id = network.get("id")
        if net_id is None:
            self._error(
                "PeeringDB net",
                f"ASN {asn} record did not contain a network ID",
                net_url,
            )
            return {
                "network": network,
                "direct_facilities": [],
                "ix_participation": [],
                "ix_facility_candidates": [],
            }

        netfac, netixlan = self._peering_memberships(int(net_id))
        facts = self._join_peering_records(
            network,
            networks,
            netfac,
            netixlan,
            include_ix_facilities=include_ix_facilities,
        )
        if include_relationship_context:
            neighbours = self._ripe("asn-neighbours", f"AS{asn}")
            if neighbours is not None:
                facts["observed_neighbours"] = self._summarize_neighbours(neighbours)
            self._add_transit_assessment()
        return facts

    @staticmethod
    def _records(payload: Any) -> list[dict[str, Any]]:
        """Return well-formed records from one PeeringDB response payload."""
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            return []
        return [item for item in payload["data"] if isinstance(item, dict)]

    def _peering_memberships(
        self, net_id: int
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Fetch direct facility and exchange memberships for one network ID."""
        netfac = self._request(
            build_url(PEERINGDB_API, "netfac", {"net_id": net_id}), "PeeringDB netfac"
        )
        netixlan = self._request(
            build_url(PEERINGDB_API, "netixlan", {"net_id": net_id}),
            "PeeringDB netixlan",
        )
        return self._records(netfac), self._records(netixlan)

    def _join_peering_records(
        self,
        network: dict[str, Any],
        candidates: list[dict[str, Any]],
        netfac: list[dict[str, Any]],
        netixlan: list[dict[str, Any]],
        *,
        include_ix_facilities: bool,
    ) -> dict[str, Any]:
        """Batch PeeringDB joins while retaining direct and IX evidence separately."""
        ix_ids = self._record_ids(netixlan, "ix_id")
        exchanges, ixfac = self._exchange_records(
            ix_ids, include_facilities=include_ix_facilities
        )
        direct_ids = self._record_ids(netfac, "fac_id")
        facilities = self._facility_records(
            direct_ids | self._record_ids(ixfac, "fac_id")
        )
        facility_by_id = self._indexed_records(facilities)
        ix_by_id = self._indexed_records(exchanges)
        return {
            "network": network,
            "network_candidates": candidates,
            "direct_facilities": [
                facility_by_id[key]
                for key in sorted(direct_ids)
                if key in facility_by_id
            ],
            "ix_participation": self._ix_participation(netixlan, ix_by_id),
            "ix_facility_candidates": self._ix_candidates(
                ixfac, ix_by_id, facility_by_id
            ),
        }

    @staticmethod
    def _record_ids(records: list[dict[str, Any]], field: str) -> set[int]:
        """Extract valid integer IDs from PeeringDB record fields."""
        return {
            int(record[field]) for record in records if record.get(field) is not None
        }

    @staticmethod
    def _indexed_records(records: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
        """Index PeeringDB records by their numeric ID."""
        return {
            int(record["id"]): record
            for record in records
            if record.get("id") is not None
        }

    def _exchange_records(
        self, ix_ids: set[int], *, include_facilities: bool
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Batch-fetch exchange and exchange-facility records."""
        if not ix_ids:
            return [], []
        joined = ",".join(str(value) for value in sorted(ix_ids))
        exchanges = self._request(
            build_url(PEERINGDB_API, "ix", {"id__in": joined}), "PeeringDB ix"
        )
        if not include_facilities:
            return self._records(exchanges), []
        ixfac = self._request(
            build_url(PEERINGDB_API, "ixfac", {"ix_id__in": joined}), "PeeringDB ixfac"
        )
        return self._records(exchanges), self._records(ixfac)

    def _facility_records(self, facility_ids: set[int]) -> list[dict[str, Any]]:
        """Batch-fetch every facility required for direct and IX correlations."""
        if not facility_ids:
            return []
        joined = ",".join(str(value) for value in sorted(facility_ids))
        payload = self._request(
            build_url(PEERINGDB_API, "fac", {"id__in": joined}), "PeeringDB fac"
        )
        return self._records(payload)

    @staticmethod
    def _ix_participation(
        records: list[dict[str, Any]], ix_by_id: dict[int, dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Format observed exchange participation without inferring facility residence."""
        return [
            {
                "ix_id": ix_id,
                "name": ix_by_id.get(ix_id, {}).get("name")
                if ix_id is not None
                else record.get("name"),
                "ipaddr4": record.get("ipaddr4"),
                "ipaddr6": record.get("ipaddr6"),
                "speed": record.get("speed"),
            }
            for record in records
            for ix_id in [
                int(record["ix_id"]) if record.get("ix_id") is not None else None
            ]
        ]

    @staticmethod
    def _ix_candidates(
        records: list[dict[str, Any]],
        ix_by_id: dict[int, dict[str, Any]],
        facility_by_id: dict[int, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Format IX facility candidates with their intentionally limited meaning."""
        return [
            {
                "ix_id": ix_id,
                "ix_name": ix_by_id.get(ix_id, {}).get("name")
                if ix_id is not None
                else None,
                "facility": facility_by_id.get(fac_id) if fac_id is not None else None,
                "evidence": "IX facility record; not direct ASN facility presence",
            }
            for record in records
            for fac_id in [
                int(record["fac_id"]) if record.get("fac_id") is not None else None
            ]
            for ix_id in [
                int(record["ix_id"]) if record.get("ix_id") is not None else None
            ]
        ]

    def _add_transit_assessment(self) -> None:
        self.inferences.append(
            {
                "assessment": "indeterminate",
                "question": "potentially transit-free",
                "basis": "Public facility, IX, and observed-neighbour records do not encode complete commercial relationships.",
                "next_evidence": "Corroborate with CAIDA AS relationships, route-server policy, and official network statements.",
            }
        )

    def _collect_edges(self, query: str = "") -> dict[str, Any]:
        payload = self._request(STATUSPAGE_COMPONENTS, "F5 Statuspage components")
        components = payload.get("components", []) if isinstance(payload, dict) else []
        group_pattern = re.compile(r"regional\s+edges?|\bpops?\b", re.IGNORECASE)
        groups = {
            item.get("id"): item.get("name")
            for item in components
            if item.get("group") is True
            and group_pattern.search(str(item.get("name", "")))
        }
        edges = []
        query_lower = query.casefold()
        for item in components:
            if item.get("group") is True or item.get("group_id") not in groups:
                continue
            name = str(item.get("name", ""))
            group = str(groups[item.get("group_id")] or "")
            metro, country = _component_place(name)
            record = {
                "id": item.get("id"),
                "name": item.get("name"),
                "status": item.get("status"),
                "group": groups[item.get("group_id")],
                "region": _component_region(group),
                "metro": metro,
                "country": country,
                "site_codes": _site_codes(name),
                "updated_at": item.get("updated_at"),
                "published_location": _published_location(item),
            }
            searchable = " ".join(
                [
                    str(record["name"]),
                    str(record["group"]),
                    str(record["region"]),
                    str(record["metro"]),
                    str(record["country"]),
                    *record["site_codes"],
                ]
            ).casefold()
            if not query_lower or query_lower in searchable:
                edges.append(record)
        return {
            "regional_edge_groups": [
                {"id": key, "name": value} for key, value in groups.items()
            ],
            "edge_components": edges,
        }

    def _wikidata_metro_candidates(
        self, edges: list[dict[str, Any]]
    ) -> dict[tuple[str, str], list[dict[str, Any]]]:
        """Resolve representative metro points in one request-scoped Wikidata query."""
        metros = sorted(
            {
                str(edge.get("metro", "")).strip()
                for edge in edges
                if str(edge.get("metro", "")).strip()
            },
            key=str.casefold,
        )
        if len(metros) > MAX_WIKIDATA_METROS:
            self._error(
                "investigation bound",
                f"Wikidata metro lookup is limited to {MAX_WIKIDATA_METROS} unique names per request",
            )
            metros = metros[:MAX_WIKIDATA_METROS]
        if not metros:
            return {}
        values = " ".join(
            f"{json.dumps(metro, ensure_ascii=False)}@en" for metro in metros
        )
        query = f"""
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?place ?metroLabel ?countryLabel ?coordinate WHERE {{
  VALUES ?metroLabel {{ {values} }}
  ?place rdfs:label ?metroLabel ; wdt:P625 ?coordinate .
  OPTIONAL {{
    ?place wdt:P17 ?country .
    ?country rdfs:label ?countryLabel .
    FILTER(LANG(?countryLabel) = "en")
  }}
}}
ORDER BY ?metroLabel ?place
""".strip()
        url = build_url(
            WIKIDATA_QUERY_SERVICE, "sparql", {"query": query, "format": "json"}
        )
        payload = self._request(url, "Wikidata SPARQL", required=False)
        bindings = (
            payload.get("results", {}).get("bindings", [])
            if isinstance(payload, dict)
            else []
        )
        result: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for binding in bindings if isinstance(bindings, list) else []:
            if not isinstance(binding, dict):
                continue
            metro = str(binding.get("metroLabel", {}).get("value", "")).strip()
            country = str(binding.get("countryLabel", {}).get("value", "")).strip()
            point = _wikidata_point(
                binding.get("coordinate", {}).get("value")
                if isinstance(binding.get("coordinate"), dict)
                else None
            )
            entity = str(binding.get("place", {}).get("value", ""))
            entity_match = re.fullmatch(
                r"https?://www\.wikidata\.org/entity/(Q[1-9][0-9]*)", entity
            )
            if not metro or not point or not entity_match:
                continue
            candidate = {
                "id": entity_match.group(1),
                "metro": metro,
                "country": country,
                "longitude": point[0],
                "latitude": point[1],
                "url": f"https://www.wikidata.org/wiki/{entity_match.group(1)}",
            }
            key = (metro.casefold(), country.casefold())
            if candidate not in result.setdefault(key, []):
                result[key].append(candidate)
        return result

    @staticmethod
    def _matching_facilities(
        edge: dict[str, Any], facilities: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Return direct metro and stronger live site-code facility correlations."""
        metro = str(edge.get("metro", "")).casefold()
        direct_metro = [
            facility
            for facility in facilities
            if metro
            and (
                metro in str(facility.get("city", "")).casefold()
                or metro in str(facility.get("name", "")).casefold()
            )
        ]
        exact = [
            facility
            for facility in direct_metro
            if any(
                re.search(
                    rf"(?<![a-z0-9]){re.escape(code)}(?![a-z0-9])",
                    str(facility.get("name", "")),
                    re.IGNORECASE,
                )
                for code in edge.get("site_codes", [])
            )
        ]
        return direct_metro, exact

    def _location_sources(
        self,
        edge: dict[str, Any],
        coordinate_source: dict[str, Any] | None = None,
    ) -> list[dict[str, str]]:
        """Build render_map provenance from sources consulted in this invocation."""
        result = [
            {
                "url": STATUSPAGE_COMPONENTS,
                "sourceName": "F5 Statuspage components",
                "observedAt": self.observed_at,
                "claim": f"The current Regional Edge component is published as {edge.get('name')!r} in {edge.get('group')!r}.",
            }
        ]
        if coordinate_source:
            coordinate_claim = str(coordinate_source["claim"])
            if coordinate_source["url"] == STATUSPAGE_COMPONENTS:
                result[0]["claim"] += f" {coordinate_claim}"
            else:
                result.append(
                    {
                        "url": str(coordinate_source["url"]),
                        "sourceName": str(coordinate_source["sourceName"]),
                        "observedAt": self.observed_at,
                        "claim": coordinate_claim,
                    }
                )
        return result

    def _collect_locations(  # pylint: disable=too-many-locals
        self, query: str = ""
    ) -> dict[str, Any]:
        """Return current Regional Edge evidence normalized for render_map."""
        edge_facts = self._collect_edges(query)
        edges = edge_facts["edge_components"]
        peering = self._collect_peering(
            35280,
            include_relationship_context=False,
            include_ix_facilities=False,
        )
        facilities = peering.get("direct_facilities", [])
        wikidata = self._wikidata_metro_candidates(edges)
        records: list[dict[str, Any]] = []
        map_locations: list[dict[str, Any]] = []

        for index, edge in enumerate(edges):
            direct_metro, exact = self._matching_facilities(edge, facilities)
            published = edge.get("published_location", {})
            location: dict[str, Any] = {
                "id": _location_id(edge.get("id"), index),
                "label": str(edge.get("name") or f"Regional Edge {index + 1}"),
                "precision": "unresolved",
                "resolution": "unresolved",
                "confidence": "unknown",
                "sources": self._location_sources(edge),
            }
            coordinate_source: dict[str, Any] | None = None
            published_point = _coordinate(published)
            exact_point = _coordinate(exact[0]) if len(exact) == 1 else None
            direct_point = (
                _coordinate(direct_metro[0]) if len(direct_metro) == 1 else None
            )
            if published_point:
                location.update(
                    {
                        "longitude": published_point[0],
                        "latitude": published_point[1],
                        "precision": "approximate",
                        "resolution": "resolved",
                        "confidence": "high",
                    }
                )
                coordinate_source = {
                    "url": STATUSPAGE_COMPONENTS,
                    "sourceName": "F5 Statuspage components",
                    "claim": "The current component record publishes this coordinate.",
                }
            elif exact_point:
                facility_id = exact[0].get("id")
                location.update(
                    {
                        "longitude": exact_point[0],
                        "latitude": exact_point[1],
                        "precision": "inferred",
                        "resolution": "candidate",
                        "confidence": "medium",
                    }
                )
                coordinate_source = {
                    "url": f"https://www.peeringdb.com/fac/{facility_id}",
                    "sourceName": "PeeringDB facility",
                    "claim": "This coordinate belongs to the sole direct AS35280 facility whose current name matches the live site code; it remains a facility candidate, not proven service placement.",
                }
            elif direct_point:
                facility_id = direct_metro[0].get("id")
                location.update(
                    {
                        "longitude": direct_point[0],
                        "latitude": direct_point[1],
                        "precision": "inferred",
                        "resolution": "candidate",
                        "confidence": "low",
                    }
                )
                coordinate_source = {
                    "url": f"https://www.peeringdb.com/fac/{facility_id}",
                    "sourceName": "PeeringDB facility",
                    "claim": "This coordinate belongs to the sole current direct AS35280 facility found in the metro; it is an indirect candidate and does not prove Regional Edge placement.",
                }
            else:
                key = (
                    str(edge.get("metro", "")).casefold(),
                    str(edge.get("country", "")).casefold(),
                )
                candidates = wikidata.get(key, [])
                if not candidates and not key[1]:
                    candidates = [
                        candidate
                        for (metro, _country), values in wikidata.items()
                        if metro == key[0]
                        for candidate in values
                    ]
                unique = {candidate["id"]: candidate for candidate in candidates}
                if len(unique) == 1:
                    candidate = next(iter(unique.values()))
                    location.update(
                        {
                            "longitude": candidate["longitude"],
                            "latitude": candidate["latitude"],
                            "precision": "metro",
                            "resolution": "ambiguous"
                            if len(direct_metro) > 1
                            else "approximate",
                            "confidence": "medium",
                        }
                    )
                    coordinate_source = {
                        "url": candidate["url"],
                        "sourceName": "Wikidata Query Service entity",
                        "claim": "This is a current representative metro coordinate; it does not identify an F5 facility or service placement.",
                    }
            if coordinate_source:
                location["sources"] = self._location_sources(edge, coordinate_source)
            record = {
                "component": edge,
                "direct_metro_facilities": direct_metro,
                "site_code_facility_candidates": exact,
                "placement_assessment": (
                    "candidate"
                    if len(exact) == 1 or len(direct_metro) == 1
                    else "ambiguous"
                    if len(exact) > 1 or len(direct_metro) > 1
                    else "unresolved"
                ),
                "map_location": location,
            }
            records.append(record)
            map_locations.append(location)

        return {
            "regional_edge_groups": edge_facts["regional_edge_groups"],
            "location_records": records,
            "map_locations": map_locations,
            "as35280_network": peering.get("network"),
            "ix_participation": peering.get("ix_participation", []),
            "source_hints": {
                "instructions": "skill://cloudstatus:location/references/source-hints.md",
                "durable_cache": False,
            },
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

        codes = list(
            dict.fromkeys(
                code for edge in matching_edges for code in edge.get("site_codes", [])
            )
        )
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
                term
                and (
                    term in str(facility.get("city", "")).casefold()
                    or term in str(facility.get("name", "")).casefold()
                )
                for term in metro_terms
            )
        ]
        exact = [
            facility
            for facility in direct_metro
            if any(
                re.search(
                    rf"(?<![a-z0-9]){re.escape(code)}(?![a-z0-9])",
                    str(facility.get("name", "")),
                    re.IGNORECASE,
                )
                for code in codes
            )
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
            self.inferences.append(
                {
                    "assessment": "strongest-public-correlation",
                    "basis": "A site code visible in a live F5 component name also appears in a facility where AS35280 has direct PeeringDB presence.",
                    "candidates": [facility.get("name") for facility in exact],
                    "limitation": "This is not proof that a particular F5 service instance occupies that building.",
                }
            )
        elif len(direct_metro) > 1:
            self.inferences.append(
                {
                    "assessment": "unresolved",
                    "basis": "AS35280 has direct presence at multiple facilities in the metro and no exact live site-code match selects one.",
                    "candidates": [facility.get("name") for facility in direct_metro],
                    "limitation": "Metro presence does not establish the Regional Edge building.",
                }
            )
        elif len(direct_metro) == 1:
            self.inferences.append(
                {
                    "assessment": "direct-as-metro-presence",
                    "basis": "AS35280 has direct PeeringDB facility presence in the metro.",
                    "candidates": [direct_metro[0].get("name")],
                    "limitation": "The exact Regional Edge building remains unproven.",
                }
            )
        else:
            self.inferences.append(
                {
                    "assessment": "unresolved",
                    "basis": "No direct AS35280 facility record converged with the live F5 component evidence.",
                    "limitation": "IX participation or a facility candidate alone cannot locate an F5 Regional Edge.",
                }
            )
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
            self._error(
                "active diagnostics", "neither tracepath nor traceroute is installed"
            )

        mtr = shutil.which("mtr")
        if mtr:
            probes.append(("mtr", [mtr, "--report", "--report-cycles", "5", target]))
        else:
            self._error("active diagnostics", "mtr is not installed")

        for name, args in [probe for probe in probes if probe is not None]:
            remaining = DIAGNOSTIC_TIMEOUT - (time.monotonic() - start)
            if remaining <= 0:
                self._error(
                    "active diagnostics",
                    "aggregate diagnostic timeout reached before all probes ran",
                )
                break
            try:
                # Commands are from shutil.which and all target values were
                # normalized before this method; no shell is ever invoked.
                result = subprocess.run(  # noqa: S603
                    args,
                    capture_output=True,
                    text=True,
                    timeout=remaining,
                    check=False,
                )
                facts["diagnostics"].append(
                    {
                        "tool": name,
                        "arguments": args[1:-1],
                        "returncode": result.returncode,
                        "stdout": _plain_text(result.stdout),
                        "stderr": _plain_text(result.stderr),
                    }
                )
                self._source(
                    f"local {name}",
                    f"diagnostic://{name}/{urllib.parse.quote(target, safe='')}",
                    required=False,
                )
                if result.returncode != 0:
                    self._error(
                        "active diagnostics",
                        f"{name} exited {result.returncode}; ICMP filtering, policy, routing, or privileges may limit the result",
                    )
            except subprocess.TimeoutExpired as error:
                facts["diagnostics"].append(
                    {
                        "tool": name,
                        "arguments": args[1:-1],
                        "timed_out": True,
                        "stdout": _plain_text(error.stdout),
                        "stderr": _plain_text(error.stderr),
                    }
                )
                self._error(
                    "active diagnostics",
                    f"{name} reached the aggregate diagnostic timeout",
                )
                break
            except OSError as error:
                self._error("active diagnostics", f"could not execute {name}: {error}")
        return facts


def invalid_report(operation: str, query: str, message: str) -> dict[str, Any]:
    """Build the machine-readable result for a rejected command-line query."""
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
    """Map report availability to the documented command exit status."""
    if report.get("status") == "invalid":
        return 2
    if report.get("status") == "unavailable":
        return 3
    return 0


def _compact_component(edge: dict[str, Any]) -> dict[str, Any]:
    """Return public component evidence without retaining source payload fields."""
    return {
        key: edge.get(key)
        for key in (
            "id",
            "name",
            "status",
            "group",
            "region",
            "metro",
            "country",
            "site_codes",
        )
    }


def _compact_facility(
    facility: dict[str, Any], classification: str, coordinate_provenance: str
) -> dict[str, Any]:
    """Keep only a facility candidate's map-relevant, non-sensitive evidence."""
    return {
        "id": facility.get("id"),
        "name": facility.get("name"),
        "metro": facility.get("city"),
        "country": facility.get("country"),
        "classification": classification,
        "coordinate_provenance": coordinate_provenance,
    }


def compact_locations_report(report: dict[str, Any]) -> dict[str, Any]:
    """Create the stable, render-oriented locations map-v1 response."""
    facts = report.get("facts", {})
    evidence: list[dict[str, Any]] = []
    for record in facts.get("location_records", []):
        candidates = [
            _compact_facility(item, "direct-metro", "PeeringDB facility")
            for item in record.get("direct_metro_facilities", [])
        ]
        for item in record.get("site_code_facility_candidates", []):
            compact = _compact_facility(item, "site-code", "PeeringDB facility")
            if compact not in candidates:
                candidates.append(compact)
        evidence.append(
            {
                "component": _compact_component(record.get("component", {})),
                "placement_assessment": record.get("placement_assessment"),
                "facility_candidates": candidates,
                "coordinate_provenance": [
                    {
                        "source_name": source.get("sourceName"),
                        "url": source.get("url"),
                        "claim": source.get("claim"),
                    }
                    for source in record.get("map_location", {}).get("sources", [])
                ],
                "limitations": [
                    "Facility candidates and metro coordinates do not prove Regional Edge service placement."
                ],
            }
        )
    return {
        "schema": "cloudstatus.locations/v1",
        "observed_at": report.get("observed_at"),
        "query": report.get("query"),
        "status": report.get("status"),
        "map_locations": facts.get("map_locations", []),
        "evidence": evidence,
        "sources": report.get("sources", []),
        "inferences": report.get("inferences", []),
        "errors": report.get("errors", []),
    }


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser for supported lookup operations."""
    parser = argparse.ArgumentParser(
        description="Collect live Internet and F5 network evidence"
    )
    subparsers = parser.add_subparsers(dest="operation", required=True)
    for operation in ("inspect", "route", "peering", "location", "path"):
        command = subparsers.add_parser(operation)
        command.add_argument("query")
    for operation in ("edges", "locations"):
        command = subparsers.add_parser(operation)
        command.add_argument("query", nargs="?", default="")
        if operation == "locations":
            command.add_argument("--format", choices=("full", "map-v1"), default="full")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run the command-line collector and write exactly one JSON report."""
    arguments = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    try:
        namespace = parser.parse_args(arguments)
    except SystemExit as error:
        return error.code if isinstance(error.code, int) else 2
    operation = namespace.operation
    query = namespace.query
    try:
        report = Investigator().run(operation, query)
    except InvalidInputError as error:
        report = invalid_report(operation, query, str(error))
    if getattr(namespace, "format", "full") == "map-v1":
        report = compact_locations_report(report)
    print(json.dumps(report, indent=2, sort_keys=False, ensure_ascii=False))  # noqa: T201
    return exit_code(report)


if __name__ == "__main__":
    raise SystemExit(main())
