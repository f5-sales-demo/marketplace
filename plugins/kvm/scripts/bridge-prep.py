"""Prepare a dedicated home-LAN bridge with an independent timed rollback."""
# ruff: noqa: B007, D103, EM101, EM102, INP001, PLC0415, PLR2004, PTH101, S603, S607, T201, TRY003, TRY301

from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import pathlib
import pty
import re
import shutil
import socket
import subprocess
import sys
import time

ROOT = pathlib.Path("/var/lib/kvm-smsv2/lan-rollback")
TIMER = "kvm-smsv2-lan-rollback"
RESTORE_TIMER = "kvm-smsv2-lan-restore"
NETPLAN_DIR = pathlib.Path("/etc/netplan")
NETWORKMANAGER_DIR = pathlib.Path("/etc/NetworkManager/system-connections")
LEASE_PATHS = (
    pathlib.Path("/var/lib/NetworkManager"),
    pathlib.Path("/var/lib/dhcp"),
    pathlib.Path("/var/lib/misc"),
    pathlib.Path("/var/lib/libvirt/dnsmasq"),
)


def observed_leases(subnet: str) -> list[str]:
    network = ipaddress.ip_network(subnet, strict=True)
    found = set()
    for directory in LEASE_PATHS:
        if not directory.is_dir():
            continue
        for source in directory.glob("*.lease*"):
            if not source.is_file() or source.stat().st_size > 1024 * 1024:
                continue
            for token in re.findall(
                r"\b(?:\d{1,3}\.){3}\d{1,3}\b", source.read_text(errors="replace")
            ):
                try:
                    address = ipaddress.ip_address(token)
                except ValueError:
                    continue
                if address in network:
                    found.add(str(address))
    return sorted(found)


def run(*argv: str, input_text: str | None = None) -> str:
    result = subprocess.run(
        argv, input=input_text, text=True, capture_output=True, timeout=140, check=False
    )
    if result.returncode:
        raise RuntimeError(
            f"bridge transaction command failed: {argv[0]} {argv[1] if len(argv) > 1 else ''}"
        )
    return result.stdout.strip()


def backup(directory: pathlib.Path, **inventory: str | bool) -> None:
    if ROOT.exists():
        raise RuntimeError("an earlier bridge rollback is pending")
    ROOT.mkdir(parents=True, mode=0o700)
    (ROOT / "original").mkdir(mode=0o700)
    original = {}
    for source in directory.glob(
        "*.yaml" if directory.name == "netplan" else "*.nmconnection"
    ):
        target = ROOT / "original" / source.name
        shutil.copy2(source, target)
        original[source.name] = hashlib.sha256(source.read_bytes()).hexdigest()
    (ROOT / "inventory.json").write_text(
        json.dumps({"directory": str(directory), "files": original, **inventory})
    )
    shutil.copy2(pathlib.Path(__file__), ROOT / "restore.py")
    os.chmod(ROOT / "restore.py", 0o700)
    schedule("rollback")


def schedule(mode: str) -> None:
    unit = RESTORE_TIMER if mode == "rollback-current" else TIMER
    run(
        "systemd-run",
        f"--unit={unit}",
        "--on-active=120s",
        "--",
        "/usr/bin/python3",
        str(ROOT / "restore.py"),
        mode,
    )


def update_record(**fields: str) -> None:
    path = ROOT / "inventory.json"
    record = json.loads(path.read_text())
    record.update(fields)
    path.write_text(json.dumps(record))


def rollback() -> None:
    if not ROOT.exists():
        return
    record = json.loads((ROOT / "inventory.json").read_text())
    directory = pathlib.Path(record["directory"])
    for name, digest in record["files"].items():
        if record.get("manager") == "networkmanager":
            break
        if record.get("modifiedSource") and name != record["modifiedSource"]:
            continue
        original = ROOT / "original" / name
        if hashlib.sha256(original.read_bytes()).hexdigest() != digest:
            raise RuntimeError("original bridge backup is corrupt")
        shutil.copy2(original, directory / name)
    if directory.name == "netplan":
        run("netplan", "apply")
    elif record.get("manager") == "networkmanager" and record.get("profilesReserved"):
        for name in ("xcsh-kvm-lan-port", "xcsh-kvm-lan"):
            subprocess.run(
                ["nmcli", "connection", "delete", name],
                capture_output=True,
                check=False,
            )
        run("nmcli", "connection", "reload")
        if record.get("sourceConnection"):
            run("nmcli", "connection", "up", record["sourceConnection"])


