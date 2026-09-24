"""Safety contracts for a two-interface home-LAN KVM CE."""
# pylint: disable=protected-access,too-many-public-methods
# ruff: noqa: ANN001, ANN201, ANN202, D101, D102, INP001, PT009, PT018, PT027, RUF005, S101, SLF001

import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
from itertools import pairwise
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "kvm_smsv2_controller", ROOT / "scripts" / "kvm_smsv2_controller.py"
)
assert SPEC and SPEC.loader
controller = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(controller)
BRIDGE_SPEC = importlib.util.spec_from_file_location(
    "bridge_prep", ROOT / "scripts" / "bridge-prep.py"
)
assert BRIDGE_SPEC and BRIDGE_SPEC.loader
bridge_prep = importlib.util.module_from_spec(BRIDGE_SPEC)
BRIDGE_SPEC.loader.exec_module(bridge_prep)


class HomeLanContracts(unittest.TestCase):
    def test_wired_route_wins_over_vpn_and_wifi(self):
        routes = [
            {
                "dst": "default",
                "dev": "wlp0s20f3",
                "gateway": "192.168.2.1",
                "metric": 800,
            },
            {
                "dst": "default",
                "dev": "enp109s0",
                "gateway": "192.168.2.1",
                "metric": 100,
            },
        ]
        links = [
            {
                "ifname": "enp109s0",
                "link_type": "ether",
                "address": "00:11:22:33:44:55",
            },
            {"ifname": "wlp0s20f3", "link_type": "ether"},
            {"ifname": "br-kvm-lan", "linkinfo": {"info_kind": "bridge"}},
            {"ifname": "enp3s0", "master": "br-kvm-lan"},
        ]
        addresses = [
            {
                "ifname": "enp109s0",
                "addr_info": [
                    {"family": "inet", "local": "192.168.2.34", "prefixlen": 24}
                ],
            }
        ]
        result = controller.parse_home_lan(routes, links, addresses)
        self.assertEqual(result["wiredLink"], "enp109s0")
        self.assertEqual(result["subnet"], "192.168.2.0/24")
        self.assertEqual(result["bridge"], "xckvmlan")

    def test_ambiguous_multiple_wired_defaults_stop(self):
        with self.assertRaises(controller.ControllerError):
            controller.parse_home_lan(
                [
                    {"dst": "default", "dev": "enp1s0", "gateway": "192.168.2.1"},
                    {"dst": "default", "dev": "enp2s0", "gateway": "192.168.2.1"},
                ],
                [{"ifname": "enp1s0"}, {"ifname": "enp2s0"}],
                [],
            )

    def test_failed_neighbor_is_not_a_known_host(self):
        routes = [{"dst": "default", "dev": "enp5s0", "gateway": "192.168.2.1"}]
        links = [{"ifname": "enp5s0", "address": "00:11:22:33:44:55"}]
        addresses = [
            {
                "ifname": "enp5s0",
                "addr_info": [
                    {"family": "inet", "local": "192.168.2.240", "prefixlen": 24}
                ],
            }
        ]
        neighbors = [
            {"dst": "192.168.2.70", "state": ["FAILED"]},
            {"dst": "192.168.2.71", "state": ["REACHABLE"]},
        ]
        runner = mock.Mock()
        runner.checked.side_effect = map(
            json.dumps, (routes, links, addresses, [], neighbors)
        )
        runner.run.return_value.returncode = 0
        self.assertEqual(
            controller.observe_home_lan(runner)["neighbors"], ["192.168.2.71"]
        )

    def test_observer_requests_detailed_bridge_link_kind(self):
        routes = [{"dst": "default", "dev": "xckvmlan", "gateway": "192.168.2.1"}]
        links = [
            {"ifname": "xckvmlan", "linkinfo": {"info_kind": "bridge"}},
            {"ifname": "enp5s0", "master": "xckvmlan", "address": "00:11:22:33:44:55"},
        ]
        addresses = [
            {
                "ifname": "xckvmlan",
                "addr_info": [
                    {"family": "inet", "local": "192.168.2.240", "prefixlen": 24}
                ],
            }
        ]
        runner = mock.Mock()
        runner.checked.side_effect = map(json.dumps, (routes, links, addresses, [], []))
        runner.run.return_value.returncode = 0
        self.assertTrue(controller.observe_home_lan(runner)["bridgeReady"])
        runner.checked.assert_any_call(["ip", "-j", "-d", "link", "show"])

    def test_networkmanager_disables_stp_on_single_uplink_bridge(self):
        def run(*args: object):
            if args[:5] == ("nmcli", "-g", "GENERAL.CONNECTION", "device", "show"):
                return "Wired connection 1"
            if args[:3] == ("nmcli", "-g", "ipv4.method"):
                return "auto"
            return ""

        with (
            mock.patch.object(bridge_prep, "run", side_effect=run) as commands,
            mock.patch.object(bridge_prep, "backup"),
            mock.patch.object(bridge_prep, "verify"),
        ):
            bridge_prep.networkmanager(
                "enp5s0",
                "xckvmlan",
                "192.168.2.240",
                "192.168.2.1",
                "00:11:22:33:44:55",
            )
        bridge_add = next(
            call.args
            for call in commands.call_args_list
            if call.args[:4] == ("nmcli", "connection", "add", "type")
            and "bridge" in call.args
        )
        self.assertIn(("bridge.stp", "no"), tuple(pairwise(bridge_add)))

    def test_storage_selection_prefers_mounted_data_and_persists_for_rebuild(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with (
                mock.patch.object(controller.os.path, "ismount", return_value=True),
                mock.patch.object(controller.pathlib.Path, "is_dir", return_value=True),
            ):
                config = controller._config(
                    store, {"siteName": "onprem-workstation-kvm"}
                )
                self.assertEqual(controller.storage_root(store), "/data/libvirt/images")
            self.assertEqual(config["storageRoot"], "/data/libvirt/images")
            with (
                mock.patch.object(controller.os.path, "ismount", return_value=False),
                self.assertRaisesRegex(controller.ControllerError, "mount"),
            ):
                controller.storage_root(store)

    def test_storage_selection_uses_root_on_nuc_and_rejects_unbound_state(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with mock.patch.object(controller.os.path, "ismount", return_value=False):
                self.assertEqual(
                    controller.storage_root(store), "/var/lib/libvirt/images"
                )
            (store.root / "deployment.json").write_text(
                json.dumps({"siteName": "onprem-nuc-kvm"})
            )
            with self.assertRaisesRegex(controller.ControllerError, "storage root"):
                controller.storage_root(store)

    def test_terraform_pool_uses_bound_storage_root(self):
        terraform = (ROOT / "terraform" / "main.tf").read_text()
        self.assertIn(
            'target { path = "${var.storage_root}/${local.pool_name}" }', terraform
        )
        self.assertIn(
            '"storage_root": config["storageRoot"]',
            (ROOT / "scripts" / "kvm_smsv2_controller.py").read_text(),
        )

    def test_subnet_must_be_wholly_contained(self):
        for subnet in ("192.168.2.0/24", "192.168.0.0/22", "192.168.4.0/23"):
            self.assertTrue(controller.allowed_lan_subnet(subnet))
        for subnet in ("192.168.0.0/21", "192.168.6.0/24", "10.100.0.0/24"):
            self.assertFalse(controller.allowed_lan_subnet(subnet))

    def test_bridge_must_not_steal_occupied_or_other_lan(self):
        self.assertEqual(
            controller.select_lan_bridge("enp2s0", {"xckvmlan": ["enp2s0"]}),
            "xckvmlan",
        )
        with self.assertRaises(controller.ControllerError):
            controller.select_lan_bridge("enp2s0", {"br-home": ["enp2s0"]})
        with self.assertRaises(controller.ControllerError):
            controller.select_lan_bridge("enp2s0", {"br-kvm-lan": ["enp2s0"]})
        with self.assertRaises(controller.ControllerError):
            controller.select_lan_bridge("enp2s0", {"xckvmlan": ["enp3s0"]})
        with self.assertRaises(controller.ControllerError):
            controller.select_lan_bridge("enp2s0", {"xckvmlan": ["enp2s0", "vnet7"]})
        self.assertEqual(
            controller.select_lan_bridge(
                "enp2s0", {"xckvmlan": ["enp2s0", "vnet7"]}, {"vnet7"}
            ),
            "xckvmlan",
        )
        with self.assertRaises(controller.ControllerError):
            controller.select_lan_bridge(
                "enp2s0",
                {"xckvmlan": ["enp2s0", "vnet7", "vnet8"]},
                {"vnet7", "vnet8"},
            )
        self.assertEqual(
            controller.select_lan_bridge("enp2s0", {"br-kvm-lan": ["enp3s0"]}),
            "xckvmlan",
        )

    def test_running_ce_tap_requires_exact_libvirt_bridge_and_sli_mac(self):
        routes = [{"dst": "default", "dev": "xckvmlan", "gateway": "192.168.2.1"}]
        links = [
            {"ifname": "xckvmlan", "linkinfo": {"info_kind": "bridge"}},
            {"ifname": "enp2s0", "master": "xckvmlan"},
            {"ifname": "vnet7", "master": "xckvmlan"},
        ]
        addresses = [
            {
                "ifname": "xckvmlan",
                "addr_info": [
                    {"family": "inet", "local": "192.168.2.34", "prefixlen": 24}
                ],
            }
        ]
        domain_xml = (
            '<domain><devices><interface type="bridge">'
            '<mac address="52:54:00:10:00:12"/>'
            '<source bridge="xckvmlan"/><target dev="vnet7"/>'
            "</interface></devices></domain>"
        )
        for xml, accepted in (
            (domain_xml, True),
            (domain_xml.replace("52:54:00:10:00:12", "52:54:00:10:00:13"), False),
            (domain_xml.replace('bridge="xckvmlan"', 'bridge="br-kvm-lan"'), False),
            (domain_xml.replace('dev="vnet7"', 'dev="vnet8"'), False),
            (
                domain_xml.replace(
                    "</devices>",
                    '<interface type="bridge"><mac address="52:54:00:10:00:12"/>'
                    '<source bridge="xckvmlan"/><target dev="vnet8"/>'
                    "</interface></devices>",
                ),
                False,
            ),
        ):
            runner = mock.Mock()
            runner.checked.side_effect = [
                json.dumps(value) for value in (routes, links, addresses, [], [])
            ]
            runner.run.side_effect = lambda argv, xml=xml, **_kwargs: mock.Mock(
                returncode=0,
                stdout=xml if "dumpxml" in argv else "",
            )
            if accepted:
                self.assertTrue(controller.observe_home_lan(runner)["bridgeReady"])
            else:
                with self.assertRaises(controller.ControllerError):
                    controller.observe_home_lan(runner)

    def test_candidates_exclude_leases_neighbors_and_responders(self):
        available = controller.select_lan_addresses(
            "192.168.2.0/29",
            "192.168.2.1",
            {"192.168.2.2", "192.168.2.3"},
            lambda address: address == "192.168.2.4",
        )
        self.assertEqual(available, ("192.168.2.5", "192.168.2.6"))
        with self.assertRaises(controller.ControllerError):
            controller.select_lan_addresses(
                "192.168.2.0/30", "192.168.2.1", set(), lambda _: False
            )
        with self.assertRaises(controller.ControllerError):
            controller.select_lan_addresses(
                "192.168.2.0/31", "192.168.2.1", set(), lambda _: False
            )

    def test_interface_roles_require_distinct_owned_macs(self):
        interfaces = [
            {"role": "slo", "mac": controller.CE_MAC, "device": "ens3"},
            {"role": "sli", "mac": controller.SLI_MAC, "device": "ens4"},
        ]
        self.assertEqual(
            controller.map_ce_interfaces(interfaces)["sli"]["device"], "ens4"
        )
        with self.assertRaises(controller.ControllerError):
            controller.map_ce_interfaces(interfaces + [interfaces[1]])
        with self.assertRaises(controller.ControllerError):
            controller.map_ce_interfaces(
                [interfaces[0], {**interfaces[1], "mac": controller.CE_MAC}]
            )

    def test_manager_requires_timed_rollback(self):
        nm = controller.bridge_transaction_command(
            "NetworkManager", "enp5s0", "xckvmlan"
        )
        netplan = controller.bridge_transaction_command(
            "networkd", "enp109s0", "xckvmlan"
        )
        self.assertIn("checkpoint", nm)
        self.assertIn("--timeout", nm)
        self.assertIn("networkd", netplan)
        self.assertIn("bridge-prep.py", " ".join(netplan))
        with self.assertRaises(controller.ControllerError):
            controller.bridge_transaction_command("unknown", "enp5s0", "xckvmlan")

    def test_checkpoint_confirms_only_after_verified_helper_marker(self):
        success = [
            "/bin/sh",
            "-c",
            'printf "KVM_BRIDGE_VERIFIED\\nType \\"Yes\\" to commit the changes: "; read answer; test "$answer" = Yes',
        ]
        failure = [
            "/bin/sh",
            "-c",
            'printf "Type \\"Yes\\" to commit the changes: "; read answer; test "$answer" = Yes',
        ]
        controller.execute_checkpoint(success)
        with self.assertRaises(controller.ControllerError):
            controller.execute_checkpoint(failure)

    def test_apply_plan_requires_one_vip_and_one_origin(self):
        def change(address):
            return {
                "address": address,
                "provider_name": "registry.terraform.io/f5-sales-demo/xcsh",
                "change": {"actions": ["create"]},
            }

        valid = {
            "resource_changes": [
                change("xcsh_http_loadbalancer.home"),
                change("xcsh_origin_pool.home"),
            ]
        }
        controller.require_home_lan_plan(valid)
        for changes in (
            [change("xcsh_http_loadbalancer.home")],
            valid["resource_changes"] + [change("xcsh_http_loadbalancer.other")],
        ):
            with self.assertRaises(controller.ControllerError):
                controller.require_home_lan_plan({"resource_changes": changes})

    def test_terraform_uses_provider_owned_sli_not_slo_runtime_lookup(self):
        text = (ROOT / "terraform" / "main.tf").read_text()
        self.assertEqual(
            text.count('resource "xcsh_smsv2_kvm_runtime_interface" "sli"'), 1
        )
        self.assertNotIn('data "xcsh_smsv2_kvm_runtime" "sli"', text)
        self.assertIn("self.device != data.xcsh_smsv2_kvm_runtime.ce.device", text)
        self.assertEqual(text.count('resource "xcsh_origin_pool" "home"'), 1)
        self.assertEqual(text.count('resource "xcsh_http_loadbalancer" "home"'), 1)
        self.assertIn('network = "SITE_NETWORK_INSIDE"', text)
        self.assertNotIn("198.51.100.0/24", text)

    def test_netplan_backup_restores_exact_original_after_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            netplan = root / "netplan"
            netplan.mkdir()
            original = netplan / "01-wired.yaml"
            original.write_text("network:\n  version: 2\n")
            with (
                mock.patch.object(bridge_prep, "ROOT", root / "rollback"),
                mock.patch.object(bridge_prep, "run") as commands,
            ):
                bridge_prep.backup(netplan)
                original.write_text("network: changed\n")
                bridge_prep.rollback()
            self.assertEqual(original.read_text(), "network:\n  version: 2\n")
            self.assertTrue(
                any(
                    call.args[:2] == ("netplan", "apply")
                    for call in commands.call_args_list
                )
            )

    def test_networkmanager_backup_removes_only_plugin_profiles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            profiles = root / "system-connections"
            profiles.mkdir()
            original = profiles / "owner.nmconnection"
            original.write_text("[connection]\nid=owner\n")
            with (
                mock.patch.object(bridge_prep, "ROOT", root / "rollback"),
                mock.patch.object(bridge_prep, "run") as commands,
                mock.patch.object(bridge_prep.subprocess, "run") as subprocess_run,
            ):
                bridge_prep.backup(profiles)
                bridge_prep.update_record(
                    manager="networkmanager", profilesReserved=True
                )
                bridge_prep.rollback()
            self.assertEqual(original.read_text(), "[connection]\nid=owner\n")
            self.assertEqual(subprocess_run.call_count, 2)
            self.assertTrue(
                any(
                    call.args[:3] == ("nmcli", "connection", "reload")
                    for call in commands.call_args_list
                )
            )

    def test_unowned_networkmanager_profile_names_are_never_deleted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            profiles = root / "system-connections"
            profiles.mkdir()
            with (
                mock.patch.object(bridge_prep, "ROOT", root / "rollback"),
                mock.patch.object(bridge_prep, "run") as commands,
                mock.patch.object(bridge_prep.subprocess, "run") as subprocess_run,
            ):
                bridge_prep.backup(profiles)
                bridge_prep.rollback()
            subprocess_run.assert_not_called()
            self.assertFalse(
                any(
                    call.args[:2] == ("nmcli", "connection")
                    for call in commands.call_args_list
                )
            )

    def test_existing_profile_name_blocks_bridge_migration_before_backup(self):
        responses = {
            (
                "nmcli",
                "-g",
                "GENERAL.CONNECTION",
                "device",
                "show",
                "enp5s0",
            ): "owner-ethernet",
            (
                "nmcli",
                "-g",
                "ipv4.method",
                "connection",
                "show",
                "owner-ethernet",
            ): "auto",
            (
                "nmcli",
                "-t",
                "-f",
                "NAME",
                "connection",
                "show",
            ): "owner-ethernet\nxcsh-kvm-lan",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            with (
                mock.patch.object(bridge_prep, "ROOT", root / "rollback"),
                mock.patch.object(bridge_prep, "NETWORKMANAGER_DIR", root),
                mock.patch.object(
                    bridge_prep, "run", side_effect=lambda *args: responses[args]
                ),
                self.assertRaisesRegex(RuntimeError, "profile name collision"),
            ):
                bridge_prep.networkmanager(
                    "enp5s0",
                    "xckvmlan",
                    "192.168.2.34",
                    "192.168.2.1",
                    "00:11:22:33:44:55",
                )
            self.assertFalse((root / "rollback").exists())

    def test_existing_rollback_receipt_does_not_restore_on_new_attempt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "rollback"
            root.mkdir()
            with (
                mock.patch.object(bridge_prep, "ROOT", root),
                mock.patch.object(bridge_prep.os, "geteuid", return_value=0),
                mock.patch.object(
                    bridge_prep.sys,
                    "argv",
                    [
                        "bridge-prep.py",
                        "networkmanager",
                        "enp5s0",
                        "xckvmlan",
                        "192.168.2.34",
                        "192.168.2.1",
                        "00:11:22:33:44:55",
                        "no",
                    ],
                ),
                mock.patch.object(bridge_prep, "rollback") as rollback,
                self.assertRaisesRegex(RuntimeError, "earlier bridge rollback"),
            ):
                bridge_prep.main()
            rollback.assert_not_called()

    def test_post_transaction_drift_restores_original_management_link(self):
        snapshot = {
            "manager": "NetworkManager",
            "wiredLink": "enp5s0",
            "bridge": "xckvmlan",
            "hostAddress": "192.168.2.34",
            "gateway": "192.168.2.1",
            "physicalMac": "00:11:22:33:44:55",
            "subnet": "192.168.2.0/24",
            "bridgeReady": False,
            "ipv6": False,
        }
        runner = mock.Mock()
        with (
            mock.patch.object(
                controller,
                "observe_home_lan",
                side_effect=[
                    snapshot,
                    {**snapshot, "bridgeReady": True, "subnet": "192.168.0.0/22"},
                ],
            ),
            mock.patch.object(controller, "execute_checkpoint"),
            self.assertRaisesRegex(controller.ControllerError, "management identity"),
        ):
            controller.prepare_home_lan(mock.Mock(), runner, {})
        self.assertEqual(runner.checked.call_args.args[0][-1], "restore")

    def test_helper_keeps_timer_armed_until_controller_verifies(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "rollback"
            with (
                mock.patch.object(bridge_prep, "ROOT", root),
                mock.patch.object(bridge_prep.os, "geteuid", return_value=0),
                mock.patch.object(
                    bridge_prep.sys,
                    "argv",
                    [
                        "bridge-prep.py",
                        "networkd",
                        "enp109s0",
                        "xckvmlan",
                        "192.168.2.34",
                        "192.168.2.1",
                        "00:11:22:33:44:55",
                        "no",
                    ],
                ),
                mock.patch.object(bridge_prep, "networkd"),
                mock.patch.object(bridge_prep, "run") as commands,
            ):
                bridge_prep.main()
            self.assertFalse(
                any(
                    call.args[:2] == ("systemctl", "stop")
                    for call in commands.call_args_list
                )
            )

    def test_owned_lan_recheck_rejects_new_or_changed_arp_owner(self):
        selection = {"sliAddress": "192.168.2.5", "vipAddress": "192.168.2.6"}
        expected = {
            "192.168.2.5": controller.SLI_MAC,
            "192.168.2.6": "00:00:5e:00:01:02",
        }
        controller.validate_lan_recheck(selection, expected, expected.get)
        with self.assertRaises(controller.ControllerError):
            controller.validate_lan_recheck(
                selection,
                expected,
                lambda address: (
                    "aa:bb:cc:dd:ee:ff" if address.endswith(".6") else expected[address]
                ),
            )
        with self.assertRaises(controller.ControllerError):
            controller.validate_lan_recheck(selection, None, expected.get)

    def test_exact_application_ownership_rejects_label_or_name_drift(self):
        owned = {
            "metadata": {
                "namespace": "system",
                "name": "site-lan",
                "labels": {"owner": controller.OWNER},
            }
        }
        with mock.patch.object(controller, "_xc_json", return_value=owned):
            self.assertTrue(
                controller._owned_application_object("http_loadbalancers", "site-lan")[
                    "owned"
                ]
            )
        with mock.patch.object(
            controller,
            "_xc_json",
            return_value={"metadata": {**owned["metadata"], "name": "other"}},
        ):
            self.assertFalse(
                controller._owned_application_object("http_loadbalancers", "site-lan")[
                    "owned"
                ]
            )

    def test_netplan_teardown_restores_original_with_backup_timer(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            netplan = root / "netplan"
            netplan.mkdir()
            source = netplan / "01-wired.yaml"
            source.write_text("original\n")
            with (
                mock.patch.object(bridge_prep, "ROOT", root / "rollback"),
                mock.patch.object(bridge_prep, "run") as commands,
                mock.patch.object(bridge_prep, "verify_original"),
            ):
                bridge_prep.backup(netplan)
                source.write_text("bridged\n")
                bridge_prep.update_record(
                    manager="networkd",
                    wired="enp109s0",
                    address="192.168.2.34",
                    gateway="192.168.2.1",
                    modifiedSource=source.name,
                    modifiedSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                )
                bridge_prep.restore()
            self.assertEqual(source.read_text(), "original\n")
            self.assertFalse((root / "rollback").exists())
            self.assertTrue(
                any("rollback-current" in call.args for call in commands.call_args_list)
            )

    def test_failed_teardown_restores_current_bridge(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            netplan = root / "netplan"
            netplan.mkdir()
            source = netplan / "01-wired.yaml"
            source.write_text("original\n")
            with (
                mock.patch.object(bridge_prep, "ROOT", root / "rollback"),
                mock.patch.object(bridge_prep, "run"),
                mock.patch.object(
                    bridge_prep,
                    "verify_original",
                    side_effect=RuntimeError("lost route"),
                ),
            ):
                bridge_prep.backup(netplan)
                source.write_text("bridged\n")
                bridge_prep.update_record(
                    manager="networkd",
                    wired="enp109s0",
                    address="192.168.2.34",
                    gateway="192.168.2.1",
                    modifiedSource=source.name,
                    modifiedSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                )
                with self.assertRaisesRegex(RuntimeError, "lost route"):
                    bridge_prep.restore()
            self.assertEqual(source.read_text(), "bridged\n")

    def test_netplan_confirms_only_after_wired_health_check(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            netplan = root / "netplan"
            netplan.mkdir()
            (netplan / "01-wired.yaml").write_text(
                "network:\n  version: 2\n  renderer: networkd\n  ethernets:\n"
                "    enp109s0:\n      addresses: [192.168.2.34/24]\n"
            )
            process = mock.Mock(returncode=0)
            events = []
            with (
                mock.patch.object(bridge_prep, "ROOT", root / "rollback"),
                mock.patch.object(bridge_prep, "NETPLAN_DIR", netplan),
                mock.patch.object(bridge_prep, "run", return_value="00:11:22:33:44:55"),
                mock.patch.object(bridge_prep, "ip_prefix", return_value=24),
                mock.patch.object(bridge_prep.time, "sleep"),
                mock.patch.object(
                    bridge_prep.subprocess, "Popen", return_value=process
                ),
                mock.patch.object(
                    bridge_prep,
                    "verify",
                    side_effect=lambda *_: events.append("verified"),
                ),
                mock.patch.object(
                    bridge_prep.os,
                    "write",
                    side_effect=lambda *_: events.append("confirmed"),
                ),
            ):
                bridge_prep.networkd(
                    "enp109s0", "xckvmlan", "192.168.2.34", "192.168.2.1"
                )
            self.assertEqual(events, ["verified", "confirmed", "verified"])

    def test_lease_inventory_exposes_only_in_range_addresses(self):
        with tempfile.TemporaryDirectory() as directory:
            leases = pathlib.Path(directory)
            (leases / "lan.leases").write_text(
                "1726500000 aa:bb:cc:dd:ee:ff 192.168.2.72 client *\n"
                "1726500000 aa:bb:cc:dd:ee:01 10.100.0.11 ce *\n"
            )
            with mock.patch.object(bridge_prep, "LEASE_PATHS", (leases,)):
                self.assertEqual(
                    bridge_prep.observed_leases("192.168.2.0/24"), ["192.168.2.72"]
                )

    def test_ipv6_wired_migration_requires_global_address_on_bridge(self):
        def observation(*argv: str) -> str:
            if "-6" in argv:
                return json.dumps(
                    [{"addr_info": [{"scope": "global"}]}] if address_present else []
                )
            if "link" in argv:
                return json.dumps([{"master": "xckvmlan"}])
            if "address" in argv:
                return json.dumps([{"addr_info": [{"local": "192.168.2.34"}]}])
            return json.dumps([{"dev": "xckvmlan", "gateway": "192.168.2.1"}])

        with (
            mock.patch.object(bridge_prep, "run", side_effect=observation),
            mock.patch.object(
                bridge_prep.subprocess, "run", return_value=mock.Mock(returncode=0)
            ),
            mock.patch.object(bridge_prep.socket, "getaddrinfo"),
            mock.patch.object(bridge_prep.time, "sleep"),
        ):
            address_present = True
            bridge_prep.verify(
                "enp109s0", "xckvmlan", "192.168.2.34", "192.168.2.1", True
            )
            address_present = False
            with self.assertRaisesRegex(RuntimeError, "verification failed"):
                bridge_prep.verify(
                    "enp109s0", "xckvmlan", "192.168.2.34", "192.168.2.1", True
                )


if __name__ == "__main__":
    unittest.main()
