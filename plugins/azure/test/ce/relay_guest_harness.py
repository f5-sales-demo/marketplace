"""Run generated relay programs twice against isolated files and modeled guest commands."""

# Standalone child executable; this directory is a TypeScript test tree.
# ruff: noqa: INP001
from __future__ import annotations

import ast
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from typing import Any
from unittest.mock import patch

REAL_STAT = pathlib.Path.stat
real_open = open
real_monotonic = time.monotonic
IMAGE_ID = "sha256:" + "b" * 64
SESSION_INSPECTIONS = 2
ROUTE_INSPECTIONS = 3
FIB_INSPECTIONS = 4


class GuestFixture:
    """Keep each modeled guest invocation bound to one private fixture."""

    def __init__(self, payload: dict[str, Any], root: pathlib.Path) -> None:
        """Prepare one private modeled guest with the original generated identities."""
        self.payload = payload
        self.root = root
        self.commands: list[list[str]] = []
        self.active = False
        self.inspections = 0
        self.clock_count = 0
        ast.parse(self.script)
        self.root.mkdir()
        self._prepare()

    @property
    def expected(self) -> dict[str, Any]:
        """Return the expected identity supplied by the generating test."""
        return self.payload["expected"]

    @property
    def script(self) -> str:
        """Return the production-generated guest program."""
        return self.payload["python"]

    @property
    def scenario(self) -> str:
        """Return the requested modeled failure scenario."""
        return self.payload.get("scenario", "normal")

    @property
    def interface_name(self) -> str:
        """Return the modeled interface name."""
        return self.payload.get("interfaceName", "eth0")

    def _prepare(self) -> None:
        for item in self.payload["bootstrap"]["write_files"]:
            if item["path"].startswith("/etc/xcsh-relay/"):
                target = self.root / item["path"].removeprefix("/etc/xcsh-relay/")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(item["content"])
        self.software = {
            "sourcePlanSha256": self.expected["sourcePlanSha256"],
            "relayPlanSha256": self.expected["relayPlanSha256"],
            "status": "software-prepared",
            "frrImage": self.expected["frrImage"],
            "dockerArchiveSha256": self.expected["dockerArchiveSha256"],
            "reportedFrrVersion": self.expected["frrVersion"] + "_git",
            "imageId": IMAGE_ID,
            "dockerBinaryVersion": "Docker version "
            + self.expected["dockerVersion"]
            + ", build a82e528",
        }
        (self.root / "software.json").write_text(json.dumps(self.software))
        if self.scenario == "partial-config":
            (self.root / "frr" / "frr.conf").write_text(self.payload["configuration"])
        if self.scenario == "partial-record":
            (self.root / "frr" / "frr.conf").write_text(self.payload["configuration"])
            record = {
                key: self.expected[key]
                for key in [
                    "sourcePlanSha256",
                    "relayPlanSha256",
                    "relayName",
                    "configSha256",
                ]
            }
            (self.root / "config.json.pending").write_text(json.dumps(record))
        if self.scenario == "observe-complete" or self.scenario.startswith(
            ("sessions-", "routes-", "fib-")
        ):
            (self.root / "frr" / "frr.conf").write_text(self.payload["configuration"])
            record = {
                key: self.expected[key]
                for key in [
                    "sourcePlanSha256",
                    "relayPlanSha256",
                    "relayName",
                    "configSha256",
                ]
            }
            (self.root / "config.json").write_text(json.dumps(record))
            self.active = True
        if self.scenario == "foreign-config":
            (self.root / "frr" / "frr.conf").write_text("foreign config")

    @staticmethod
    def _stat_root(path: pathlib.Path, *args: Any, **kwargs: Any) -> os.stat_result:
        value = list(REAL_STAT(path, *args, **kwargs))
        value[4] = 0
        return os.stat_result(value)

    def _open_root(self, path: Any, *args: Any, **kwargs: Any) -> Any:
        if str(path) == "/run/xcsh-relay-activation.lock":
            path = self.root / "activation.lock"
        return real_open(path, *args, **kwargs)

    def _run(self, args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        self.commands.append(args)
        if args[0] == "ip":
            result = self._ip_route(args) if "route" in args else self._ip_address(args)
        elif args[0] == "systemctl":
            result = self._service(args)
        elif args[0] == "/opt/xcsh-relay/bin/docker":
            result = self._docker(args)
        else:
            message = "Unexpected fixture executable"
            raise RuntimeError(message)
        if result.returncode and kwargs.get("check"):
            raise subprocess.CalledProcessError(
                result.returncode, args, result.stdout, result.stderr
            )
        return result

    def _docker(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        if args[1] == "--version":
            output = self.software["dockerBinaryVersion"]
        elif args[1:3] == ["image", "inspect"]:
            output = json.dumps(
                [
                    {
                        "Id": IMAGE_ID,
                        "RepoDigests": [self.expected["frrImage"]],
                        "Architecture": "amd64",
                        "Os": "linux",
                    }
                ]
            )
        elif args[1] == "run":
            return self._parser(args)
        elif args[1] == "exec":
            return self._exec(args)
        elif args[1:3] == ["container", "inspect"]:
            return self._inspect(args)
        else:
            message = "Unexpected fixture Docker command"
            raise RuntimeError(message)
        return subprocess.CompletedProcess(args, 0, output, "")

    def _exec(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        assert args[2] == "c" * 64  # noqa: S101 - test fixture command contract
        assert args[3:5] == ["/usr/bin/vtysh", "-c"]  # noqa: S101 - test fixture command contract
        if args[5] == "show daemons":
            return self._daemons(args)
        if args[5].startswith("show ip route "):
            return self._zebra(args)
        neighbors = self._neighbors()
        if args[5] == "show bgp ipv4 neighbors json":
            diagnostics = (
                "vtysh observation unavailable"
                if self.scenario == "sessions-diagnostics"
                else ""
            )
            return subprocess.CompletedProcess(
                args, 0, json.dumps(neighbors), diagnostics
            )
        return self._routes(args)

    def _ip_route(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        code, output, diagnostics = (0, "", "")
        fib = self.payload["fibBinding"]
        sender = self.payload["routeBinding"]["sourcePeers"][0]
        gateway = fib["azureGateway"] if fib["returning"] else sender["address"]
        device = (
            self.interface_name if self.scenario != "fib-foreign-device" else "eth9"
        )
        if "get" in args:
            value = {
                "dst": fib["prefix"].split("/")[0],
                "gateway": gateway,
                "dev": device,
                "prefsrc": self.expected["address"],
                "flags": [],
                "cache": [],
            }
            if self.scenario == "fib-lookup-foreign":
                value["gateway"] = "10.20.0.99"
        else:
            value = {
                "dst": fib["prefix"],
                "gateway": gateway,
                "dev": device,
                "protocol": "bgp",
                "flags": [],
            }
            if self.scenario == "fib-default-fallback":
                value["dst"] = "default"
            if self.scenario == "fib-kernel-foreign":
                value["gateway"] = "10.20.0.99"
            if self.scenario == "fib-static-substitute":
                value["protocol"] = "static"
            if self.scenario == "fib-dead-route":
                value["flags"] = ["linkdown"]
        if "fibKernel" in self.payload and "get" not in args:
            return subprocess.CompletedProcess(
                args, 0, json.dumps(self.payload["fibKernel"]), ""
            )
        output = json.dumps(
            []
            if self.scenario == "fib-kernel-missing"
            else [value, value]
            if self.scenario == "fib-duplicate-kernel"
            else [value]
        )
        return subprocess.CompletedProcess(args, code, output, diagnostics)

    def _ip_address(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        code, output, diagnostics = (0, "", "")
        output = json.dumps(
            [
                {
                    "ifindex": 2,
                    "ifname": self.interface_name,
                    "address": self.expected["mac"]
                    if self.scenario != "foreign-mac"
                    else "02:00:00:00:00:00",
                    "addr_info": [
                        {"family": "inet", "local": self.expected["address"]}
                    ],
                }
            ]
        )
        return subprocess.CompletedProcess(args, code, output, diagnostics)

    def _service(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        code, output, diagnostics = (0, "", "")
        if args[1] == "is-active":
            code = 0 if self.active else 3
        elif args[1] == "start":
            self.active = True
        else:
            msg = "Unexpected fixture service command"
            raise RuntimeError(msg)
        return subprocess.CompletedProcess(args, code, output, diagnostics)

    def _parser(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        code, output, diagnostics = (0, "", "")
        assert "--network" in args  # noqa: S101 - test fixture command contract
        assert args[args.index("--network") + 1] == "none"  # noqa: S101 - test fixture command contract
        assert "--cap-drop" in args  # noqa: S101 - test fixture command contract
        assert args[args.index("--cap-drop") + 1] == "ALL"  # noqa: S101 - test fixture command contract
        assert "/usr/bin/vtysh" in args  # noqa: S101 - test fixture command contract
        assert "-C" in args  # noqa: S101 - test fixture command contract
        if self.scenario == "parser-diagnostics-stdout":
            output = "Missing config diagnostics"
        if self.scenario == "parser-diagnostics":
            diagnostics = "Missing configuration diagnostics"
        return subprocess.CompletedProcess(args, code, output, diagnostics)

    def _inspect(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        code, output, diagnostics = (0, "", "")
        self.inspections += 1
        capabilities = [
            "NET_ADMIN",
            "NET_RAW",
            "SYS_ADMIN",
            "NET_BIND_SERVICE",
            "SETUID",
            "SETGID",
            "SETPCAP",
            "KILL",
            "CHOWN",
        ]
        if self.scenario == "foreign-capabilities":
            capabilities.append("DAC_OVERRIDE")
        if self.scenario == "missing-capabilities":
            capabilities.remove("SYS_ADMIN")
        if self.scenario == "prefixed-capabilities":
            capabilities = ["CAP_" + cap for cap in capabilities]
        if self.scenario == "duplicate-capabilities":
            capabilities.append("CAP_SYS_ADMIN")
        tmpfs = {
            "/var/run/frr": "rw,nosuid,size=16m,mode=1777",
            "/tmp": "rw,noexec,nosuid,size=16m",  # noqa: S108 - modeled Docker tmpfs
            "/var/lib/frr": "rw,nosuid,size=16m,mode=1777",
            "/var/tmp/frr": "rw,nosuid,size=16m,mode=1777",  # noqa: S108 - modeled Docker tmpfs
        }
        if self.scenario == "missing-state-directory":
            del tmpfs["/var/lib/frr"]
        groups = ["frr", "frrvty"] if self.scenario != "missing-groups" else []
        if self.scenario == "foreign-mount":
            source = "/foreign/config"
        else:
            source = str(self.root / "frr")
        output = json.dumps(
            [
                {
                    "Image": IMAGE_ID,
                    "Id": (
                        "d"
                        if (
                            self.scenario == "sessions-container-changed"
                            and self.inspections >= SESSION_INSPECTIONS
                        )
                        or (
                            self.scenario == "routes-container-changed"
                            and self.inspections >= ROUTE_INSPECTIONS
                        )
                        or (
                            self.scenario == "fib-container-changed"
                            and self.inspections >= FIB_INSPECTIONS
                        )
                        else "c"
                    )
                    * 64,
                    "State": {"Running": True},
                    "HostConfig": {
                        "NetworkMode": "host",
                        "ReadonlyRootfs": True,
                        "Privileged": False,
                        "CapAdd": capabilities,
                        "CapDrop": ["ALL"],
                        "SecurityOpt": ["no-new-privileges"],
                        "Tmpfs": tmpfs,
                        "GroupAdd": groups,
                    },
                    "Config": {
                        "Entrypoint": ["/sbin/tini", "--"],
                        "Cmd": ["/bin/sh"]
                        if self.scenario == "foreign-entrypoint"
                        else ["/usr/lib/frr/docker-start"],
                        "User": "",
                    },
                    "Mounts": [
                        {"Destination": "/etc/frr", "Source": source, "RW": False}
                    ],
                }
            ]
        )
        return subprocess.CompletedProcess(args, code, output, diagnostics)

    def _daemons(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        _code, output, diagnostics = (0, "", "")
        output = "mgmtd zebra bgpd watchfrr staticd"
        if self.scenario == "missing-daemons":
            output = "watchfrr"
        if self.scenario == "daemon-diagnostics":
            diagnostics = "daemon readback unavailable"
        return subprocess.CompletedProcess(args, 0, output, diagnostics)

    def _zebra(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        _code, _output, _diagnostics = (0, "", "")
        fib = self.payload["fibBinding"]
        sender = self.payload["routeBinding"]["sourcePeers"][0]
        gateway = fib["azureGateway"] if fib["returning"] else sender["address"]
        hop = {
            "ip": gateway,
            "afi": "ipv4",
            "active": True,
            "fib": True,
            "interfaceName": self.interface_name,
            "interfaceIndex": 2,
        }
        value = {
            "prefix": fib["prefix"],
            "protocol": "bgp",
            "vrfId": 0,
            "vrfName": "default",
            "table": 254,
            "selected": True,
            "destSelected": True,
            "installed": True,
            "nexthops": [hop],
        }
        if self.scenario == "fib-zebra-not-installed":
            value["installed"] = False
        if self.scenario == "fib-zebra-foreign":
            hop["ip"] = "10.20.0.99"
        if self.scenario == "fib-index-foreign":
            hop["interfaceIndex"] = 9
        if self.scenario == "fib-zebra-duplicate":
            value["nexthops"].append(dict(hop))
        return subprocess.CompletedProcess(
            args,
            0,
            json.dumps(self.payload.get("fibZebra", {fib["prefix"]: [value]})),
            "diagnostics" if self.scenario == "fib-diagnostics" else "",
        )

    def _neighbors(self) -> dict[str, Any]:
        binding = self.payload["sessionBinding"]
        neighbors = {
            peer["address"]: {
                "localAs": binding["localAsn"],
                "remoteAs": peer["asn"],
                "localRouterId": binding["localAddress"],
                "hostLocal": binding["localAddress"],
                "hostForeign": peer["address"],
                "bgpVersion": 4,
                "bgpState": "Established",
            }
            for peer in binding["peers"]
        }
        first = binding["peers"][0]["address"]
        if "neighborReadback" in self.payload:
            neighbors = self.payload["neighborReadback"]
        self._outage_neighbors(neighbors, binding)
        if self.scenario == "sessions-missing":
            del neighbors[first]
        if self.scenario == "sessions-foreign":
            neighbors["10.20.0.99"] = neighbors[first]
        if self.scenario == "sessions-idle":
            neighbors[first]["bgpState"] = "Idle"
        if self.scenario == "sessions-foreign-asn":
            neighbors[first]["remoteAs"] = 64512
        if self.scenario == "sessions-foreign-host":
            neighbors[first]["hostLocal"] = "10.20.0.99"
        if self.scenario == "sessions-admin-down":
            neighbors[first]["adminShutDown"] = True
        if self.scenario == "sessions-missing-state":
            del neighbors[first]["bgpState"]
        return neighbors

    def _outage_neighbors(
        self, neighbors: dict[str, Any], binding: dict[str, Any]
    ) -> None:
        if self.scenario.startswith(
            ("sessions-outage-", "routes-outage-", "fib-outage-")
        ):
            selected = binding["unavailablePeer"]["address"]
            state = self.scenario.split("-outage-", 1)[1]
            neighbors[selected]["bgpState"] = (
                state if state in ["Idle", "Connect", "Active"] else "Idle"
            )
            if state == "other-down":
                neighbors[
                    next(
                        peer["address"]
                        for peer in binding["peers"]
                        if peer["address"] != selected
                    )
                ]["bgpState"] = "Idle"
            if state == "cloud-down":
                neighbors[binding["peers"][-1]["address"]]["bgpState"] = "Idle"
            if state == "admin-down":
                neighbors[selected]["adminShutDown"] = True
            if state == "missing-state":
                del neighbors[selected]["bgpState"]
            if state == "disappeared":
                del neighbors[selected]

    def _routes(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        code, output, diagnostics = (0, "", "")
        route = self.payload["routeBinding"]
        assert args[5] == route["command"]  # noqa: S101 - test fixture command contract
        sender = route["sourcePeers"][0]
        if route["direction"] == "received":
            path = {
                "network": route["prefix"],
                "valid": True,
                "bestpath": True,
                "peerId": sender["address"],
                "path": str(sender["asn"]),
                "nexthops": [{"ip": sender["address"], "afi": "ipv4", "used": True}],
            }
            value = {
                "localAS": route["localAsn"],
                "routerId": route["localAddress"],
                "vrfName": "default",
                "totalRoutes": 1,
                "totalPaths": 1,
                "routes": {route["prefix"]: [path]},
            }
            if self.scenario in ["routes-duplicate", "routes-duplicate-identity"]:
                duplicate = dict(path)
                if self.scenario == "routes-duplicate-identity":
                    duplicate["bestpath"] = False
                    duplicate["version"] = 77
                value["routes"][route["prefix"]].append(duplicate)
                value["totalPaths"] = 2
            if self.scenario == "routes-stale":
                path["stale"] = True
            if self.scenario == "routes-missing-best":
                del path["bestpath"]
            if self.scenario == "routes-foreign-source":
                path["peerId"] = "10.20.0.99"
            if self.scenario == "routes-foreign-nexthop":
                path["nexthops"][0]["ip"] = "10.20.0.99"
            if self.scenario == "routes-wrong-count":
                value["totalPaths"] = 7
        else:
            path = {
                "network": route["prefix"],
                "valid": True,
                "best": True,
                "path": str(sender["asn"]),
                "nextHop": "0.0.0.0",  # noqa: S104 - FRR implicit-self wire encoding
            }
            value = {
                "localAS": route["localAsn"],
                "bgpLocalRouterId": route["localAddress"],
                "totalPrefixCounter": 1,
                "advertisedRoutes": {route["prefix"]: path},
            }
            if self.scenario == "routes-foreign-nexthop":
                path["nextHop"] = "10.20.0.99"
            if self.scenario == "routes-missing-best":
                del path["best"]
            if self.scenario == "routes-wrong-count":
                value["totalPrefixCounter"] = 7
        self._route_faults(route, path, value)
        if self.scenario == "routes-diagnostics":
            diagnostics = "route observation diagnostics"
        elif self.scenario == "sessions-diagnostics":
            diagnostics = "vtysh observation unavailable"
        output = json.dumps(self.payload.get("routeTable", value))
        return subprocess.CompletedProcess(args, code, output, diagnostics)

    def _route_faults(
        self, route: dict[str, Any], path: dict[str, Any], value: dict[str, Any]
    ) -> None:
        if self.scenario == "routes-foreign-asn":
            value["localAS"] = 64512
        if self.scenario == "routes-foreign-path":
            path["path"] = "64512"
        if self.scenario == "routes-missing-prefix":
            del value[
                "routes" if route["direction"] == "received" else "advertisedRoutes"
            ][route["prefix"]]
        if self.scenario == "routes-partial":
            value["nextLink"] = "continuation"

    def _monotonic(self) -> float:
        self.clock_count += 1
        if self.scenario in ["missing-daemons", "daemon-diagnostics"]:
            return self.clock_count * 31
        return real_monotonic()

    def execute(self) -> dict[str, Any]:
        """Execute the trusted production-generated program twice and report its calls."""
        code = self.script.replace(
            "root = pathlib.Path('/etc/xcsh-relay')",
            "root = pathlib.Path(" + repr(str(self.root)) + ")",
        )
        with (
            patch("time.monotonic", self._monotonic),
            patch("subprocess.run", self._run),
            patch("pathlib.Path.stat", self._stat_root),
            patch("builtins.open", self._open_root),
            patch("os.geteuid", lambda: 0),
        ):
            for _ in range(2):
                namespace: dict[str, Any] = {}
                try:
                    # Execute only the guest program generated by the calling production-tool test.
                    exec(compile(code, "<generated-relay-guest>", "exec"), namespace)  # noqa: S102  # pylint: disable=exec-used
                finally:
                    if "lock" in namespace:
                        namespace["lock"].close()
        return {
            "starts": sum(args[:2] == ["systemctl", "start"] for args in self.commands),
            "configSha256": self.expected["configSha256"],
            "executions": 2,
            "parserRuns": sum(
                args[:2] == ["/opt/xcsh-relay/bin/docker", "run"]
                for args in self.commands
            ),
        }


def main() -> None:
    """Run one isolated guest fixture requested by a TypeScript child-process test."""
    payload = json.load(sys.stdin)
    with tempfile.TemporaryDirectory(prefix="relay-guest-fixture-") as directory:
        fixture = GuestFixture(payload, pathlib.Path(directory) / "relay")
        result = fixture.execute()
    print(json.dumps(result))  # noqa: T201 - child-process fixture protocol


if __name__ == "__main__":
    main()
