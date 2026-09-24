#!/usr/bin/env python3
"""Self-contained KVM Secure Mesh Site v2 lifecycle controller."""
# pylint: disable=too-many-lines,too-many-locals,consider-using-with
# ruff: noqa: ANN204, D101, D102, D103, D107, EM101, EM102, I001, PERF401, PLR0911, PLR2004, PTH101, PTH105, PTH108, S310, S314, S603, T201, TC003, TRY003, TRY004, TRY301

from __future__ import annotations

import argparse
from collections.abc import Iterator
import contextlib
import fcntl
import grp
import hashlib
import ipaddress
import json
import os
import pathlib
import platform
import pwd
import re
import select
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from typing import Any

SCHEMA_VERSION = "kvm.smsv2/v3"
CONTROLLER_VERSION = "3.0.0"
TERRAFORM_VERSION = "1.16.3"
TERRAFORM_SHA256 = "093b6ae9a2228af5029c41606bc96eb583553528aad1bfe7e0b4d62fc91e25d8"
OWNER = "xcsh-kvm-smsv2-v3"
NAMESPACE = "system"
POOL = "xcsh-kvm-smsv2"
NETWORK = "xcsh-kvm-smsv2"
FRR = "xcsh-kvm-smsv2-frr"
CE_DOMAIN = "xcsh-kvm-smsv2-ce"
WORKLOAD_DOMAIN = "xcsh-kvm-smsv2-workload"
CE_ADDRESS = "10.100.0.11"
CE_MAC = "52:54:00:10:00:11"
SLI_MAC = "52:54:00:10:00:12"
WORKLOAD_ADDRESS = "10.100.0.100"
WORKLOAD_MAC = "52:54:00:10:00:64"
LAB_ROUTE = "10.231.0.0/24"
LAN_RANGES = (
    ipaddress.IPv4Network("192.168.0.0/22"),
    ipaddress.IPv4Network("192.168.4.0/23"),
)
CE_IMAGE_MD5 = "373f25b2b1d04674baa48a8916905c68"
WORKLOAD_IMAGE_SHA512 = "08fea112563461f251f3c95a5c5cf8cb25eb60f74cec03e85a97ff91d3efef3059d35837598bbb476008f20db6d3bdc7143c5f2f2a9a6da394a0acc601fd5986"
REQUIRED_COMMANDS = (
    "arping",
    "brctl",
    "curl",
    "docker",
    "ip",
    "jq",
    "modprobe",
    "ping",
    "qemu-img",
    "systemctl",
    "systemd-run",
    "terraform",
    "virsh",
)
APT_PACKAGES = (
    "bridge-utils",
    "iputils-arping",
    "iputils-ping",
    "curl",
    "iproute2",
    "jq",
    "kmod",
    "libvirt-clients",
    "libvirt-daemon-system",
    "qemu-kvm",
    "qemu-utils",
    "python3-yaml",
    "unzip",
)
ALLOWED_PROVIDERS = {
    "terraform.io/builtin/terraform",
    "registry.terraform.io/f5-sales-demo/xcsh",
    "registry.terraform.io/dmacvicar/libvirt",
    "registry.terraform.io/kreuzwerker/docker",
}
SECRET_KEY = re.compile(
    r"token|authorization|secret|credential|password", re.IGNORECASE
)
SECRET_VALUE = re.compile(r"(?i)(?:Bearer|APIToken)\s+\S+")


class ControllerError(RuntimeError):
    pass


def allowed_lan_subnet(value: str) -> bool:
    try:
        network = ipaddress.ip_network(value, strict=True)
    except ValueError:
        return False
    if not isinstance(network, ipaddress.IPv4Network):
        return False
    return any(network.subnet_of(allowed) for allowed in LAN_RANGES)


def select_lan_bridge(
    wired_link: str,
    bridges: dict[str, list[str]],
    owned_ports: set[str] | None = None,
) -> str:
    if not wired_link or wired_link.startswith(("br", "veth", "virbr", "wl")):
        raise ControllerError("a physical wired management link is required")
    if wired_link in bridges.get("br-kvm-lan", []):
        raise ControllerError("occupied br-kvm-lan belongs to another topology")
    matching = [name for name, members in bridges.items() if wired_link in members]
    if matching == ["xckvmlan"]:
        members = bridges["xckvmlan"]
        if (
            len(owned_ports or set()) > 1
            or len(members) != len(set(members))
            or set(members)
            != {
                wired_link,
                *(owned_ports or set()),
            }
        ):
            raise ControllerError("management bridge contains unowned ports")
        return "xckvmlan"
    if matching or "xckvmlan" in bridges:
        raise ControllerError("existing bridge ownership is ambiguous")
    return "xckvmlan"


def select_lan_addresses(
    subnet: str, gateway: str, excluded: set[str], responds: Any
) -> tuple[str, str]:
    if not allowed_lan_subnet(subnet):
        raise ControllerError("wired LAN subnet must be wholly within an allowed range")
    network = ipaddress.ip_network(subnet)
    blocked = {str(ipaddress.ip_address(address)) for address in excluded | {gateway}}
    candidates: list[str] = []
    for address in reversed(list(network.hosts())):
        value = str(address)
        if value not in blocked and not responds(value):
            candidates.append(value)
            if len(candidates) == 2:
                return candidates[1], candidates[0]
    raise ControllerError("two unoccupied LAN addresses could not be established")


def map_ce_interfaces(interfaces: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    expected = {"slo": CE_MAC, "sli": SLI_MAC}
    mapped: dict[str, dict[str, str]] = {}
    for item in interfaces:
        role = item.get("role", "").lower()
        mac = item.get("mac", "").lower().replace("-", ":")
        if role not in expected or role in mapped or mac != expected[role]:
            raise ControllerError("CE role/MAC mapping is ambiguous or unowned")
        if not item.get("device") or any(
            other["device"] == item["device"] for other in mapped.values()
        ):
            raise ControllerError("CE interfaces require distinct observed devices")
        mapped[role] = item
    if set(mapped) != set(expected):
        raise ControllerError("both observed CE roles are required")
    return mapped


def parse_home_lan(
    routes: list[dict[str, Any]],
    links: list[dict[str, Any]],
    addresses: list[dict[str, Any]],
    owned_ports: set[str] | None = None,
) -> dict[str, Any]:
    by_name = {item.get("ifname"): item for item in links}
    bridges = {
        str(name): [str(link["ifname"]) for link in links if link.get("master") == name]
        for name, item in by_name.items()
        if item.get("linkinfo", {}).get("info_kind") == "bridge"
    }
    candidates: list[tuple[dict[str, Any], str]] = []
    for route in routes:
        device = str(route.get("dev", ""))
        physical = device
        if device in bridges:
            wired = [port for port in bridges[device] if port.startswith(("en", "eth"))]
            if len(wired) != 1:
                continue
            physical = wired[0]
        if route.get("dst") == "default" and physical.startswith(("en", "eth")):
            candidates.append((route, physical))
    if len(candidates) != 1:
        raise ControllerError("one unambiguous active wired default route is required")
    route, physical = candidates[0]
    device = str(route["dev"])
    gateway = str(route.get("gateway", ""))
    observed = [
        item
        for link in addresses
        if link.get("ifname") == device
        for item in link.get("addr_info", [])
        if item.get("family") == "inet"
    ]
    if len(observed) != 1:
        raise ControllerError("one wired LAN IPv4 address is required")
    entry = observed[0]
    try:
        subnet = ipaddress.ip_network(
            f"{entry['local']}/{entry['prefixlen']}", strict=False
        )
        if (
            not allowed_lan_subnet(str(subnet))
            or ipaddress.ip_address(gateway) not in subnet
        ):
            raise ValueError("wired LAN is outside the supported ranges")
    except (KeyError, ValueError) as error:
        raise ControllerError("wired LAN subnet or gateway is unsupported") from error
    bridge = select_lan_bridge(physical, bridges, owned_ports)
    return {
        "wiredLink": physical,
        "routeDevice": device,
        "hostAddress": str(entry["local"]),
        "gateway": gateway,
        "subnet": str(subnet),
        "bridge": bridge,
        "bridgeReady": device == bridge,
        "physicalMac": str(by_name.get(physical, {}).get("address", "")),
        "bridges": bridges,
    }


def bridge_transaction_command(manager: str, wired_link: str, bridge: str) -> list[str]:
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,15}", wired_link):
        raise ControllerError("invalid wired link name")
    if bridge != "xckvmlan":
        raise ControllerError("only the plugin-owned bridge can be created")
    helper = str(pathlib.Path(__file__).with_name("bridge-prep.py"))
    if manager == "NetworkManager":
        return [
            "sudo",
            "nmcli",
            "device",
            "checkpoint",
            "--timeout",
            "120",
            "--",
            "python3",
            helper,
            "networkmanager",
            wired_link,
            bridge,
        ]
    if manager == "networkd":
        return ["sudo", "python3", helper, "networkd", wired_link, bridge]
    raise ControllerError("unsupported wired LAN network manager")


def execute_checkpoint(argv: list[str]) -> None:
    environment = dict(os.environ)
    environment["LC_ALL"] = "C"
    try:
        process = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=environment,
        )
    except OSError as error:
        raise ControllerError("NetworkManager checkpoint could not start") from error
    output = bytearray()
    deadline = time.monotonic() + 130
    prompt = b'Type "Yes" to commit the changes:'
    marker = b"KVM_BRIDGE_VERIFIED\n"
    try:
        if process.stdout is None or process.stdin is None:
            raise ControllerError("NetworkManager checkpoint streams are unavailable")
        while time.monotonic() < deadline:
            ready, _, _ = select.select([process.stdout], [], [], 1)
            if not ready:
                if process.poll() is not None:
                    break
                continue
            chunk = os.read(process.stdout.fileno(), 4096)
            if not chunk:
                break
            output.extend(chunk)
            if len(output) > 8192:
                del output[:-8192]
            if prompt in output:
                verified = marker in output
                if verified:
                    process.stdin.write(b"Yes\n")
                    process.stdin.flush()
                process.stdin.close()
                process.wait(timeout=15)
                if verified and process.returncode == 0:
                    return
                raise ControllerError(
                    "NetworkManager checkpoint rejected an unverified bridge"
                )
        raise ControllerError(
            "NetworkManager checkpoint ended without verified confirmation"
        )
    except subprocess.TimeoutExpired as error:
        raise ControllerError(
            "NetworkManager checkpoint confirmation timed out"
        ) from error
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        if process.stdin and not process.stdin.closed:
            process.stdin.close()
        if process.stdout:
            process.stdout.close()


