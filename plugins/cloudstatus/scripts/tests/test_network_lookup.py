"""Hermetic unit tests for the cloudstatus network lookup engine."""

from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import subprocess
import sys
import unittest
import urllib.error
from email.message import Message
from types import ModuleType
from typing import Any
from unittest import mock

PLUGIN_ROOT = pathlib.Path(__file__).resolve().parents[2]
ENGINE_PATH = PLUGIN_ROOT / "skills/network-intelligence/scripts/network_lookup.py"


def load_engine() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "cloudstatus_network_lookup", ENGINE_PATH
    )
    if spec is None or spec.loader is None:
        message = f"cannot load {ENGINE_PATH}"
        raise RuntimeError(message)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeHttp:
    def __init__(
        self,
        engine: Any,
        fixtures: dict[str, Any] | None = None,
        failures: dict[str, str] | None = None,
    ) -> None:
        self.engine = engine
        self.fixtures = fixtures or {}
        self.failures = failures or {}
        self.calls: list[tuple[str, str]] = []

    def get_json(self, url: str, source: str) -> Any:
        self.calls.append((url, source))
        for needle, message in self.failures.items():
            if needle in url:
                raise self.engine.SourceError(source, message)
        for needle, value in self.fixtures.items():
            if needle in url:
                return value
        raise self.engine.SourceError(source, f"unexpected fixture URL: {url}")


class EngineTestCase(unittest.TestCase):
    """Test case that loads one isolated copy of the lookup engine."""

    engine: Any

    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = load_engine()


class NormalizationTests(EngineTestCase):
    def test_hostname_ip_prefix_and_asn_normalization(self):
        cases = {
            "Example.COM.": ("hostname", "example.com"),
            "2001:0db8::1": ("ip", "2001:db8::1"),
            "203.0.113.19/24": ("prefix", "203.0.113.0/24"),
            "as035280": ("asn", "AS35280"),
            "35280": ("asn", "AS35280"),
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                query = self.engine.normalize_query(raw)
                self.assertEqual((query.kind, query.value), expected)

    def test_hostile_input_is_rejected(self):
        for value in (
            "example.com;touch /tmp/pwn",
            "$(id)",
            "-n",
            "AS0",
            "AS4294967296",
        ):
            with (
                self.subTest(value=value),
                self.assertRaises(self.engine.InvalidInputError),
            ):
                self.engine.normalize_query(value)

    def test_query_parameters_are_url_encoded(self):
        url = self.engine.build_url(
            "https://fixture.test",
            "route",
            {"resource": "203.0.113.0/24", "query": "two words"},
        )
        self.assertIn("resource=203.0.113.0%2F24", url)
        self.assertIn("query=two%20words", url)


class HttpClientTests(EngineTestCase):
    def test_rate_limit_retry_timeout_cap_and_memoization(self):
        headers = Message()
        headers["Retry-After"] = "99"
        error = urllib.error.HTTPError(
            "https://fixture.test/data", 429, "slow down", headers, io.BytesIO(b"{}")
        )
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"ok": true}'
        response.__enter__.return_value.headers.get_content_charset.return_value = (
            "utf-8"
        )

        with (
            mock.patch.object(
                self.engine.urllib.request, "urlopen", side_effect=[error, response]
            ) as urlopen,
            mock.patch.object(self.engine.time, "sleep") as sleep,
        ):
            client = self.engine.HttpClient()
            first = client.get_json("https://fixture.test/data", "fixture")
            second = client.get_json("https://fixture.test/data", "fixture")

        self.assertEqual(first, {"ok": True})
        self.assertIs(first, second)
        self.assertEqual(urlopen.call_count, 2)
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 15)
        sleep.assert_called_once_with(10)

    def test_stops_after_three_server_failures(self):
        error = urllib.error.HTTPError(
            "https://fixture.test/data", 503, "down", Message(), io.BytesIO(b"{}")
        )
        with (
            mock.patch.object(
                self.engine.urllib.request, "urlopen", side_effect=error
            ) as urlopen,
            mock.patch.object(self.engine.time, "sleep"),
            self.assertRaises(self.engine.SourceError),
        ):
            self.engine.HttpClient().get_json("https://fixture.test/data", "fixture")
        self.assertEqual(urlopen.call_count, 3)