def rollback_current() -> None:
    record = json.loads((ROOT / "inventory.json").read_text())
    directory = pathlib.Path(record["directory"])
    for name in record["currentFiles"]:
        shutil.copy2(ROOT / "current" / name, directory / name)
    if directory.name == "netplan":
        run("netplan", "apply")
    else:
        run("nmcli", "connection", "reload")
        run("nmcli", "connection", "up", "xcsh-kvm-lan")
        run("nmcli", "connection", "up", "xcsh-kvm-lan-port")


def verify_original(wired: str, address: str, gateway: str) -> None:
    for attempt in range(20):
        assigned = json.loads(run("ip", "-j", "-4", "address", "show", "dev", wired))
        routes = json.loads(run("ip", "-j", "-4", "route", "show", "default"))
        if (
            any(
                item.get("local") == address
                for link in assigned
                for item in link.get("addr_info", [])
            )
            and any(
                item.get("dev") == wired and item.get("gateway") == gateway
                for item in routes
            )
            and subprocess.run(
                ["ping", "-n", "-c", "1", "-W", "2", "-I", wired, gateway],
                capture_output=True,
                check=False,
            ).returncode
            == 0
        ):
            socket.getaddrinfo("registry.terraform.io", 443)
            return
        time.sleep(2)
    raise RuntimeError("original management route did not recover")


def restore() -> None:
    record = json.loads((ROOT / "inventory.json").read_text())
    for field in ("wired", "address", "gateway", "manager"):
        if not record.get(field):
            raise RuntimeError("owned bridge restore receipt is incomplete")
    directory = pathlib.Path(record["directory"])
    current = ROOT / "current"
    current.mkdir(mode=0o700)
    files = {}
    for source in directory.glob(
        "*.yaml" if directory.name == "netplan" else "*.nmconnection"
    ):
        shutil.copy2(source, current / source.name)
        files[source.name] = hashlib.sha256(source.read_bytes()).hexdigest()
    if record["manager"] == "networkd":
        source = directory / record["modifiedSource"]
        if files.get(source.name) != record.get("modifiedSha256"):
            raise RuntimeError("Netplan bridge profile changed since plugin setup")
    elif record["manager"] == "networkmanager":
        if (
            run("nmcli", "-g", "GENERAL.CONNECTION", "device", "show", "xckvmlan")
            != "xcsh-kvm-lan"
        ):
            raise RuntimeError("NetworkManager bridge is no longer plugin-owned")
    update_record(currentFiles=files)
    schedule("rollback-current")
    try:
        rollback()
        verify_original(record["wired"], record["address"], record["gateway"])
        run("systemctl", "stop", f"{RESTORE_TIMER}.timer")
        run("systemctl", "stop", f"{TIMER}.timer")
        shutil.rmtree(ROOT)
    except Exception:
        rollback_current()
        raise


def verify(
    wired: str, bridge: str, address: str, gateway: str, ipv6_used: bool = False
) -> None:
    for attempt in range(20):
        links = json.loads(run("ip", "-j", "link", "show", "dev", wired))
        ips = json.loads(run("ip", "-j", "-4", "address", "show", "dev", bridge))
        routes = json.loads(run("ip", "-j", "-4", "route", "show", "default"))
        assigned = {
            entry["local"] for item in ips for entry in item.get("addr_info", [])
        }
        ipv6 = json.loads(run("ip", "-j", "-6", "address", "show", "dev", bridge))
        has_ipv6 = any(
            entry.get("scope") == "global"
            for item in ipv6
            for entry in item.get("addr_info", [])
        )
        if (
            links
            and links[0].get("master") == bridge
            and address in assigned
            and (not ipv6_used or has_ipv6)
            and any(
                route.get("dev") == bridge and route.get("gateway") == gateway
                for route in routes
            )
            and subprocess.run(
                ["ping", "-n", "-c", "1", "-W", "2", "-I", bridge, gateway],
                capture_output=True,
                check=False,
            ).returncode
            == 0
        ):
            socket.getaddrinfo("registry.terraform.io", 443)
            return
        time.sleep(2)
    raise RuntimeError(
        "bridge management address, route, or gateway verification failed"
    )