def observe_home_lan(runner: Runner) -> dict[str, Any]:
    def ip_json(*args: str) -> list[dict[str, Any]]:
        try:
            result = json.loads(runner.checked(["ip", "-j", *args]))
        except ValueError as error:
            raise ControllerError("host link inventory is malformed") from error
        if not isinstance(result, list):
            raise ControllerError("host link inventory is malformed")
        return result

    routes = ip_json("-4", "route", "show", "default")
    links = ip_json("link", "show")
    addresses = ip_json("-4", "address", "show")
    owned_ports: set[str] = set()
    if any(
        link.get("master") == "xckvmlan"
        and str(link.get("ifname", "")).startswith("vnet")
        for link in links
    ):
        domain = runner.run(
            ["virsh", "--connect", "qemu:///system", "dumpxml", CE_DOMAIN]
        )
        if domain.returncode == 0:
            try:
                xml = ET.fromstring(domain.stdout)
            except (ET.ParseError, TypeError) as error:
                raise ControllerError(
                    "CE bridge interface inventory is malformed"
                ) from error
            for interface in xml.findall("./devices/interface"):
                source = interface.find("source")
                mac = interface.find("mac")
                target = interface.find("target")
                if (
                    source is not None
                    and source.get("bridge") == "xckvmlan"
                    and mac is not None
                    and mac.get("address", "").lower() == SLI_MAC
                    and target is not None
                    and target.get("dev", "").startswith("vnet")
                ):
                    owned_ports.add(str(target.get("dev")))
    snapshot = parse_home_lan(
        routes,
        links,
        addresses,
        owned_ports,
    )
    snapshot["ipv6"] = [
        entry.get("local")
        for link in ip_json("-6", "address", "show")
        if link.get("ifname") in (snapshot["wiredLink"], snapshot["bridge"])
        for entry in link.get("addr_info", [])
        if entry.get("scope") == "global"
    ]
    snapshot["neighbors"] = sorted(
        {
            str(entry["dst"])
            for entry in ip_json("-4", "neigh", "show")
            if entry.get("dst") and "FAILED" not in entry.get("state", [])
        }
    )
    if (
        runner.run(["systemctl", "is-active", "--quiet", "NetworkManager"]).returncode
        == 0
    ):
        snapshot["manager"] = "NetworkManager"
    elif (
        runner.run(["systemctl", "is-active", "--quiet", "systemd-networkd"]).returncode
        == 0
    ):
        snapshot["manager"] = "networkd"
    else:
        raise ControllerError(
            "wired LAN manager is neither NetworkManager nor networkd"
        )
    return snapshot


def _probe_lan_address(runner: Runner, bridge: str, address: str) -> bool:
    result = runner.run(
        ["sudo", "arping", "-D", "-I", bridge, "-c", "2", "-w", "3", address],
        timeout=12,
    )
    if result.returncode not in (0, 1):
        raise ControllerError(
            "LAN ARP probe could not establish candidate availability"
        )
    return result.returncode == 1


def _lan_arp_mac(runner: Runner, bridge: str, address: str) -> str | None:
    result = runner.run(
        ["sudo", "arping", "-I", bridge, "-c", "2", "-w", "3", address], timeout=12
    )
    if result.returncode not in (0, 1):
        raise ControllerError("LAN ARP ownership probe failed")
    macs = {mac.lower() for mac in re.findall(r"\[([0-9a-fA-F:]{17})\]", result.stdout)}
    if len(macs) > 1:
        raise ControllerError("multiple LAN MACs answered one selected address")
    return next(iter(macs)) if macs else None


def validate_lan_recheck(
    selection: dict[str, str], expected: dict[str, str] | None, observe: Any
) -> None:
    for key in ("sliAddress", "vipAddress"):
        address = selection[key]
        responder = observe(address)
        owner = expected.get(address) if expected else None
        if responder is not None and (
            owner is None or responder.lower() != owner.lower()
        ):
            raise ControllerError(
                "LAN address has a new or mismatched ARP owner; review a fresh plan"
            )
        if owner is not None and responder is None:
            raise ControllerError("previously owned LAN address no longer responds")


def _observed_lan_leases(runner: Runner, subnet: str) -> list[str]:
    payload = runner.checked(
        [
            "sudo",
            "python3",
            str(pathlib.Path(__file__).with_name("bridge-prep.py")),
            "leases",
            subnet,
        ]
    )
    try:
        leases = json.loads(payload)
        if not isinstance(leases, list) or not all(
            isinstance(item, str) for item in leases
        ):
            raise ValueError("malformed lease inventory")
    except ValueError as error:
        raise ControllerError("LAN lease inventory is malformed") from error
    return leases


def prepare_home_lan(
    store: StateStore, runner: Runner, config: dict[str, Any]
) -> dict[str, Any]:
    snapshot = observe_home_lan(runner)
    if not snapshot["bridgeReady"]:
        argv = bridge_transaction_command(
            snapshot["manager"], snapshot["wiredLink"], snapshot["bridge"]
        )
        command = [
            *argv,
            snapshot["hostAddress"],
            snapshot["gateway"],
            snapshot["physicalMac"],
            "yes" if snapshot["ipv6"] else "no",
        ]
        if snapshot["manager"] == "NetworkManager":
            execute_checkpoint(command)
        elif runner.run(command, timeout=150).returncode:
            raise ControllerError(
                "timed bridge transaction failed; original network configuration must be verified"
            )
        try:
            verified = observe_home_lan(runner)
            if (
                not verified["bridgeReady"]
                or verified["subnet"] != snapshot["subnet"]
                or verified["hostAddress"] != snapshot["hostAddress"]
            ):
                raise ControllerError(
                    "bridge transaction changed the management identity"
                )
            runner.checked(
                ["sudo", "systemctl", "stop", "kvm-smsv2-lan-rollback.timer"]
            )
        except ControllerError:
            try:
                runner.checked(
                    [
                        "sudo",
                        "python3",
                        str(pathlib.Path(__file__).with_name("bridge-prep.py")),
                        "restore",
                    ],
                    timeout=155,
                )
            except ControllerError as error:
                raise ControllerError(
                    "bridge validation and management rollback failed; inspect the host rollback timer"
                ) from error
            raise
        snapshot = verified
    if not shutil.which("arping"):
        raise ControllerError(
            "iputils-arping is required for best-effort LAN conflict probing"
        )
    leases = _observed_lan_leases(runner, snapshot["subnet"])
    snapshot["observedLeases"] = leases
    known = set(snapshot["neighbors"]) | set(leases) | {snapshot["hostAddress"]}
    addresses = config.get("lan")
    if addresses:
        if any(
            addresses.get(key) != snapshot[value]
            for key, value in (
                ("subnet", "subnet"),
                ("bridge", "bridge"),
                ("gateway", "gateway"),
            )
        ):
            raise ControllerError(
                "persisted LAN topology drift requires a new reviewed deployment"
            )
        selected = (addresses["sliAddress"], addresses["vipAddress"])
        if len(set(selected)) != 2 or any(
            ipaddress.ip_address(address)
            not in ipaddress.ip_network(snapshot["subnet"])
            for address in selected
        ):
            raise ControllerError("persisted LAN address selection is invalid")
        baseline_path = store.receipts / "lan-arp-owners.json"
        expected = (
            store.read_receipt("lan-arp-owners").get("macs")
            if baseline_path.exists()
            else None
        )
        if any(address in leases for address in selected):
            raise ControllerError(
                "persisted LAN address appears in observed DHCP leases"
            )
        if expected is None and any(address in known for address in selected):
            raise ControllerError("unowned LAN address appears in neighbor inventory")
    else:
        selected = select_lan_addresses(
            snapshot["subnet"],
            snapshot["gateway"],
            known,
            lambda address: _probe_lan_address(runner, snapshot["bridge"], address),
        )
        addresses = {
            "subnet": snapshot["subnet"],
            "bridge": snapshot["bridge"],
            "gateway": snapshot["gateway"],
            "sliAddress": selected[0],
            "vipAddress": selected[1],
        }
        config["lan"] = addresses
        path = store.root / "deployment.json"
        fd, temporary = tempfile.mkstemp(prefix=".deployment.", dir=store.root)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(config, stream, sort_keys=True)
            stream.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        store.write_receipt(
            "lan",
            {
                "selection": addresses,
                "inventory": snapshot,
                "dhcpExclusionVerified": False,
            },
        )
        expected = None
    validate_lan_recheck(
        addresses,
        expected,
        lambda address: _lan_arp_mac(runner, snapshot["bridge"], address),
    )
    return addresses