class RdapTests(EngineTestCase):
    def test_rdap_bootstrap_selects_responsible_service(self):
        fixtures = {
            "ipv4.json": {
                "services": [["203.0.113.0/24"], ["https://rdap.example.net/"]]
            },
            "asn.json": {
                "services": [["64496-64510"], ["https://rdap-asn.example.net/"]]
            },
            "dns.json": {"services": [["com"], ["https://rdap-domain.example.net/"]]},
        }
        http = FakeHttp(self.engine, fixtures)
        resolver = self.engine.RdapResolver(http)
        self.assertEqual(
            resolver.base_for(self.engine.normalize_query("203.0.113.9")),
            "https://rdap.example.net/",
        )
        self.assertEqual(
            resolver.base_for(self.engine.normalize_query("AS64497")),
            "https://rdap-asn.example.net/",
        )
        self.assertEqual(
            resolver.base_for(self.engine.normalize_query("www.example.com")),
            "https://rdap-domain.example.net/",
        )


class RoutingTests(EngineTestCase):
    def test_bgp_multi_origin_and_rpki_states(self):
        fixtures = {
            "network-info": {
                "data": {"prefix": "203.0.113.0/24", "asns": [64496, 64497]}
            },
            "routing-status": {
                "data": {"visibility": {"v4": {"ris_peers_seeing": 12}}}
            },
            "looking-glass": {
                "data": {
                    "rrcs": [
                        {
                            "rrc": "RRC00",
                            "peers": [
                                {"asn_origin": "64496", "as_path": "64500 64496"}
                            ],
                        }
                    ]
                }
            },
            "resource=AS64496&prefix=": {
                "data": {"status": "valid", "validating_roas": [{"origin": "AS64496"}]}
            },
            "resource=AS64497&prefix=": {
                "data": {"status": "invalid", "invalid_asn": True}
            },
        }
        investigator = self.engine.Investigator(http=FakeHttp(self.engine, fixtures))
        report = investigator.run("route", "203.0.113.7")
        self.assertEqual(report["facts"]["route"]["origins"], ["AS64496", "AS64497"])
        self.assertEqual(
            [item["status"] for item in report["facts"]["rpki"]], ["valid", "invalid"]
        )
        self.assertEqual(report["status"], "complete")

    def test_asn_route_exposes_source_window_and_bounds_neighbour_detail(self):
        neighbours = [
            {"asn": 64500 + index, "type": "left"}
            for index in range(self.engine.MAX_NEIGHBOUR_DETAILS + 5)
        ]
        fixtures = {
            "announced-prefixes": {
                "data": {
                    "prefixes": [{"prefix": "203.0.113.0/24"}],
                    "query_starttime": "2026-07-30T00:00:00",
                    "query_endtime": "2026-08-13T00:00:00",
                    "earliest_time": "2026-07-30T00:00:00",
                    "latest_time": "2026-08-13T00:00:00",
                }
            },
            "asn-neighbours": {
                "data": {
                    "neighbours": neighbours,
                    "neighbour_counts": {"left": len(neighbours)},
                }
            },
            "routing-status": {"data": {}},
            "looking-glass": {"data": {"rrcs": []}},
            "rpki-validation": {"data": {"status": "valid"}},
        }
        report = self.engine.Investigator(http=FakeHttp(self.engine, fixtures)).run(
            "route", "AS64496"
        )

        observation = report["facts"]["announcement_observation"]
        self.assertEqual(observation["query_starttime"], "2026-07-30T00:00:00")
        self.assertIn("not an instantaneous", observation["meaning"])
        summary = report["facts"]["observed_neighbours"]
        self.assertEqual(summary["detail_count"], self.engine.MAX_NEIGHBOUR_DETAILS)
        self.assertEqual(summary["detail_omitted"], 5)
        self.assertEqual(report["facts"]["rpki_coverage"]["checked_prefix_count"], 1)
        self.assertEqual(report["status"], "partial")
        self.assertTrue(
            any(error["source"] == "investigation bound" for error in report["errors"])
        )