def networkmanager(
    wired: str,
    bridge: str,
    address: str,
    gateway: str,
    mac: str,
    ipv6_used: bool = False,
) -> None:
    source = run("nmcli", "-g", "GENERAL.CONNECTION", "device", "show", wired)
    if not source or source == "--":
        raise RuntimeError("wired NetworkManager connection is not active")
    method = run("nmcli", "-g", "ipv4.method", "connection", "show", source)
    if method != "auto":
        raise RuntimeError(
            "NetworkManager bridge migration requires the active DHCP profile"
        )
    profiles = set(run("nmcli", "-t", "-f", "NAME", "connection", "show").splitlines())
    if profiles.intersection({"xcsh-kvm-lan", "xcsh-kvm-lan-port"}):
        raise RuntimeError("NetworkManager profile name collision")
    backup(
        NETWORKMANAGER_DIR,
        manager="networkmanager",
        wired=wired,
        address=address,
        gateway=gateway,
        sourceConnection=source,
        profilesReserved=True,
    )
    run(
        "nmcli",
        "connection",
        "add",
        "type",
        "bridge",
        "ifname",
        bridge,
        "con-name",
        "xcsh-kvm-lan",
        "bridge.mac-address",
        mac,
        "ipv4.method",
        "auto",
        "ipv6.method",
        "auto",
    )
    run(
        "nmcli",
        "connection",
        "add",
        "type",
        "ethernet",
        "ifname",
        wired,
        "con-name",
        "xcsh-kvm-lan-port",
        "master",
        "xcsh-kvm-lan",
    )
    run("nmcli", "connection", "up", "xcsh-kvm-lan")
    run("nmcli", "connection", "up", "xcsh-kvm-lan-port")
    verify(wired, bridge, address, gateway, ipv6_used)


def networkd(
    wired: str, bridge: str, address: str, gateway: str, ipv6_used: bool = False
) -> None:
    import yaml

    directory = NETPLAN_DIR
    candidates = []
    for source in directory.glob("*.yaml"):
        document = yaml.safe_load(source.read_text()) or {}
        if wired in document.get("network", {}).get("ethernets", {}):
            candidates.append((source, document))
    if len(candidates) != 1:
        raise RuntimeError("one owned Netplan Ethernet declaration is required")
    source, document = candidates[0]
    original = document["network"]["ethernets"][wired]
    if original.get("addresses") != [f"{address}/{ip_prefix(wired, address)}"]:
        raise RuntimeError(
            "Netplan wired address does not match the preflight snapshot"
        )
    backup(
        directory,
        manager="networkd",
        wired=wired,
        address=address,
        gateway=gateway,
        modifiedSource=source.name,
    )
    document["network"]["ethernets"][wired] = {"dhcp4": False, "dhcp6": False}
    document["network"].setdefault("bridges", {})[bridge] = {
        **original,
        "interfaces": [wired],
        "macaddress": run("cat", f"/sys/class/net/{wired}/address"),
    }
    source.write_text(yaml.safe_dump(document, sort_keys=False))
    update_record(modifiedSha256=hashlib.sha256(source.read_bytes()).hexdigest())
    master, slave = pty.openpty()
    process = subprocess.Popen(
        ["netplan", "try", "--timeout", "100"],
        stdin=slave,
        stdout=slave,
        stderr=slave,
    )
    os.close(slave)
    try:
        time.sleep(5)
        verify(wired, bridge, address, gateway, ipv6_used)
        os.write(master, b"\n")
        process.wait(timeout=20)
        if process.returncode:
            raise RuntimeError("Netplan did not confirm the verified bridge")
        verify(wired, bridge, address, gateway, ipv6_used)
    except Exception:
        process.kill()
        process.wait()
        rollback()
        raise
    finally:
        os.close(master)


def ip_prefix(wired: str, address: str) -> int:
    observed = json.loads(run("ip", "-j", "-4", "address", "show", "dev", wired))
    matches = [
        item["prefixlen"]
        for link in observed
        for item in link.get("addr_info", [])
        if item.get("local") == address
    ]
    if len(matches) != 1:
        raise RuntimeError("management address changed during preflight")
    return int(matches[0])


def main() -> None:
    if os.geteuid() != 0:
        raise RuntimeError("bridge preparation requires passwordless sudo")
    if len(sys.argv) == 3 and sys.argv[1] == "leases":
        print(json.dumps(observed_leases(sys.argv[2])))
        return
    if sys.argv[1:] == ["rollback"]:
        rollback()
        return
    if sys.argv[1:] == ["rollback-current"]:
        rollback_current()
        return
    if sys.argv[1:] == ["restore"]:
        restore()
        return
    manager, wired, bridge, address, gateway, mac, ipv6 = sys.argv[1:]
    if bridge != "xckvmlan" or not wired.startswith(("en", "eth")):
        raise RuntimeError("bridge target is not plugin-owned physical Ethernet")
    if ROOT.exists():
        raise RuntimeError("an earlier bridge rollback is pending")
    try:
        if manager == "networkmanager":
            networkmanager(wired, bridge, address, gateway, mac, ipv6 == "yes")
        elif manager == "networkd":
            networkd(wired, bridge, address, gateway, ipv6 == "yes")
        else:
            raise RuntimeError("unsupported network manager")
        print("KVM_BRIDGE_VERIFIED", flush=True)
    except Exception:
        rollback()
        raise


if __name__ == "__main__":
    main()