def _redact(value: Any, key: str = "") -> Any:
    if SECRET_KEY.search(key) and not isinstance(value, bool):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {str(k): _redact(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, str):
        return SECRET_VALUE.sub("[REDACTED]", value)
    return value


def envelope(
    action: str, result: Any = None, *, ok: bool = True, error: str | None = None
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "controllerVersion": CONTROLLER_VERSION,
        "action": action,
        "ok": ok,
        "timestamp": int(time.time()),
    }
    if result is not None:
        payload["result"] = _redact(result)
    if error is not None:
        payload["error"] = _redact(error)
    return payload


def default_site_name(hostname: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", hostname.lower()).strip("-")
    clean = re.sub(r"-+", "-", clean)[:96].rstrip("-")
    if not clean:
        raise ControllerError("hostname cannot produce a site name")
    return f"onprem-{clean}-kvm"


def file_digest(path: pathlib.Path, algorithm: str = "sha256") -> str:
    digest = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_plan_digest(path: pathlib.Path, expected: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{64}", expected) or file_digest(path) != expected:
        raise ControllerError("saved plan hash changed; refusing execution")


def inspect_plan(document: dict[str, Any]) -> dict[str, Any]:
    counts = {"create": 0, "update": 0, "delete": 0, "no-op": 0, "read": 0}
    providers: set[str] = set()
    addresses: list[str] = []
    changes = document.get("resource_changes", [])
    if not isinstance(changes, list):
        raise ControllerError("saved plan resource_changes is malformed")
    for item in changes:
        if not isinstance(item, dict):
            raise ControllerError("saved plan contains a malformed resource change")
        provider = item.get("provider_name")
        address = item.get("address")
        actions = (
            item.get("change", {}).get("actions", [])
            if isinstance(item.get("change"), dict)
            else []
        )
        if not isinstance(provider, str) or provider not in ALLOWED_PROVIDERS:
            raise ControllerError(
                f"saved plan contains forbidden provider at {address or 'unknown'}"
            )
        if not isinstance(address, str) or not isinstance(actions, list):
            raise ControllerError("saved plan contains malformed action metadata")
        providers.add(provider)
        addresses.append(address)
        for action in actions:
            if action not in counts:
                raise ControllerError(
                    f"saved plan contains unsupported action {action}"
                )
            counts[action] += 1
    return {**counts, "providers": sorted(providers), "addresses": sorted(addresses)}


def require_home_lan_plan(document: dict[str, Any]) -> None:
    changes = document.get("resource_changes", [])
    for kind in ("xcsh_http_loadbalancer", "xcsh_origin_pool"):
        addresses = [
            item.get("address")
            for item in changes
            if isinstance(item, dict)
            and str(item.get("address", "")).startswith(f"{kind}.")
        ]
        if addresses != [f"{kind}.home"]:
            raise ControllerError(f"saved plan requires exactly one owned {kind}")


def classify_ambiguous_post(error: str, exact: dict[str, Any] | None) -> str:
    if "eof" not in error.lower():
        return "not_ambiguous"
    if exact is None:
        return "stop_absent"
    if exact.get("owned") is True and exact.get("specMatches") is True:
        return "reconcile_exact_owned"
    return "stop_collision"


def reject_collisions(inventory: list[dict[str, Any]]) -> None:
    for item in inventory:
        if (
            item.get("name") in {POOL, NETWORK, FRR, CE_DOMAIN, WORKLOAD_DOMAIN}
            and item.get("owned") is not True
        ):
            raise ControllerError(
                f"ownership collision for {item.get('kind', 'resource')} {item['name']}"
            )


def unrelated_resources(inventory: list[dict[str, Any]]) -> list[dict[str, Any]]:
    resources: list[dict[str, Any]] = []
    for item in inventory:
        if item.get("owned") is True or item.get("name") in {
            POOL,
            NETWORK,
            FRR,
            CE_DOMAIN,
            WORKLOAD_DOMAIN,
        }:
            continue
        resource: dict[str, Any] = {
            "kind": str(item.get("kind", "unknown")),
            "name": str(item.get("name", "unknown")),
        }
        if item.get("kind") in {"domain", "container"} and "running" in item:
            resource["running"] = item.get("running") is True
        resources.append(resource)
    return resources


def unrelated_left_stopped(
    before: list[dict[str, Any]], after: list[dict[str, Any]]
) -> list[dict[str, str]]:
    current = {(str(item.get("kind")), str(item.get("name"))): item for item in after}
    stopped: list[dict[str, str]] = []
    for item in before:
        if (
            item.get("kind") not in {"domain", "container"}
            or item.get("running") is not True
        ):
            continue
        key = (str(item.get("kind")), str(item.get("name")))
        observed = current.get(key)
        if observed is None or observed.get("running") is not True:
            stopped.append(
                {
                    "kind": key[0],
                    "name": key[1],
                    "state": "absent" if observed is None else "stopped",
                }
            )
    return stopped


class StateStore:
    def __init__(self, root: pathlib.Path | None = None):
        configured = os.environ.get("KVM_SMSV2_STATE_DIR")
        self.root = (
            root
            or pathlib.Path(configured or "~/.local/share/kvm-smsv2-v3").expanduser()
        )
        self.receipts = self.root / "receipts"
        self.plans = self.root / "plans"
        self.releases = self.root / "releases"

    def ensure(self) -> None:
        for directory in (self.root, self.receipts, self.plans, self.releases):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            directory.chmod(0o700)

    @contextlib.contextmanager
    def lock(self) -> Iterator[None]:
        self.ensure()
        path = self.root / "controller.lock"
        with path.open("a+", encoding="utf-8") as stream:
            os.chmod(path, 0o600)
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise ControllerError(
                    "another KVM SMSv2 lifecycle operation owns the exclusive lock"
                ) from error
            yield

    def write_receipt(self, name: str, data: dict[str, Any]) -> pathlib.Path:
        self.ensure()
        target = self.receipts / f"{name}.json"
        payload = {
            "schemaVersion": SCHEMA_VERSION,
            "controllerVersion": CONTROLLER_VERSION,
            **_redact(data),
        }
        fd, temporary = tempfile.mkstemp(prefix=f".{name}.", dir=self.receipts)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(payload, stream, sort_keys=True, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temporary, 0o600)
            os.replace(temporary, target)
        finally:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(temporary)
        return target

    def read_receipt(self, name: str) -> dict[str, Any]:
        path = self.receipts / f"{name}.json"
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise ControllerError(f"missing or invalid {name} receipt") from error
        if (
            value.get("schemaVersion") != SCHEMA_VERSION
            or value.get("controllerVersion") != CONTROLLER_VERSION
        ):
            raise ControllerError(f"stale receipt for {name}")
        return value


class Runner:
    @staticmethod
    def _environment(env: dict[str, str] | None = None) -> dict[str, str]:
        resolved = dict(os.environ if env is None else env)
        preferred = [str(pathlib.Path.home() / ".local" / "bin"), "/usr/local/bin"]
        inherited = resolved.get("PATH", os.defpath).split(os.pathsep)
        resolved["PATH"] = os.pathsep.join(
            path for path in dict.fromkeys([*preferred, *inherited]) if path
        )
        return resolved

    def run(
        self,
        argv: list[str],
        *,
        timeout: int = 30,
        env: dict[str, str] | None = None,
        input_text: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                argv,
                text=True,
                input=input_text,
                capture_output=True,
                check=False,
                timeout=timeout,
                env=self._environment(env),
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            return subprocess.CompletedProcess(argv, 127, "", type(error).__name__)

    def checked(
        self, argv: list[str], *, timeout: int = 30, env: dict[str, str] | None = None
    ) -> str:
        result = self.run(argv, timeout=timeout, env=env)
        if result.returncode:
            raise ControllerError(
                f"command failed: {pathlib.Path(argv[0]).name} (exit {result.returncode})"
            )
        return result.stdout


def _memory_gib() -> int:
    try:
        for line in pathlib.Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024 // 1024
    except OSError:
        pass
    return 0


def capacity_ready(
    cpu: int,
    memory_gib: int,
    disk_gib: int,
    *,
    store: StateStore | None = None,
    runner: Runner | None = None,
) -> bool:
    if cpu >= 10 and memory_gib >= 34 and disk_gib >= 125:
        return True
    if store is None or runner is None:
        return False
    try:
        receipt = store.read_receipt("ownership")
        resources = receipt.get("resources", [])
        if not isinstance(resources, list):
            return False
        expected = {
            (str(item.get("kind")), str(item.get("name"))): str(item.get("identity"))
            for item in resources
            if isinstance(item, dict) and item.get("kind") == "domain"
        }
        live = {
            (str(item.get("kind")), str(item.get("name"))): str(item.get("identity"))
            for item in inventory(runner, store)
            if item.get("kind") == "domain" and item.get("owned") is True
        }
    except ControllerError:
        return False
    required = {("domain", CE_DOMAIN), ("domain", WORKLOAD_DOMAIN)}
    return bool(
        set(expected) == required
        and set(live) == required
        and all(
            identity and live.get(key) == identity for key, identity in expected.items()
        )
    )


def _group_names() -> set[str]:
    group_ids = {os.getgid(), *os.getgroups()}
    names = {grp.getgrgid(group_id).gr_name for group_id in group_ids}
    user = pwd.getpwuid(os.getuid()).pw_name
    names.update(group.gr_name for group in grp.getgrall() if user in group.gr_mem)
    return names


def terraform_version_ready(runner: Runner) -> bool:
    result = runner.run(["terraform", "version", "-json"])
    if result.returncode:
        return False
    try:
        document = json.loads(result.stdout)
    except (TypeError, ValueError):
        return False
    return document.get("terraform_version") == TERRAFORM_VERSION


def package_ready(runner: Runner, package: str) -> bool:
    return (
        runner.run(
            ["dpkg-query", "--show", "--showformat=${db:Status-Abbrev}", package]
        ).returncode
        == 0
    )


def apt_packages_to_install(checks: dict[str, Any]) -> list[str]:
    packages = [
        name for name in APT_PACKAGES if not checks.get("packages", {}).get(name, False)
    ]
    if not checks.get("commands", {}).get("docker", False):
        packages.append("docker.io")
    return packages


def _install_terraform(runner: Runner) -> None:
    archive_name = f"terraform_{TERRAFORM_VERSION}_linux_amd64.zip"
    url = f"https://releases.hashicorp.com/terraform/{TERRAFORM_VERSION}/{archive_name}"
    with tempfile.TemporaryDirectory(prefix="kvm-smsv2-terraform-") as directory:
        root = pathlib.Path(directory)
        archive = root / archive_name
        runner.checked(
            [
                "curl",
                "--fail",
                "--silent",
                "--show-error",
                "--location",
                "--output",
                str(archive),
                url,
            ],
            timeout=600,
        )
        if file_digest(archive) != TERRAFORM_SHA256:
            raise ControllerError("Terraform archive checksum failed")
        try:
            with zipfile.ZipFile(archive) as bundle:
                members = bundle.namelist()
                if tuple(members) not in (("LICENSE.txt", "terraform"), ("terraform",)):
                    raise ControllerError("Terraform archive contents are unexpected")
                bundle.extract("terraform", root)
        except (OSError, zipfile.BadZipFile, KeyError) as error:
            raise ControllerError("Terraform archive is invalid") from error
        binary = root / "terraform"
        binary.chmod(0o755)
        target_directory = pathlib.Path.home() / ".local" / "bin"
        target_directory.mkdir(parents=True, exist_ok=True, mode=0o755)
        target = target_directory / "terraform"
        fd, temporary_name = tempfile.mkstemp(
            prefix=".terraform.", dir=target_directory
        )
        temporary = pathlib.Path(temporary_name)
        try:
            with binary.open("rb") as source, os.fdopen(fd, "wb") as destination:
                shutil.copyfileobj(source, destination)
                destination.flush()
                os.fsync(destination.fileno())
                os.fchmod(destination.fileno(), 0o755)
            os.replace(temporary, target)
            directory_fd = os.open(target_directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            with contextlib.suppress(FileNotFoundError):
                temporary.unlink()
    if not terraform_version_ready(runner):
        raise ControllerError(
            f"Terraform {TERRAFORM_VERSION} installation could not be verified"
        )


def readiness(
    runner: Runner | None = None, store: StateStore | None = None
) -> dict[str, Any]:
    runner = runner or Runner()
    os_release: dict[str, str] = {}
    try:
        for line in pathlib.Path("/etc/os-release").read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep:
                os_release[key] = value.strip().strip('"')
    except OSError:
        pass
    commands = {name: shutil.which(name) is not None for name in REQUIRED_COMMANDS}
    packages = {name: package_ready(runner, name) for name in APT_PACKAGES}
    terraform_ready = commands["terraform"] and terraform_version_ready(runner)
    groups = _group_names()
    modules = pathlib.Path("/dev/kvm").exists() and any(
        pathlib.Path("/sys/module", name).exists() for name in ("kvm_intel", "kvm_amd")
    )
    services = {
        name: {
            "active": runner.run(["systemctl", "is-active", "--quiet", name]).returncode
            == 0,
            "enabled": runner.run(
                ["systemctl", "is-enabled", "--quiet", name]
            ).returncode
            == 0,
        }
        for name in ("libvirtd", "docker")
    }
    virtualization = runner.run(["test", "-r", "/dev/kvm"]).returncode == 0
    cpu = os.cpu_count() or 0
    disk = (
        shutil.disk_usage(
            "/var/lib/libvirt/images"
            if pathlib.Path("/var/lib/libvirt/images").exists()
            else "/"
        ).free
        // 2**30
    )
    memory = _memory_gib()
    try:
        _artifact_manifest(_plugin_root())
        artifacts_ready = True
    except ControllerError:
        artifacts_ready = False
    try:
        lan = observe_home_lan(runner)
        lan["gap"] = (
            "none"
            if lan["bridgeReady"]
            else "wired management needs a rollback-protected bridge"
        )
    except (ControllerError, TypeError):
        lan = {"bridgeReady": False, "gap": "wired LAN discovery is incomplete"}
    checks: dict[str, Any] = {
        "platform": os_release.get("ID") == "ubuntu"
        and os_release.get("VERSION_ID") == "24.04"
        and platform.machine() == "x86_64",
        "passwordlessSudo": runner.run(["sudo", "-n", "true"]).returncode == 0,
        "commands": commands,
        "packages": packages,
        "terraform": {"requiredVersion": TERRAFORM_VERSION, "ready": terraform_ready},
        "groups": {name: name in groups for name in ("kvm", "libvirt", "docker")},
        "modules": modules,
        "services": services,
        "virtualization": virtualization,
        "artifacts": artifacts_ready,
        "lan": lan,
        "capacity": {
            "cpu": cpu,
            "memoryGiB": memory,
            "diskFreeGiB": disk,
            "ready": capacity_ready(cpu, memory, disk, store=store, runner=runner),
        },
    }
    core_ready = (
        checks["platform"]
        and checks["passwordlessSudo"]
        and all(commands.values())
        and all(packages.values())
        and terraform_ready
        and all(checks["groups"].values())
        and modules
        and all(
            service["active"] and service["enabled"] for service in services.values()
        )
        and virtualization
        and artifacts_ready
        and checks["capacity"]["ready"]
    )
    checks["coreReady"] = core_ready
    return {
        "state": "ready" if core_ready and lan["bridgeReady"] else "setup_required",
        "checks": checks,
    }


def _plugin_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent.parent


def _artifact_manifest(root: pathlib.Path) -> dict[str, str]:
    try:
        document = json.loads((root / "artifacts.json").read_text(encoding="utf-8"))
        artifacts = document["artifacts"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise ControllerError("immutable artifact manifest is unavailable") from error
    if not isinstance(artifacts, dict):
        raise ControllerError("immutable artifact manifest is malformed")
    for relative, expected in artifacts.items():
        path = root / relative
        if not path.is_file() or file_digest(path) != expected:
            raise ControllerError(f"artifact checksum failed: {relative}")
    return artifacts


def install_bundle(
    store: StateStore, source: pathlib.Path | None = None
) -> pathlib.Path:
    store.ensure()
    source = source or _plugin_root()
    artifacts = _artifact_manifest(source)
    manifest_digest = hashlib.sha256(
        json.dumps(artifacts, sort_keys=True).encode()
    ).hexdigest()
    target = store.releases / f"v{CONTROLLER_VERSION}-{manifest_digest[:12]}"
    if not target.exists():
        staging = pathlib.Path(tempfile.mkdtemp(prefix=".stage-", dir=store.releases))
        try:
            shutil.copy2(source / "artifacts.json", staging / "artifacts.json")
            for relative, expected in artifacts.items():
                source_path = source / relative
                copied = staging / relative
                copied.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_path, copied)
                if not copied.is_file() or file_digest(copied) != expected:
                    raise ControllerError(
                        f"staged artifact checksum failed: {relative}"
                    )
            os.replace(staging, target)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    installed_artifacts = _artifact_manifest(target)
    installed_digest = hashlib.sha256(
        json.dumps(installed_artifacts, sort_keys=True).encode()
    ).hexdigest()
    if installed_digest != manifest_digest:
        raise ControllerError(
            "installed bundle manifest differs from the source manifest"
        )
    link = store.root / "current"
    temporary = store.root / f".current-{os.getpid()}"
    with contextlib.suppress(FileNotFoundError):
        temporary.unlink()
    temporary.symlink_to(target)
    os.replace(temporary, link)
    store.write_receipt(
        "installation", {"release": target.name, "manifestSha256": manifest_digest}
    )
    return terraform_workspace(store, target)


def active_bundle(store: StateStore) -> pathlib.Path:
    receipt = store.read_receipt("installation")
    link = store.root / "current"
    try:
        target = link.resolve(strict=True)
    except OSError as error:
        raise ControllerError("installed bundle link is unavailable") from error
    if target.parent != store.releases.resolve() or target.name != receipt.get(
        "release"
    ):
        raise ControllerError(
            "installed bundle does not match its installation receipt"
        )
    artifacts = _artifact_manifest(target)
    digest = hashlib.sha256(json.dumps(artifacts, sort_keys=True).encode()).hexdigest()
    if digest != receipt.get("manifestSha256"):
        raise ControllerError(
            "installed bundle manifest does not match its installation receipt"
        )
    return target


def terraform_workspace(store: StateStore, bundle: pathlib.Path) -> pathlib.Path:
    workspace = store.root / "terraform"
    workspace.mkdir(parents=True, mode=0o700, exist_ok=True)
    for source in sorted((bundle / "terraform").iterdir()):
        if not source.is_file():
            continue
        target = workspace / source.name
        if target.exists() and file_digest(target) == file_digest(source):
            continue
        fd, temporary = tempfile.mkstemp(prefix=f".{source.name}.", dir=workspace)
        os.close(fd)
        try:
            shutil.copy2(source, temporary)
            os.replace(temporary, target)
        finally:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(temporary)
    return workspace


def _command_lines(runner: Runner, argv: list[str]) -> list[str]:
    result = runner.run(argv)
    return (
        [line.strip() for line in result.stdout.splitlines() if line.strip()]
        if result.returncode == 0
        else []
    )


def _resource_identity(runner: Runner, kind: str, name: str) -> tuple[str, bool]:
    if kind == "domain":
        result = runner.run(["virsh", "--connect", "qemu:///system", "domuuid", name])
    elif kind == "network":
        result = runner.run(["virsh", "--connect", "qemu:///system", "net-uuid", name])
    elif kind == "pool":
        result = runner.run(["virsh", "--connect", "qemu:///system", "pool-uuid", name])
    else:
        result = runner.run(
            [
                "docker",
                "inspect",
                "--format",
                '{{.Id}} {{index .Config.Labels "com.f5-sales-demo.owner"}}',
                name,
            ]
        )
    if result.returncode:
        return "", False
    fields = result.stdout.strip().split()
    if not fields:
        return "", False
    declared_owner = kind != "container" or (len(fields) == 2 and fields[1] == OWNER)
    return fields[0], declared_owner


def _resource_running(runner: Runner, kind: str, name: str) -> bool | None:
    if kind == "domain":
        result = runner.run(["virsh", "--connect", "qemu:///system", "domstate", name])
        return result.returncode == 0 and result.stdout.strip().lower() == "running"
    if kind == "container":
        result = runner.run(
            ["docker", "inspect", "--format", "{{.State.Running}}", name]
        )
        return result.returncode == 0 and result.stdout.strip().lower() == "true"
    return None


def inventory(
    runner: Runner | None = None, store: StateStore | None = None
) -> list[dict[str, Any]]:
    runner = runner or Runner()
    recorded: dict[tuple[str, str], str] = {}
    if store and (store.receipts / "ownership.json").exists():
        receipt = store.read_receipt("ownership")
        resources = receipt.get("resources", [])
        if not isinstance(resources, list):
            raise ControllerError("ownership receipt is malformed")
        for item in resources:
            if isinstance(item, dict) and all(
                isinstance(item.get(field), str)
                for field in ("kind", "name", "identity")
            ):
                recorded[(item["kind"], item["name"])] = item["identity"]
    result: list[dict[str, Any]] = []
    for kind, argv in (
        ("domain", ["virsh", "--connect", "qemu:///system", "list", "--all", "--name"]),
        (
            "network",
            ["virsh", "--connect", "qemu:///system", "net-list", "--all", "--name"],
        ),
        (
            "pool",
            ["virsh", "--connect", "qemu:///system", "pool-list", "--all", "--name"],
        ),
        ("container", ["docker", "ps", "--all", "--format", "{{.Names}}"]),
    ):
        for name in _command_lines(runner, argv):
            identity, declared_owner = _resource_identity(runner, kind, name)
            item = {
                "kind": kind,
                "name": name,
                "identity": identity,
                "owned": bool(identity)
                and declared_owner
                and recorded.get((kind, name)) == identity,
            }
            running = _resource_running(runner, kind, name)
            if running is not None:
                item["running"] = running
            result.append(item)
    return result


def parse_state_ownership(
    document: dict[str, Any], site_name: str
) -> tuple[list[dict[str, str]], bool]:
    """Extract only exact plugin resources from an interrupted local state."""
    mappings = {
        ("libvirt_pool", "site"): ("pool", POOL),
        ("libvirt_network", "site"): ("network", NETWORK),
        ("docker_container", "frr"): ("container", FRR),
        ("libvirt_domain", "ce"): ("domain", CE_DOMAIN),
        ("libvirt_domain", "workload"): ("domain", WORKLOAD_DOMAIN),
    }
    resources = document.get("resources", [])
    if not isinstance(resources, list):
        raise ControllerError("Terraform state ownership is malformed")
    recovered: list[dict[str, str]] = []
    site_owned = False
    for resource in resources:
        if not isinstance(resource, dict) or resource.get("mode") != "managed":
            continue
        instances = resource.get("instances", [])
        if not isinstance(instances, list) or len(instances) > 1:
            raise ControllerError("Terraform state ownership is malformed")
        if not instances:
            continue
        attributes = instances[0].get("attributes", {})
        if not isinstance(attributes, dict):
            raise ControllerError("Terraform state ownership is malformed")
        resource_type = resource.get("type")
        logical_name = resource.get("name")
        if not isinstance(resource_type, str) or not isinstance(logical_name, str):
            raise ControllerError("Terraform state ownership is malformed")
        key = (resource_type, logical_name)
        identity = attributes.get("id")
        resource_name = attributes.get("name")
        if key == ("xcsh_securemesh_site_v2", "site"):
            if identity != site_name or resource_name != site_name:
                raise ControllerError(
                    "Terraform state ownership does not match the site"
                )
            site_owned = True
            continue
        expected = mappings.get(key)
        if expected is None:
            continue
        kind, name = expected
        if not isinstance(identity, str) or not identity or resource_name != name:
            raise ControllerError("Terraform state ownership does not match the host")
        recovered.append({"kind": kind, "name": name, "identity": identity})
    return sorted(recovered, key=lambda item: (item["kind"], item["name"])), site_owned


def _recover_interrupted_ownership(
    store: StateStore,
    terraform_root: pathlib.Path,
    site_name: str,
    runner: Runner,
) -> bool:
    state_path = terraform_root / "terraform.tfstate"
    if not state_path.is_file():
        return False
    try:
        document = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ControllerError("Terraform state ownership is unreadable") from error
    if not isinstance(document, dict):
        raise ControllerError("Terraform state ownership is malformed")
    recovered, site_owned = parse_state_ownership(document, site_name)
    present: list[dict[str, str]] = []
    for resource in recovered:
        identity, declared_owner = _resource_identity(
            runner, resource["kind"], resource["name"]
        )
        if not identity:
            continue
        if identity != resource["identity"] or not declared_owner:
            raise ControllerError(
                f"ownership collision for {resource['kind']} {resource['name']}"
            )
        present.append(resource)
    if present:
        store.write_receipt("ownership", {"resources": present})
    return site_owned


def _capture_ownership(store: StateStore, runner: Runner) -> list[dict[str, str]]:
    expected = {POOL, NETWORK, FRR, CE_DOMAIN, WORKLOAD_DOMAIN}
    resources = []
    for item in inventory(runner):
        if item["name"] not in expected:
            continue
        if not item["identity"]:
            raise ControllerError(
                f"owned {item['kind']} {item['name']} has no stable identity"
            )
        if item["kind"] == "container":
            _, declared_owner = _resource_identity(runner, item["kind"], item["name"])
            if not declared_owner:
                raise ControllerError(
                    f"owned container {item['name']} has no owner label"
                )
        resources.append(
            {"kind": item["kind"], "name": item["name"], "identity": item["identity"]}
        )
    if {item["name"] for item in resources} != expected:
        raise ControllerError(
            "Terraform apply did not create the complete owned resource inventory"
        )
    store.write_receipt("ownership", {"resources": resources})
    return resources


def _credentials() -> tuple[str, str]:
    api_url = os.environ.get("XCSH_API_URL")
    token = os.environ.get("XCSH_API_TOKEN")
    directory = os.environ.get("CREDENTIALS_DIRECTORY")
    if directory:
        for name, assign in (("xc_api_url", "url"), ("xc_api_token", "token")):
            try:
                value = (
                    (pathlib.Path(directory) / name).read_text(encoding="utf-8").strip()
                )
            except OSError:
                continue
            if assign == "url":
                api_url = value
            else:
                token = value
    if not api_url or not token:
        raise ControllerError(
            "active xcsh context must provide XCSH_API_URL and XCSH_API_TOKEN"
        )
    return api_url.rstrip("/"), token


def _xc_json(path: str) -> dict[str, Any]:
    api_url, token = _credentials()
    request = urllib.request.Request(
        api_url + path,
        headers={
            "Authorization": f"APIToken {token}",
            "Accept": "application/json",
            "Connection": "close",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            value = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise ControllerError(f"XC read failed with HTTP {error.code}") from error
    except (OSError, ValueError) as error:
        raise ControllerError(f"XC read failed: {type(error).__name__}") from error
    if not isinstance(value, dict):
        raise ControllerError("XC read returned a non-object response")
    return value


def _site_observation(site_name: str) -> dict[str, Any] | None:
    quoted = urllib.parse.quote(site_name, safe="")
    try:
        value = _xc_json(
            f"/api/config/namespaces/{NAMESPACE}/securemesh_site_v2s/{quoted}"
        )
    except ControllerError as error:
        if "HTTP 404" in str(error):
            return None
        raise
    metadata = value.get("metadata", {}) if isinstance(value, dict) else {}
    labels = metadata.get("labels", {}) if isinstance(metadata, dict) else {}
    spec = value.get("spec", {}) if isinstance(value, dict) else {}
    software = spec.get("software_settings", {}) if isinstance(spec, dict) else {}
    software = software.get("sw", {}) if isinstance(software, dict) else {}
    kvm = spec.get("kvm", {}) if isinstance(spec, dict) else {}
    spec_matches = bool(
        isinstance(kvm, dict)
        and isinstance(kvm.get("not_managed"), dict)
        and isinstance(spec.get("disable_ha"), dict)
        and isinstance(software, dict)
        and software.get("volterra_software_version") == "crt-20260801-0205"
    )
    return {
        "name": metadata.get("name"),
        "namespace": metadata.get("namespace"),
        "owned": isinstance(labels, dict) and labels.get("owner") == OWNER,
        "specMatches": spec_matches,
        "state": spec.get("site_state", "UNKNOWN")
        if isinstance(spec, dict)
        else "UNKNOWN",
        "errorCount": len(spec.get("site_errors", []))
        if isinstance(spec, dict) and isinstance(spec.get("site_errors", []), list)
        else -1,
    }


def _application_observation(kind: str, name: str) -> dict[str, Any] | None:
    try:
        document = _xc_json(
            f"/api/config/namespaces/{NAMESPACE}/{kind}/{urllib.parse.quote(name, safe='')}"
        )
    except ControllerError as error:
        if "HTTP 404" in str(error):
            return None
        raise
    metadata = document.get("metadata", {})
    if not isinstance(metadata, dict):
        raise ControllerError("XC application ownership metadata is malformed")
    labels = metadata.get("labels", {})
    return {
        "name": metadata.get("name"),
        "owned": bool(
            metadata.get("name") == name
            and metadata.get("namespace") == NAMESPACE
            and isinstance(labels, dict)
            and labels.get("owner") == OWNER
        ),
    }


def _owned_application_object(kind: str, name: str) -> dict[str, Any]:
    value = _application_observation(kind, name)
    if value is None:
        raise ControllerError("owned XC application object is absent")
    return value


def parse_registration_observation(
    document: dict[str, Any], site_name: str
) -> dict[str, Any]:
    items = document.get("items", [])
    if not isinstance(items, list):
        raise ControllerError("registration response has no items array")
    registrations = []
    for item in items:
        if not isinstance(item, dict):
            raise ControllerError("registration response contains a malformed item")
        get_spec = item.get("get_spec", {})
        get_spec = get_spec if isinstance(get_spec, dict) else {}
        passport = get_spec.get("passport", {})
        passport = passport if isinstance(passport, dict) else {}
        if passport.get("cluster_name") not in (None, "", site_name):
            continue
        infra = get_spec.get("infra", {})
        infra = infra if isinstance(infra, dict) else {}
        status = item.get("object", {})
        status = status.get("status", {}) if isinstance(status, dict) else {}
        state = (
            status.get("current_state", "UNKNOWN")
            if isinstance(status, dict)
            else "UNKNOWN"
        )
        network = infra.get("hw_info", {})
        network = network.get("network", []) if isinstance(network, dict) else []
        macs = (
            sorted(
                str(adapter.get("mac_address", "")).lower()
                for adapter in network
                if isinstance(adapter, dict) and adapter.get("mac_address")
            )
            if isinstance(network, list)
            else []
        )
        registrations.append(
            {
                "name": str(item.get("name", "")),
                "state": str(state),
                "provider": str(infra.get("provider") or ""),
                "hostname": str(infra.get("hostname", "")),
                "macs": macs,
            }
        )
    return {
        "count": len(registrations),
        "onlineCount": sum(item["state"] == "ONLINE" for item in registrations),
        "registrations": registrations,
    }


def _peer_ip(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        ipv4 = value.get("ipv4")
        if isinstance(ipv4, str):
            return ipv4
        if isinstance(ipv4, dict):
            return str(ipv4.get("addr", ""))
    return ""


def parse_bgp_observation(
    peers: dict[str, Any], routes: dict[str, Any]
) -> dict[str, Any]:
    matches: list[dict[str, Any]] = []
    for node in peers.get("ver", []):
        if not isinstance(node, dict):
            continue
        for peer in node.get("peer", []):
            if (
                isinstance(peer, dict)
                and _peer_ip(peer.get("peer_address")) == "10.100.0.2"
            ):
                matches.append(peer)
    imported: set[str] = set()
    exported: set[str] = set()
    for node in routes.get("ver", []):
        if not isinstance(node, dict):
            continue
        for instance in node.get("ri_table", []):
            if not isinstance(instance, dict):
                continue
            for table in instance.get("rt_table", []):
                if not isinstance(table, dict):
                    continue
                for route in table.get("imported", []):
                    if not isinstance(route, dict):
                        continue
                    if any(
                        isinstance(path, dict)
                        and _peer_ip(path.get("peer")) == "10.100.0.2"
                        for path in route.get("path", [])
                    ):
                        imported.add(str(route.get("subnet", "")))
                for route in table.get("exported", []):
                    if isinstance(route, dict) and route.get("subnet"):
                        exported.add(str(route["subnet"]))
    advertised = sum(
        int(peer.get("advertised_prefix_count", 0))
        for peer in matches
        if isinstance(peer.get("advertised_prefix_count", 0), (int, float))
    )
    return {
        "peerCount": len(matches),
        "establishedCount": sum(
            peer.get("protocol_status") == "Established" for peer in matches
        ),
        "importedRoutes": sorted(imported),
        "exportedRoutes": sorted(exported),
        "advertisedRouteCount": max(advertised, len(exported)),
    }


def _terraform_env(store: StateStore | None = None) -> dict[str, str]:
    api_url, token = _credentials()
    env = dict(os.environ)
    env.update({"XCSH_API_URL": api_url, "XCSH_API_TOKEN": token})
    if store is not None:
        env["TF_CLI_CONFIG_FILE"] = str(store.root / "terraform" / "registry.tfrc")
        data_dir = store.root / "terraform-data"
        data_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
        env["TF_DATA_DIR"] = str(data_dir)
    return env


def _config(store: StateStore, params: dict[str, Any]) -> dict[str, Any]:
    path = store.root / "deployment.json"
    if path.exists():
        value = json.loads(path.read_text(encoding="utf-8"))
        if params.get("siteName") and params["siteName"] != value.get("siteName"):
            raise ControllerError("persisted site name differs from the requested name")
        return value
    site = str(params.get("siteName") or default_site_name(socket.gethostname()))
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?", site):
        raise ControllerError("site name is not a valid XC name")
    store.ensure()
    value = {"siteName": site, "namespace": NAMESPACE, "owner": OWNER}
    fd, temporary = tempfile.mkstemp(prefix=".deployment.", dir=store.root)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True)
        stream.write("\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    return value


def _terraform_plan(
    store: StateStore,
    terraform_root: pathlib.Path,
    config: dict[str, Any],
    mode: str,
    runner: Runner,
) -> dict[str, Any]:
    env = _terraform_env(store)
    variables = terraform_root / "terraform.tfvars.json"
    lan = config.get("lan")
    if not lan:
        raise ControllerError("saved LAN selection is required before planning")
    variables.write_text(
        json.dumps(
            {
                "site_name": config["siteName"],
                "xc_api_url": env["XCSH_API_URL"],
                "lan_bridge": lan["bridge"],
                "lan_subnet": lan["subnet"],
                "sli_address": lan["sliAddress"],
                "vip_address": lan["vipAddress"],
            }
        )
        + "\n"
    )
    variables.chmod(0o600)
    runner.checked(
        [
            "terraform",
            f"-chdir={terraform_root}",
            "init",
            "-input=false",
            "-lockfile=readonly",
        ],
        timeout=300,
        env=env,
    )
    plan = store.plans / f"{mode}.tfplan"
    argv = [
        "terraform",
        f"-chdir={terraform_root}",
        "plan",
        "-input=false",
        "-lock=true",
        f"-out={plan}",
    ]
    if mode == "destroy":
        argv.append("-destroy")
    result = runner.run(argv, timeout=900, env=env)
    if result.returncode not in (0, 2):
        raise ControllerError(f"Terraform {mode} planning failed; output withheld")
    plan.chmod(0o600)
    shown = runner.checked(
        ["terraform", f"-chdir={terraform_root}", "show", "-json", str(plan)],
        timeout=120,
        env=env,
    )
    try:
        plan_json = json.loads(shown)
    except ValueError as error:
        raise ControllerError("Terraform saved-plan JSON is malformed") from error
    summary = inspect_plan(plan_json)
    if mode == "apply":
        require_home_lan_plan(plan_json)
    digest = file_digest(plan)
    receipt = {
        "mode": mode,
        "path": str(plan),
        "sha256": digest,
        "summary": summary,
        "siteName": config["siteName"],
    }
    store.write_receipt(f"plan-{mode}", receipt)
    return receipt


def _apply_plan(
    store: StateStore,
    terraform_root: pathlib.Path,
    receipt: dict[str, Any],
    runner: Runner,
) -> dict[str, Any]:
    plan = pathlib.Path(str(receipt["path"]))
    require_plan_digest(plan, str(receipt["sha256"]))
    if receipt["mode"] == "apply":
        config = _config(store, {})
        selection = config.get("lan")
        if not isinstance(selection, dict):
            raise ControllerError("LAN selection was not persisted before apply")
        snapshot = observe_home_lan(runner)
        if (
            snapshot["subnet"] != selection["subnet"]
            or snapshot["bridge"] != selection["bridge"]
        ):
            raise ControllerError("LAN changed since the saved plan was reviewed")
        if any(
            selection[key] in _observed_lan_leases(runner, snapshot["subnet"])
            for key in ("sliAddress", "vipAddress")
        ):
            raise ControllerError("a selected LAN address entered observed DHCP leases")
        baseline_path = store.receipts / "lan-arp-owners.json"
        expected = (
            store.read_receipt("lan-arp-owners").get("macs")
            if baseline_path.exists()
            else None
        )
        validate_lan_recheck(
            selection,
            expected,
            lambda address: _lan_arp_mac(runner, snapshot["bridge"], address),
        )
    result = runner.run(
        [
            "terraform",
            f"-chdir={terraform_root}",
            "apply",
            "-input=false",
            "-auto-approve",
            str(plan),
        ],
        timeout=7200,
        env=_terraform_env(store),
    )
    output_hash = hashlib.sha256((result.stdout + result.stderr).encode()).hexdigest()
    if result.returncode:
        error_kind = (
            "eof" if "eof" in (result.stdout + result.stderr).lower() else "terraform"
        )
        raise ControllerError(
            f"Terraform saved-plan apply failed ({error_kind}); output sha256 {output_hash}"
        )
    applied = {
        "planSha256": receipt["sha256"],
        "outputSha256": output_hash,
        "outputBytes": len((result.stdout + result.stderr).encode()),
    }
    store.write_receipt(f"apply-{receipt['mode']}", applied)
    return applied


def _guest_traffic(runner: Runner, samples: int = 5) -> dict[str, int]:
    successes = 0
    for _ in range(samples):
        request = json.dumps(
            {
                "execute": "guest-exec",
                "arguments": {
                    "path": "/usr/bin/ping",
                    "arg": ["-c", "1", "-W", "5", CE_ADDRESS],
                    "capture-output": False,
                },
            },
            separators=(",", ":"),
        )
        started = runner.run(
            [
                "virsh",
                "--connect",
                "qemu:///system",
                "qemu-agent-command",
                WORKLOAD_DOMAIN,
                request,
            ]
        )
        if started.returncode:
            continue
        try:
            pid = json.loads(started.stdout)["return"]["pid"]
        except (KeyError, TypeError, ValueError):
            continue
        for _poll in range(30):
            status_request = json.dumps(
                {"execute": "guest-exec-status", "arguments": {"pid": pid}},
                separators=(",", ":"),
            )
            observed = runner.run(
                [
                    "virsh",
                    "--connect",
                    "qemu:///system",
                    "qemu-agent-command",
                    WORKLOAD_DOMAIN,
                    status_request,
                ]
            )
            if observed.returncode:
                break
            try:
                result = json.loads(observed.stdout)["return"]
            except (KeyError, TypeError, ValueError):
                break
            if result.get("exited") is True:
                successes += result.get("exitcode") == 0
                break
            time.sleep(1)
    return {"samples": samples, "successes": successes}


def image_hash_observation(
    ce_path: pathlib.Path,
    ce_expected: str,
    workload_path: pathlib.Path,
    workload_expected: str,
) -> dict[str, Any]:
    def observe(path: pathlib.Path, algorithm: str, expected: str) -> dict[str, Any]:
        actual = file_digest(path, algorithm) if path.is_file() else ""
        return {
            "algorithm": algorithm,
            "expected": expected,
            "actual": actual,
            "verified": actual == expected,
        }

    result: dict[str, Any] = {
        "ce": observe(ce_path, "md5", ce_expected),
        "workload": observe(workload_path, "sha512", workload_expected),
    }
    result["verified"] = all(image["verified"] for image in result.values())
    return result


def _memory_to_kib(value: int, unit: str) -> int:
    factors = {"b": 1 / 1024, "kib": 1, "mib": 1024, "gib": 1024 * 1024}
    return int(value * factors.get(unit.lower(), 0))


def _domain_observation(runner: Runner, name: str) -> dict[str, Any]:
    xml_result = runner.run(["virsh", "--connect", "qemu:///system", "dumpxml", name])
    if xml_result.returncode:
        return {"exists": False, "state": "absent", "macs": [], "diskCapacityBytes": 0}
    try:
        root = ET.fromstring(xml_result.stdout)
        vcpu = int(root.findtext("vcpu", "0"))
        memory_element = root.find("memory")
        memory_kib = (
            _memory_to_kib(
                int(memory_element.text or "0"), memory_element.get("unit", "KiB")
            )
            if memory_element is not None
            else 0
        )
        macs = sorted(
            str(element.get("address", "")).lower()
            for element in root.findall("./devices/interface/mac")
            if element.get("address")
        )
        disk_target = next(
            (
                str(element.get("dev"))
                for element in root.findall("./devices/disk[@device='disk']/target")
                if element.get("dev")
            ),
            "",
        )
    except (ET.ParseError, TypeError, ValueError) as error:
        raise ControllerError(f"libvirt domain XML is malformed for {name}") from error
    capacity = 0
    if disk_target:
        info = runner.run(
            [
                "virsh",
                "--connect",
                "qemu:///system",
                "domblkinfo",
                name,
                disk_target,
            ]
        )
        if info.returncode == 0:
            match = re.search(r"(?m)^Capacity:\s*(\d+)\s*$", info.stdout)
            capacity = int(match.group(1)) if match else 0
    state = runner.run(["virsh", "--connect", "qemu:///system", "domstate", name])
    return {
        "exists": True,
        "state": state.stdout.strip().lower() if state.returncode == 0 else "unknown",
        "vcpu": vcpu,
        "memoryKiB": memory_kib,
        "macs": macs,
        "diskCapacityBytes": capacity,
    }


def _dhcp_addresses(runner: Runner, mac: str) -> list[str]:
    result = runner.run(
        [
            "virsh",
            "--connect",
            "qemu:///system",
            "net-dhcp-leases",
            NETWORK,
            "--mac",
            mac,
        ]
    )
    if result.returncode:
        return []
    return sorted(
        set(re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}\b", result.stdout))
    )


def _domain_identity_ready(
    domain: dict[str, Any],
    addresses: list[str],
    mac: str,
    address: str,
    *,
    vcpu: int,
    memory_kib: int,
    disk_bytes: int,
) -> bool:
    return bool(
        domain.get("exists") is True
        and domain.get("state") == "running"
        and domain.get("vcpu") == vcpu
        and domain.get("memoryKiB") == memory_kib
        and domain.get("diskCapacityBytes", 0) >= disk_bytes
        and mac.lower() in domain.get("macs", [])
        and f"{address}/24" in addresses
    )


def ce_identity_ready(
    domain: dict[str, Any], addresses: list[str], mac: str = CE_MAC
) -> bool:
    return _domain_identity_ready(
        domain,
        addresses,
        mac,
        CE_ADDRESS,
        vcpu=8,
        memory_kib=32 * 1024 * 1024,
        disk_bytes=100 * 1024**3,
    )


def _zero_change(
    store: StateStore, terraform_root: pathlib.Path, runner: Runner
) -> bool:
    plan = store.plans / "verification.tfplan"
    result = runner.run(
        [
            "terraform",
            f"-chdir={terraform_root}",
            "plan",
            "-input=false",
            "-lock=true",
            "-detailed-exitcode",
            f"-out={plan}",
        ],
        timeout=900,
        env=_terraform_env(store),
    )
    if result.returncode not in (0, 2) or not plan.is_file():
        return False
    plan.chmod(0o600)
    digest = file_digest(plan)
    summary: dict[str, Any] = {}
    try:
        shown = runner.checked(
            ["terraform", f"-chdir={terraform_root}", "show", "-json", str(plan)],
            timeout=120,
            env=_terraform_env(store),
        )
        summary = inspect_plan(json.loads(shown))
    except (ControllerError, ValueError):
        return False
    zero = result.returncode == 0 and all(
        summary.get(action) == 0 for action in ("create", "update", "delete")
    )
    store.write_receipt(
        "plan-verification",
        {"path": str(plan), "sha256": digest, "summary": summary, "zeroChange": zero},
    )
    return zero


def _runtime_status(
    store: StateStore,
    runner: Runner,
    terraform_root: pathlib.Path | None = None,
) -> dict[str, Any]:
    config = _config(store, {})
    lan_selection = config.get("lan")
    if not isinstance(lan_selection, dict):
        raise ControllerError("persisted LAN selection is missing")
    terraform_root = terraform_root or terraform_workspace(store, active_bundle(store))
    try:
        identity = json.loads(
            runner.checked(
                [
                    "terraform",
                    f"-chdir={terraform_root}",
                    "output",
                    "-json",
                    "identity",
                ],
                env=_terraform_env(store),
            )
        )
        interfaces = map_ce_interfaces(
            [identity["slo_interface"], identity["sli_interface"]]
        )
        if not all(item.get("interface_name") for item in interfaces.values()):
            raise ControllerError("XC interface names are incomplete")
    except (ValueError, KeyError, TypeError) as error:
        raise ControllerError("Terraform SLO/SLI identity is unavailable") from error
    site = _site_observation(config["siteName"])
    domains = {
        name: runner.run(["virsh", "--connect", "qemu:///system", "domstate", name])
        .stdout.strip()
        .lower()
        for name in (CE_DOMAIN, WORKLOAD_DOMAIN)
    }
    quoted_site = urllib.parse.quote(config["siteName"], safe="")
    registration = parse_registration_observation(
        _xc_json(
            f"/api/register/namespaces/{NAMESPACE}/registrations_by_site/{quoted_site}"
        ),
        config["siteName"],
    )
    bgp = parse_bgp_observation(
        _xc_json(
            f"/api/operate/namespaces/{NAMESPACE}/sites/{quoted_site}/ver/bgp_peers"
        ),
        _xc_json(
            f"/api/operate/namespaces/{NAMESPACE}/sites/{quoted_site}/ver/bgp_routes"
        ),
    )
    ce = _domain_observation(runner, CE_DOMAIN)
    workload = _domain_observation(runner, WORKLOAD_DOMAIN)
    ce_addresses = _dhcp_addresses(runner, CE_MAC)
    workload_addresses = _dhcp_addresses(runner, WORKLOAD_MAC)
    cache_root = pathlib.Path("~/.cache/xcsh/kvm-smsv2").expanduser()
    images = image_hash_observation(
        cache_root / f"ce-{CE_IMAGE_MD5}.qcow2",
        CE_IMAGE_MD5,
        cache_root / f"workload-{WORKLOAD_IMAGE_SHA512[:16]}.qcow2",
        WORKLOAD_IMAGE_SHA512,
    )
    store.write_receipt("image-hashes", images)
    lan_observed = observe_home_lan(runner)
    domain = f"{config['siteName']}.internal.f5-sales-demo.com"
    local_http = runner.run(
        [
            "curl",
            "-fsS",
            "--max-time",
            "8",
            "--resolve",
            f"{domain}:80:{lan_selection['vipAddress']}",
            f"http://{domain}/",
        ],
        timeout=12,
    )
    lan = {
        "selection": lan_selection,
        "observed": lan_observed,
        "bridgeReady": lan_observed["bridgeReady"]
        and lan_observed["bridge"] == lan_selection["bridge"],
        "localHttp": local_http.returncode == 0,
        "dhcpExclusionVerified": False,
        "externalLanHttpVerified": False,
    }
    application = {
        "origin": _owned_application_object(
            "origin_pools", f"{config['siteName']}-origin"
        ),
        "httpLb": _owned_application_object(
            "http_loadbalancers", f"{config['siteName']}-lan"
        ),
        "hostname": domain,
        "vipAddress": lan_selection["vipAddress"],
    }
    macs = {
        address: _lan_arp_mac(runner, lan_observed["bridge"], address)
        for address in (lan_selection["sliAddress"], lan_selection["vipAddress"])
    }
    baseline_path = store.receipts / "lan-arp-owners.json"
    if (
        not baseline_path.exists()
        and all(macs.values())
        and macs[lan_selection["sliAddress"]] == SLI_MAC
        and local_http.returncode == 0
        and all(
            item["owned"] for item in (application["origin"], application["httpLb"])
        )
    ):
        store.write_receipt("lan-arp-owners", {"macs": macs})
    baseline = (
        store.read_receipt("lan-arp-owners").get("macs")
        if baseline_path.exists()
        else None
    )
    try:
        validate_lan_recheck(lan_selection, baseline, macs.get)
    except ControllerError:
        lan["conflictFree"] = False
    else:
        lan["conflictFree"] = bool(baseline and all(macs.values()))
    lan["arpMacs"] = macs
    host = {
        "ce": ce,
        "ceAddresses": ce_addresses,
        "ceIdentityReady": ce_identity_ready(ce, ce_addresses),
        "sliIdentityReady": SLI_MAC in ce.get("macs", []),
        "xcInterfaces": interfaces,
        "workload": workload,
        "workloadAddresses": workload_addresses,
        "workloadIdentityReady": _domain_identity_ready(
            workload,
            workload_addresses,
            WORKLOAD_MAC,
            WORKLOAD_ADDRESS,
            vcpu=2,
            memory_kib=2 * 1024 * 1024,
            disk_bytes=20 * 1024**3,
        ),
    }
    result = {
        "siteName": config["siteName"],
        "site": site,
        "registration": registration,
        "domains": domains,
        "host": host,
        "lan": lan,
        "application": application,
        "images": images,
        "bgp": bgp,
        "traffic": _guest_traffic(runner),
        "zeroChange": _zero_change(store, terraform_root, runner),
    }
    result["accepted"] = acceptance_ready(result)
    return result


def acceptance_ready(status: dict[str, Any]) -> bool:
    site = status.get("site", {})
    registration = status.get("registration", {})
    bgp = status.get("bgp", {})
    traffic = status.get("traffic", {})
    host = status.get("host", {})
    images = status.get("images", {})
    application = status.get("application", {})
    origin = application.get("origin", {})
    lb = application.get("httpLb", {})
    registrations = registration.get("registrations", [])
    registration_identity = bool(
        len(registrations) == 1
        and registrations[0].get("provider") == "KVM"
        and CE_MAC in registrations[0].get("macs", [])
        and SLI_MAC in registrations[0].get("macs", [])
    )
    return bool(
        site.get("state") == "ONLINE"
        and site.get("errorCount") == 0
        and registration.get("count") == 1
        and registration.get("onlineCount") == 1
        and registration_identity
        and host.get("ceIdentityReady") is True
        and host.get("sliIdentityReady") is True
        and host.get("workloadIdentityReady") is True
        and status.get("lan", {}).get("bridgeReady") is True
        and status.get("lan", {}).get("localHttp") is True
        and status.get("lan", {}).get("conflictFree") is True
        and isinstance(origin, dict)
        and origin.get("owned") is True
        and isinstance(lb, dict)
        and lb.get("owned") is True
        and images.get("verified") is True
        and bgp.get("peerCount") == 1
        and bgp.get("establishedCount") == 1
        and LAB_ROUTE in bgp.get("importedRoutes", [])
        and bgp.get("advertisedRouteCount", 0) >= 1
        and traffic.get("samples", 0) >= 1
        and traffic.get("successes") == traffic.get("samples")
        and status.get("zeroChange") is True
    )


def setup_status(store: StateStore, runner: Runner) -> dict[str, Any]:
    """Report ready only for a currently accepted, receipt-bound deployment."""
    host = readiness(runner, store)
    accepted = False
    if host.get("state") == "ready":
        try:
            status_receipt = store.read_receipt("status")
            ownership_receipt = store.read_receipt("ownership")
        except ControllerError:
            pass
        else:
            expected = {
                (str(item.get("kind")), str(item.get("name"))): str(
                    item.get("identity")
                )
                for item in ownership_receipt.get("resources", [])
                if isinstance(item, dict)
            }
            live = {
                (str(item.get("kind")), str(item.get("name"))): str(
                    item.get("identity")
                )
                for item in inventory(runner, store)
                if item.get("owned") is True
            }
            required = {
                ("pool", POOL),
                ("network", NETWORK),
                ("container", FRR),
                ("domain", CE_DOMAIN),
                ("domain", WORKLOAD_DOMAIN),
            }
            accepted = bool(
                status_receipt.get("accepted") is True
                and set(expected) == required
                and set(live) == required
                and all(live.get(key) == identity for key, identity in expected.items())
            )
    return {
        **host,
        "state": "ready" if accepted else "setup_required",
        "deploymentAccepted": accepted,
    }


def _wait_for_acceptance(
    store: StateStore,
    terraform_root: pathlib.Path,
    runner: Runner,
    timeout_seconds: int = 1800,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    last_error = "acceptance observations are not yet available"
    while True:
        try:
            status = _runtime_status(store, runner, terraform_root)
        except ControllerError as error:
            last_error = str(error)
        else:
            store.write_receipt("status", status)
            if status["accepted"]:
                return status
            last_error = (
                "ONLINE, BGP, route, traffic, or zero-change acceptance is pending"
            )
        if time.monotonic() >= deadline:
            store.write_receipt(
                "acceptance-failure",
                {"error": last_error, "timeoutSeconds": timeout_seconds},
            )
            raise ControllerError(f"deployment acceptance timed out: {last_error}")
        time.sleep(min(30, max(1, deadline - time.monotonic())))


def _deploy(
    store: StateStore,
    params: dict[str, Any],
    runner: Runner,
    *,
    reconcile: bool = False,
    terraform_root: pathlib.Path | None = None,
) -> dict[str, Any]:
    terraform_root = terraform_root or install_bundle(store)
    config = _config(store, params)
    state_owned_site = _recover_interrupted_ownership(
        store, terraform_root, config["siteName"], runner
    )
    state = readiness(runner, store)
    if state["checks"].get("coreReady") is not True:
        raise ControllerError("host readiness is incomplete")
    observed = _site_observation(config["siteName"])
    if observed and not (observed["owned"] and observed["specMatches"]):
        raise ControllerError("site naming or ownership collision")
    for kind, name in (
        ("origin_pools", f"{config['siteName']}-origin"),
        ("http_loadbalancers", f"{config['siteName']}-lan"),
    ):
        application_observation = _application_observation(kind, name)
        if application_observation and not application_observation["owned"]:
            raise ControllerError("XC application name belongs to an unowned object")
    if (
        observed
        and not reconcile
        and not (store.receipts / "apply-apply.json").exists()
        and not state_owned_site
    ):
        raise ControllerError(
            "owned site exists without a matching local receipt; use reconcile"
        )
    host_inventory = inventory(runner, store)
    reject_collisions(host_inventory)
    prepare_home_lan(store, runner, config)
    if readiness(runner, store)["state"] != "ready":
        raise ControllerError("wired LAN remediation did not complete host readiness")
    store.write_receipt(
        "intent",
        {
            **config,
            "inventory": host_inventory,
        },
    )
    plan = _terraform_plan(store, terraform_root, config, "apply", runner)
    try:
        applied = _apply_plan(store, terraform_root, plan, runner)
    except ControllerError as error:
        exact = _site_observation(config["siteName"])
        classification = classify_ambiguous_post(str(error), exact)
        applications = {
            kind: _application_observation(kind, name)
            for kind, name in (
                ("origin_pools", f"{config['siteName']}-origin"),
                ("http_loadbalancers", f"{config['siteName']}-lan"),
            )
        }
        store.write_receipt(
            "ambiguous-post",
            {
                "classification": classification,
                "site": exact,
                "applications": applications,
                "error": str(error),
            },
        )
        raise
    _capture_ownership(store, runner)
    status = _wait_for_acceptance(store, terraform_root, runner)
    return {"deployment": applied, "plan": plan, "status": status}


def _destroy(store: StateStore, runner: Runner) -> dict[str, Any]:
    config = _config(store, {})
    exact = _site_observation(config["siteName"])
    if exact and not (exact["owned"] and exact["specMatches"]):
        raise ControllerError("destroy refused an unowned or mismatched site")
    application_names = {
        "origin_pools": f"{config['siteName']}-origin",
        "http_loadbalancers": f"{config['siteName']}-lan",
    }
    for kind, name in application_names.items():
        observed = _application_observation(kind, name)
        if observed and not observed["owned"]:
            raise ControllerError("destroy refused an unowned XC application object")
    terraform_root = install_bundle(store)
    host_inventory = inventory(runner, store)
    reject_collisions(host_inventory)
    plan = _terraform_plan(store, terraform_root, config, "destroy", runner)
    applied = _apply_plan(store, terraform_root, plan, runner)
    remaining = [item for item in inventory(runner, store) if item.get("owned")]
    if (
        remaining
        or _site_observation(config["siteName"]) is not None
        or any(
            _application_observation(kind, name) is not None
            for kind, name in application_names.items()
        )
    ):
        raise ControllerError("owned resource absence verification failed")
    lan_receipt = store.read_receipt("lan")
    original_lan = lan_receipt.get("inventory", {})
    bridge_restored = False
    if original_lan.get("bridgeReady") is False:
        selection = lan_receipt.get("selection", {})
        if selection != config.get("lan") or selection.get("bridge") != "xckvmlan":
            raise ControllerError("bridge teardown lacks an exact owned LAN receipt")
        runner.checked(
            [
                "sudo",
                "python3",
                str(active_bundle(store) / "scripts" / "bridge-prep.py"),
                "restore",
            ],
            timeout=155,
        )
        bridge_restored = True
    receipt = {
        "deployment": applied,
        "remainingOwned": [],
        "preserved": unrelated_resources(host_inventory),
        "bridgeRestored": bridge_restored,
    }
    store.write_receipt("status", {"accepted": False, "destroyed": True})
    store.write_receipt("destroy", receipt)
    return receipt


def _herdr_ids(runner: Runner) -> list[str]:
    if os.environ.get("HERDR_ENV") != "1" or shutil.which("herdr") is None:
        return []
    result = runner.run(["herdr", "workspace", "list"])
    if result.returncode:
        return []
    return sorted(set(re.findall(r"\bw\d+\b", result.stdout)))


def _persist_resume_credentials(runner: Runner, store: StateStore) -> None:
    api_url, token = _credentials()
    credential_root = pathlib.Path("/var/lib/kvm-smsv2/credentials")
    runner.checked(["sudo", "install", "-d", "-m", "0700", str(credential_root)])
    for name, value in (("xc_api_url", api_url), ("xc_api_token", token)):
        target = credential_root / f"{name}.cred"
        temporary = credential_root / f".{name}.{os.getpid()}.cred"
        result = runner.run(
            ["sudo", "systemd-creds", "encrypt", f"--name={name}", "-", str(temporary)],
            input_text=value,
        )
        if result.returncode:
            raise ControllerError("systemd credential encryption failed")
        runner.checked(["sudo", "mv", str(temporary), str(target)])
    user = pwd.getpwuid(os.getuid()).pw_name
    installed_controller = active_bundle(store) / "scripts" / "kvm_smsv2_controller.py"
    unit = f"""[Unit]\nDescription=Resume xcsh KVM SMSv2 deployment\nAfter=network-online.target libvirtd.service docker.service\nWants=network-online.target\n\n[Service]\nType=oneshot\nUser={user}\nEnvironment=KVM_SMSV2_STATE_DIR={store.root}\nLoadCredentialEncrypted=xc_api_url:{credential_root}/xc_api_url.cred\nLoadCredentialEncrypted=xc_api_token:{credential_root}/xc_api_token.cred\nExecStart=/usr/bin/python3 {installed_controller} --json setup resume\nTimeoutStartSec=2h\n\n[Install]\nWantedBy=multi-user.target\n"""
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8") as unit_file:
        unit_file.write(unit)
        unit_file.flush()
        runner.checked(
            [
                "sudo",
                "install",
                "-m",
                "0644",
                unit_file.name,
                "/etc/systemd/system/kvm-smsv2-resume.service",
            ]
        )
    runner.checked(["sudo", "systemctl", "daemon-reload"])
    runner.checked(["sudo", "systemctl", "enable", "kvm-smsv2-resume.service"])


def _erase_resume_credentials(runner: Runner) -> None:
    runner.run(["sudo", "systemctl", "disable", "kvm-smsv2-resume.service"])
    for path in (
        "/var/lib/kvm-smsv2/credentials/xc_api_url.cred",
        "/var/lib/kvm-smsv2/credentials/xc_api_token.cred",
    ):
        runner.run(["sudo", "shred", "--remove", path])


def _setup_apply(
    store: StateStore, params: dict[str, Any], runner: Runner
) -> dict[str, Any]:
    _credentials()
    config = _config(store, params)
    _recover_interrupted_ownership(
        store, store.root / "terraform", config["siteName"], runner
    )
    initial_inventory = inventory(runner, store)
    reject_collisions(initial_inventory)
    before = readiness(runner, store)
    reboot_required = False
    if not before["checks"]["platform"]:
        raise ControllerError("only Ubuntu 24.04 x86_64 is supported")
    if not before["checks"]["passwordlessSudo"]:
        raise ControllerError("passwordless sudo is required for installation")
    missing_packages = apt_packages_to_install(before["checks"])
    if missing_packages:
        runner.checked(["sudo", "apt-get", "update"], timeout=600)
        runner.checked(
            ["sudo", "apt-get", "install", "--yes", *missing_packages], timeout=1800
        )
    if not terraform_version_ready(runner):
        _install_terraform(runner)
    user = pwd.getpwuid(os.getuid()).pw_name
    for group, present in before["checks"]["groups"].items():
        if not present:
            runner.checked(["sudo", "usermod", "--append", "--groups", group, user])
            reboot_required = True
    if not before["checks"]["modules"]:
        for module in (
            "kvm",
            "kvm_intel" if "intel" in platform.processor().lower() else "kvm_amd",
        ):
            if runner.run(["sudo", "modprobe", module]).returncode:
                raise ControllerError(f"kernel module {module} could not be loaded")
    for service, observed in before["checks"]["services"].items():
        if not (observed["active"] and observed["enabled"]):
            runner.checked(
                ["sudo", "systemctl", "enable", "--now", service], timeout=120
            )
    after = readiness(runner, store)
    if not after["checks"]["capacity"]["ready"]:
        raise ControllerError(
            "host capacity is below 10 CPU, 34 GiB available memory, or 125 GiB free disk"
        )
    if reboot_required or not all(after["checks"]["groups"].values()):
        checkpoint = {
            "phase": "reboot_pending",
            "siteName": _config(store, params)["siteName"],
            "inventory": initial_inventory,
            "unrelated": unrelated_resources(initial_inventory),
            "herdrWorkspaces": _herdr_ids(runner),
            "artifactManifest": store.read_receipt("installation")
            if (store.receipts / "installation.json").exists()
            else {},
        }
        store.write_receipt("checkpoint", checkpoint)
        _persist_resume_credentials(runner, store)
        runner.checked(["sudo", "systemctl", "reboot"])
        return {"state": "rebooting", "checkpoint": checkpoint}
    return _deploy(store, params, runner)


def _setup_resume(store: StateStore, runner: Runner) -> dict[str, Any]:
    checkpoint = store.read_receipt("checkpoint")
    if checkpoint.get("phase") != "reboot_pending":
        raise ControllerError("resume checkpoint is not reboot_pending")
    terraform_root = terraform_workspace(store, active_bundle(store))
    result = _deploy(
        store,
        {"siteName": checkpoint["siteName"]},
        runner,
        reconcile=True,
        terraform_root=terraform_root,
    )
    post_resume_inventory = inventory(runner, store)
    store.write_receipt(
        "checkpoint",
        {
            **checkpoint,
            "phase": "complete",
            "unrelatedLeftStopped": unrelated_left_stopped(
                checkpoint.get("unrelated", []), post_resume_inventory
            ),
        },
    )
    _erase_resume_credentials(runner)
    return result


# pylint: disable-next=too-many-return-statements
def dispatch(
    command: str,
    action: str | None,
    params: dict[str, Any],
    store: StateStore,
    runner: Runner,
) -> Any:
    if command == "setup":
        if action == "status":
            return setup_status(store, runner)
        if action == "apply":
            _credentials()
            install_bundle(store)
            return _setup_apply(store, params, runner)
        if action == "resume":
            return _setup_resume(store, runner)
        raise ControllerError("setup action must be status, apply, or resume")
    if command == "readiness":
        return readiness(runner)
    if command == "deploy":
        return _deploy(store, params, runner)
    if command == "status":
        return _runtime_status(store, runner)
    if command == "reconcile":
        return _deploy(store, params, runner, reconcile=True)
    if command == "destroy":
        return _destroy(store, runner)
    raise ControllerError(f"unknown command: {command}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="kvm-smsv2ctl")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "command",
        choices=("setup", "readiness", "deploy", "status", "reconcile", "destroy"),
    )
    parser.add_argument("action", nargs="?")
    parser.add_argument("--params", default="{}")
    args = parser.parse_args(argv)
    try:
        params = json.loads(args.params)
        if not isinstance(params, dict):
            raise ValueError
    except ValueError as error:
        payload = envelope(args.command, ok=False, error="params must be a JSON object")
        print(json.dumps(payload, sort_keys=True), file=sys.stderr)
        raise SystemExit(2) from error
    try:
        if args.command == "setup" and args.action == "apply":
            _credentials()
        store = StateStore()
        if args.command == "readiness" or (
            args.command == "setup" and args.action == "status"
        ):
            result = dispatch(args.command, args.action, params, store, Runner())
        else:
            with store.lock():
                result = dispatch(args.command, args.action, params, store, Runner())
        payload = envelope(args.command, result)
        print(json.dumps(payload, sort_keys=True))
    except Exception as error:
        payload = envelope(args.command, ok=False, error=str(error))
        print(json.dumps(payload, sort_keys=True), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