class PeeringTests(EngineTestCase):
    def peering_fixtures(self):
        return {
            "net?asn=35280": {
                "data": [{"id": 777, "asn": 35280, "name": "F5 fixture"}]
            },
            "netfac?net_id=777": {"data": [{"fac_id": 10}, {"fac_id": 11}]},
            "fac?id__in=10%2C11": {
                "data": [
                    {
                        "id": 10,
                        "name": "Fixture FR4",
                        "city": "Frankfurt",
                        "country": "DE",
                        "address1": "Live street 1",
                    },
                    {
                        "id": 11,
                        "name": "Fixture FRA campus",
                        "city": "Frankfurt",
                        "country": "DE",
                        "address1": "Live street 2",
                    },
                ]
            },
            "netixlan?net_id=777": {
                "data": [{"ix_id": 20, "name": "Fixture IX", "ipaddr4": "192.0.2.1"}]
            },
            "ix?id__in=20": {"data": [{"id": 20, "name": "Fixture IX"}]},
            "ixfac?ix_id__in=20": {"data": [{"ix_id": 20, "fac_id": 11}]},
        }

    def test_resolves_net_id_and_batches_facility_addresses(self):
        http = FakeHttp(self.engine, self.peering_fixtures())
        report = self.engine.Investigator(http=http).run("peering", "AS35280")
        self.assertEqual(report["facts"]["network"]["id"], 777)
        self.assertEqual(
            report["facts"]["direct_facilities"][0]["address1"], "Live street 1"
        )
        facility_calls = [url for url, _ in http.calls if "/fac?" in url]
        self.assertEqual(len(facility_calls), 1)
        self.assertIn("id__in=10%2C11", facility_calls[0])
        self.assertIn("ix_facility_candidates", report["facts"])

    def test_location_keeps_ambiguous_metro_candidates_unresolved(self):
        fixtures = self.peering_fixtures() | {
            "components.json": {
                "components": [
                    {"id": "g1", "name": "Europe PoPs", "group": True},
                    {
                        "id": "c1",
                        "name": "Frankfurt, Germany",
                        "group": False,
                        "group_id": "g1",
                        "status": "operational",
                    },
                    {
                        "id": "c2",
                        "name": "London (ld8), United Kingdom",
                        "group": False,
                        "group_id": "g1",
                        "status": "operational",
                    },
                ]
            },
        }
        report = self.engine.Investigator(http=FakeHttp(self.engine, fixtures)).run(
            "location", "Frankfurt"
        )
        self.assertEqual(report["facts"]["edge_components"][0]["site_codes"], [])
        self.assertEqual(len(report["facts"]["direct_metro_facilities"]), 2)
        self.assertEqual(report["inferences"][0]["assessment"], "unresolved")
        self.assertNotIn("exact_facility", report["facts"])


class LocationInventoryTests(EngineTestCase):
    def peering_fixtures(self):
        return PeeringTests.peering_fixtures(self)

    def base_fixtures(self):
        return {
            "components.json": {
                "components": [
                    {
                        "id": "group-fixture",
                        "name": "Example Region Regional Edges",
                        "group": True,
                    },
                    {
                        "id": "edge-fv1",
                        "name": "Fixtureville (fv1), Exampleland",
                        "group": False,
                        "group_id": "group-fixture",
                        "status": "operational",
                        "longitude": 12.25,
                        "latitude": 45.5,
                        "address": "Synthetic address from current fixture",
                    },
                    {
                        "id": "edge-sample",
                        "name": "Sampletown, Testland",
                        "group": False,
                        "group_id": "group-fixture",
                        "status": "operational",
                    },
                ]
            },
            "net?asn=35280": {
                "data": [{"id": 900, "asn": 35280, "name": "F5 synthetic"}]
            },
            "netfac?net_id=900": {"data": []},
            "netixlan?net_id=900": {"data": []},
            "query.wikidata.org": {
                "results": {
                    "bindings": [
                        {
                            "place": {
                                "value": "http://www.wikidata.org/entity/Q900001"
                            },
                            "metroLabel": {"value": "Sampletown"},
                            "countryLabel": {"value": "Testland"},
                            "coordinate": {"value": "Point(-73.5 40.25)"},
                        }
                    ]
                }
            },
        }

    def test_global_inventory_normalizes_published_and_live_metro_coordinates(self):
        report = self.engine.Investigator(
            http=FakeHttp(self.engine, self.base_fixtures())
        ).run("locations", "")

        locations = report["facts"]["map_locations"]
        self.assertEqual(len(locations), 2)
        self.assertEqual(locations[0]["precision"], "approximate")
        self.assertEqual(locations[0]["longitude"], 12.25)
        self.assertEqual(locations[1]["precision"], "metro")
        self.assertEqual(locations[1]["resolution"], "approximate")
        self.assertEqual(locations[1]["latitude"], 40.25)
        self.assertEqual(
            report["facts"]["location_records"][0]["component"]["published_location"][
                "address"
            ],
            "Synthetic address from current fixture",
        )
        for location in locations:
            for source in location["sources"]:
                self.assertTrue(source["url"].startswith("https://"))
                self.assertTrue(source["sourceName"])
                self.assertEqual(source["observedAt"], report["observed_at"])
                self.assertTrue(source["claim"])

    def test_country_region_metro_site_code_and_component_queries(self):
        fixtures = self.base_fixtures()
        for query in (
            "Exampleland",
            "Fixtureville",
            "fv1",
            "Fixtureville (fv1)",
        ):
            with self.subTest(query=query):
                report = self.engine.Investigator(
                    http=FakeHttp(self.engine, fixtures)
                ).run("locations", query)
                self.assertEqual(len(report["facts"]["map_locations"]), 1)
                self.assertEqual(report["facts"]["map_locations"][0]["id"], "edge-fv1")
        region = self.engine.Investigator(http=FakeHttp(self.engine, fixtures)).run(
            "locations", "Example Region"
        )
        self.assertEqual(len(region["facts"]["map_locations"]), 2)

    def test_multiple_facilities_remain_ambiguous_at_a_metro_point(self):
        fixtures = self.base_fixtures()
        fixtures["components.json"]["components"] = [
            fixtures["components.json"]["components"][0],
            {
                "id": "edge-dual",
                "name": "Dualtown, Testland",
                "group": False,
                "group_id": "group-fixture",
                "status": "operational",
            },
        ]
        fixtures["netfac?net_id=900"] = {"data": [{"fac_id": 41}, {"fac_id": 42}]}
        fixtures["fac?id__in=41%2C42"] = {
            "data": [
                {"id": 41, "name": "Synthetic One", "city": "Dualtown"},
                {"id": 42, "name": "Synthetic Two", "city": "Dualtown"},
            ]
        }
        fixtures["query.wikidata.org"] = {
            "results": {
                "bindings": [
                    {
                        "place": {"value": "http://www.wikidata.org/entity/Q900002"},
                        "metroLabel": {"value": "Dualtown"},
                        "countryLabel": {"value": "Testland"},
                        "coordinate": {"value": "Point(5 6)"},
                    }
                ]
            }
        }

        record = self.engine.Investigator(http=FakeHttp(self.engine, fixtures)).run(
            "locations", "Dualtown"
        )["facts"]["location_records"][0]
        self.assertEqual(record["placement_assessment"], "ambiguous")
        self.assertEqual(len(record["direct_metro_facilities"]), 2)
        self.assertEqual(record["map_location"]["resolution"], "ambiguous")
        self.assertEqual(record["map_location"]["precision"], "metro")

    def test_single_direct_metro_facility_is_an_inferred_candidate(self):
        fixtures = self.base_fixtures()
        fixtures["components.json"]["components"] = [
            fixtures["components.json"]["components"][0],
            {
                "id": "edge-candidate",
                "name": "Candidatetown, Testland",
                "group": False,
                "group_id": "group-fixture",
                "status": "operational",
            },
        ]
        fixtures["netfac?net_id=900"] = {"data": [{"fac_id": 51}]}
        fixtures["fac?id__in=51"] = {
            "data": [
                {
                    "id": 51,
                    "name": "Synthetic Facility",
                    "city": "Candidatetown",
                    "longitude": 8,
                    "latitude": 9,
                }
            ]
        }
        fixtures["query.wikidata.org"] = {"results": {"bindings": []}}

        record = self.engine.Investigator(http=FakeHttp(self.engine, fixtures)).run(
            "locations", "Candidatetown"
        )["facts"]["location_records"][0]
        self.assertEqual(record["placement_assessment"], "candidate")
        self.assertEqual(record["map_location"]["precision"], "inferred")
        self.assertEqual(record["map_location"]["resolution"], "candidate")
        self.assertEqual(record["map_location"]["confidence"], "low")

    def test_unresolved_result_is_preserved_without_coordinates(self):
        fixtures = self.base_fixtures()
        fixtures["components.json"]["components"] = [
            fixtures["components.json"]["components"][0],
            {
                "id": "edge-unresolved",
                "name": "Unresolved Place, Testland",
                "group": False,
                "group_id": "group-fixture",
                "status": "operational",
            },
        ]
        fixtures["query.wikidata.org"] = {"results": {"bindings": []}}

        location = self.engine.Investigator(http=FakeHttp(self.engine, fixtures)).run(
            "locations", "Unresolved"
        )["facts"]["map_locations"][0]
        self.assertEqual(location["precision"], "unresolved")
        self.assertEqual(location["resolution"], "unresolved")
        self.assertNotIn("longitude", location)
        self.assertNotIn("latitude", location)

    def test_site_codes_are_extracted_only_from_live_component_names(self):
        fixtures = self.peering_fixtures() | {
            "components.json": {
                "components": [
                    {"id": "g1", "name": "Europe Regional Edges", "group": True},
                    {
                        "id": "c1",
                        "name": "Frankfurt (fr4), Germany",
                        "group": False,
                        "group_id": "g1",
                        "status": "operational",
                    },
                ]
            },
        }
        report = self.engine.Investigator(http=FakeHttp(self.engine, fixtures)).run(
            "location", "fr4"
        )
        self.assertEqual(report["facts"]["edge_components"][0]["site_codes"], ["fr4"])
        self.assertEqual(
            report["inferences"][0]["assessment"], "strongest-public-correlation"
        )

    def test_absent_location_evidence_remains_unresolved(self):
        fixtures = {
            "components.json": {
                "components": [
                    {"id": "g1", "name": "Europe PoPs", "group": True},
                    {
                        "id": "c1",
                        "name": "Nowhere, Example",
                        "group": False,
                        "group_id": "g1",
                        "status": "operational",
                    },
                ]
            },
            "net?asn=35280": {"data": []},
        }
        report = self.engine.Investigator(http=FakeHttp(self.engine, fixtures)).run(
            "location", "Nowhere"
        )
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["facts"]["direct_metro_facilities"], [])
        self.assertEqual(report["inferences"][0]["assessment"], "unresolved")


class FailureModeTests(EngineTestCase):
    def test_partial_source_failure_keeps_usable_results(self):
        http = FakeHttp(
            self.engine,
            {
                "components.json": {
                    "components": [{"id": "g", "name": "Europe PoPs", "group": True}]
                }
            },
            {"peeringdb.com": "throttled"},
        )
        report = self.engine.Investigator(http=http).run("edges", "Europe")
        self.assertEqual(report["status"], "complete")

        report = self.engine.Investigator(http=http).run("location", "Frankfurt")
        self.assertEqual(report["status"], "partial")
        self.assertTrue(report["errors"])

    def test_all_required_sources_unavailable_returns_exit_three(self):
        investigator = self.engine.Investigator(
            http=FakeHttp(self.engine, failures={"stat.ripe.net": "offline"})
        )
        report = investigator.run("route", "203.0.113.9")
        self.assertEqual(report["status"], "unavailable")
        self.assertEqual(self.engine.exit_code(report), 3)

    def test_invalid_cli_input_returns_exit_two_without_running_commands(self):
        with mock.patch.object(self.engine.subprocess, "run") as run:
            stdout = io.StringIO()
            with mock.patch("sys.stdout", stdout):
                code = self.engine.main(["path", "example.com; id"])
        self.assertEqual(code, 2)
        run.assert_not_called()
        self.assertEqual(json.loads(stdout.getvalue())["status"], "invalid")


class DiagnosticsTests(EngineTestCase):
    def test_probe_arguments_are_bounded_and_never_use_a_shell(self):
        calls = []

        def fake_run(args, **kwargs):
            calls.append((args, kwargs))
            return subprocess.CompletedProcess(args, 0, stdout="ok", stderr="")

        with (
            mock.patch.object(
                self.engine.shutil, "which", side_effect=lambda name: f"/usr/bin/{name}"
            ),
            mock.patch.object(self.engine.subprocess, "run", side_effect=fake_run),
        ):
            report = self.engine.Investigator().run("path", "example.com")

        commands = [args for args, _ in calls]
        self.assertIn(["/usr/bin/ping", "-c", "4", "example.com"], commands)
        self.assertIn(["/usr/bin/tracepath", "-m", "30", "example.com"], commands)
        self.assertIn(
            ["/usr/bin/mtr", "--report", "--report-cycles", "5", "example.com"],
            commands,
        )
        self.assertTrue(all("shell" not in kwargs for _, kwargs in calls))
        self.assertEqual(report["status"], "complete")

    def test_traceroute_fallback_and_missing_binaries_are_limitations(self):
        available = {"traceroute": "/usr/bin/traceroute"}
        with (
            mock.patch.object(self.engine.shutil, "which", side_effect=available.get),
            mock.patch.object(
                self.engine.subprocess,
                "run",
                return_value=subprocess.CompletedProcess(
                    [], 0, stdout="trace", stderr=""
                ),
            ) as run,
        ):
            report = self.engine.Investigator().run("path", "192.0.2.1")

        self.assertEqual(
            run.call_args.args[0], ["/usr/bin/traceroute", "-m", "30", "192.0.2.1"]
        )
        self.assertEqual(report["status"], "partial")
        self.assertTrue(
            any("not installed" in item["message"] for item in report["errors"])
        )

    def test_aggregate_timeout_never_exceeds_45_seconds(self):
        clock = iter([100.0, 100.0, 130.0, 146.0, 146.0])

        def fake_run(args, **kwargs):
            assert kwargs["timeout"] > 0
            return subprocess.CompletedProcess(args, 0, stdout="ok", stderr="")

        with (
            mock.patch.object(
                self.engine.shutil, "which", side_effect=lambda name: f"/usr/bin/{name}"
            ),
            mock.patch.object(
                self.engine.time, "monotonic", side_effect=lambda: next(clock)
            ),
            mock.patch.object(
                self.engine.subprocess, "run", side_effect=fake_run
            ) as run,
        ):
            report = self.engine.Investigator().run("path", "192.0.2.1")

        self.assertLessEqual(run.call_args_list[0].kwargs["timeout"], 45)
        self.assertLessEqual(len(run.call_args_list), 2)
        self.assertTrue(
            any(
                "aggregate diagnostic timeout" in item["message"]
                for item in report["errors"]
            )
        )


if __name__ == "__main__":
    unittest.main()
