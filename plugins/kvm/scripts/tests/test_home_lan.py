"""Safety contracts for a two-interface home-LAN KVM CE."""
# pylint: disable=protected-access,too-many-lines,too-many-public-methods
# ruff: noqa: ANN001, ANN201, ANN202, D101, D102, INP001, PT009, PT018, PT027, RUF005, S101, SLF001

import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
from typing import Any
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
    def test_selected_application_namespace_persists_and_cannot_be_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with mock.patch.object(
                controller, "storage_root", return_value="/data/libvirt/images"
            ):
                config = controller._config(
                    store,
                    {
                        "siteName": "onprem-nuc-kvm",
                        "applicationNamespace": "example",
                    },
                )
                self.assertEqual(config["namespace"], "system")
                self.assertEqual(
                    config["applicationNamespace"], "example"
                )
                self.assertEqual(
                    controller._config(store, {})["applicationNamespace"],
                    "example",
                )
                with self.assertRaisesRegex(
                    controller.ControllerError, "persisted application namespace"
                ):
                    controller._config(
                        store, {"applicationNamespace": "another-project"}
                    )
            with self.assertRaisesRegex(
                controller.ControllerError, "invalid or system"
            ):
                controller._config(
                    controller.StateStore(pathlib.Path(directory) / "new"),
                    {"applicationNamespace": "system"},
                )

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
        self.assertEqual(bridge_add[bridge_add.index("bridge.stp") + 1], "no")

    def test_storage_selection_prefers_mounted_data_and_persists_for_rebuild(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with (
                mock.patch.object(controller.os.path, "ismount", return_value=True),
                mock.patch.object(controller.pathlib.Path, "is_dir", return_value=True),
            ):
                config = controller._config(
                    store,
                    {
                        "siteName": "onprem-workstation-kvm",
                        "applicationNamespace": "example",
                    },
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
        self.assertEqual(terraform.count('mode = "host-passthrough"'), 2)
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

    def test_registration_maps_both_owned_macs_to_distinct_observed_devices(self):
        registration: dict[str, Any] = {
            "items": [
                {
                    "name": "registration-1",
                    "get_spec": {
                        "passport": {"cluster_name": "owned-site"},
                        "infra": {
                            "hostname": "observed-node",
                            "provider": "KVM",
                            "hw_info": {
                                "network": [
                                    {"mac_address": controller.CE_MAC, "name": "ens3"},
                                    {"mac_address": controller.SLI_MAC, "name": "ens4"},
                                ]
                            },
                        },
                    },
                }
            ]
        }
        mapped = controller.map_registered_ce_interfaces(registration, "owned-site")
        self.assertEqual(mapped["hostname"], "observed-node")
        self.assertEqual(mapped["interfaces"]["sli"]["device"], "ens4")
        registration["items"][0]["get_spec"]["infra"]["hw_info"]["network"][1][
            "name"
        ] = "ens3"
        with self.assertRaisesRegex(controller.ControllerError, "distinct"):
            controller.map_registered_ce_interfaces(registration, "owned-site")
        registration["items"].append(registration["items"][0])
        with self.assertRaisesRegex(controller.ControllerError, "one.*registration"):
            controller.map_registered_ce_interfaces(registration, "owned-site")

    def test_site_static_plan_owns_only_observed_sli(self):
        site, registration, config = self.site_static_fixture()
        plan = controller.build_site_static_plan(site, registration, config)
        node = plan["payload"]["spec"]["kvm"]["not_managed"]["node_list"][0]
        self.assertEqual(
            node["interface_list"][0],
            site["spec"]["kvm"]["not_managed"]["node_list"][0]["interface_list"][0],
        )
        inside = node["interface_list"][1]
        self.assertNotIn("dhcp_client", inside)
        self.assertEqual(inside["static_ip"], {"ip_address": "192.168.2.253/24"})
        self.assertFalse(plan["alreadyConfigured"])
        self.assertEqual(plan["ownerUID"], "owned-uid")
        self.assertEqual(plan["resourceVersion"], "42")
        self.assertEqual(
            site["spec"]["kvm"]["not_managed"]["node_list"][0]["interface_list"][1],
            self.site_static_fixture()[0]["spec"]["kvm"]["not_managed"]["node_list"][0][
                "interface_list"
            ][1],
        )
        observed = controller.build_site_static_plan(
            {**site, "spec": plan["payload"]["spec"]}, registration, config
        )
        self.assertTrue(observed["alreadyConfigured"])

    def test_site_static_plan_rejects_unowned_or_ambiguous_child(self):
        site, registration, config = self.site_static_fixture()
        site["metadata"]["labels"]["owner"] = "foreign"
        with self.assertRaisesRegex(controller.ControllerError, "owner"):
            controller.build_site_static_plan(site, registration, config)
        site, registration, config = self.site_static_fixture()
        site["spec"]["kvm"]["not_managed"]["node_list"] = []
        with self.assertRaisesRegex(controller.ControllerError, "one.*node"):
            controller.build_site_static_plan(site, registration, config)
        site, registration, config = self.site_static_fixture()
        interfaces = site["spec"]["kvm"]["not_managed"]["node_list"][0][
            "interface_list"
        ]
        interfaces[1]["ethernet_interface"]["mac"] = controller.CE_MAC
        with self.assertRaises(controller.ControllerError):
            controller.build_site_static_plan(site, registration, config)
        site, registration, config = self.site_static_fixture()
        interfaces = site["spec"]["kvm"]["not_managed"]["node_list"][0][
            "interface_list"
        ]
        del interfaces[1]["dhcp_client"]
        interfaces[1]["static_ip"] = {"ip_address": "192.168.2.252/24"}
        with self.assertRaisesRegex(controller.ControllerError, "conflict"):
            controller.build_site_static_plan(site, registration, config)

    def test_guest_sli_address_requires_exact_owned_mac_and_no_dhcp_alias(self):
        output = (
            " Name MAC Protocol Address\n"
            " vhost0 52:54:00:10:00:11 ipv4 10.100.0.11/24\n"
            " vhost-int-1 52:54:00:10:00:12 ipv4 192.168.2.253/24\n"
        )
        self.assertTrue(controller.guest_sli_address_ready(output, "192.168.2.253/24"))
        self.assertFalse(controller.guest_sli_address_ready(output, "192.168.2.254/24"))
        self.assertFalse(
            controller.guest_sli_address_ready(
                output + " vhost-int-1 52:54:00:10:00:12 ipv4 192.168.2.10/24\n",
                "192.168.2.253/24",
            )
        )

    def test_sli_child_name_requires_exact_site_uid_device_and_static_ip(self):
        listing = {
            "items": [
                {
                    "name": "random-platform-name",
                    "namespace": "system",
                    "owner_view": {
                        "kind": "securemesh_site_v2",
                        "name": "owned-site",
                        "namespace": "system",
                        "uid": "owned-uid",
                    },
                }
            ]
        }
        exact: dict[str, Any] = {
            "system_metadata": {"owner_view": listing["items"][0]["owner_view"]},
            "spec": {
                "ethernet_interface": {
                    "node": "observed-node",
                    "device": "ens4",
                    "site_local_inside_network": {},
                    "static_ip": {"node_static_ip": {"ip_address": "192.168.2.253/24"}},
                }
            },
        }
        self.assertEqual(
            controller.select_sli_child_name(
                listing,
                lambda _name: exact,
                "owned-site",
                "owned-uid",
                "observed-node",
                "ens4",
                "192.168.2.253/24",
            ),
            "random-platform-name",
        )
        with self.assertRaisesRegex(controller.ControllerError, "ambiguous"):
            controller.select_sli_child_name(
                {"items": listing["items"] * 2},
                lambda _name: exact,
                "owned-site",
                "owned-uid",
                "observed-node",
                "ens4",
                "192.168.2.253/24",
            )
        exact["spec"]["ethernet_interface"]["static_ip"]["node_static_ip"][
            "ip_address"
        ] = "192.168.2.252/24"
        with self.assertRaisesRegex(controller.ControllerError, "ambiguous"):
            controller.select_sli_child_name(
                listing,
                lambda _name: exact,
                "owned-site",
                "owned-uid",
                "observed-node",
                "ens4",
                "192.168.2.253/24",
            )

    @staticmethod
    def site_static_fixture() -> tuple[dict, dict, dict]:
        registration = {
            "items": [
                {
                    "name": "registration-1",
                    "object": {"status": {"current_state": "ONLINE"}},
                    "get_spec": {
                        "passport": {"cluster_name": "owned-site"},
                        "infra": {
                            "hostname": "observed-node",
                            "provider": "KVM",
                            "hw_info": {
                                "network": [
                                    {"mac_address": controller.CE_MAC, "name": "ens3"},
                                    {"mac_address": controller.SLI_MAC, "name": "ens4"},
                                ]
                            },
                        },
                    },
                }
            ]
        }
        interfaces = [
            {
                "name": name,
                "ethernet_interface": {"device": name, "mac": mac},
                "dhcp_client": {},
                "network_option": {network: {}},
            }
            for name, mac, network in (
                ("ens3", controller.CE_MAC, "site_local_network"),
                ("ens4", controller.SLI_MAC, "site_local_inside_network"),
            )
        ]
        site = {
            "metadata": {
                "name": "owned-site",
                "namespace": "system",
                "labels": {"owner": controller.OWNER},
            },
            "system_metadata": {"uid": "owned-uid"},
            "resource_version": "42",
            "spec": {
                "kvm": {
                    "not_managed": {
                        "node_list": [
                            {"hostname": "observed-node", "interface_list": interfaces}
                        ]
                    }
                },
                "site_state": "UPGRADING",
            },
        }
        config = {
            "siteName": "owned-site",
            "lan": {
                "subnet": "192.168.2.0/24",
                "sliAddress": "192.168.2.253",
                "vipAddress": "192.168.2.254",
            },
        }
        return site, registration, config

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
                "change": {
                    "actions": ["create"],
                    "after": {"namespace": "example"},
                },
            }

        valid = {
            "resource_changes": [
                change("xcsh_http_loadbalancer.home"),
                change("xcsh_origin_pool.home"),
            ]
        }
        controller.require_home_lan_plan(valid, "example")
        for changes in (
            [change("xcsh_http_loadbalancer.home")],
            valid["resource_changes"] + [change("xcsh_http_loadbalancer.other")],
        ):
            with self.assertRaises(controller.ControllerError):
                controller.require_home_lan_plan(
                    {"resource_changes": changes}, "example"
                )
        wrong = {
            "resource_changes": [
                {
                    **change("xcsh_http_loadbalancer.home"),
                    "change": {"actions": ["create"], "after": {"namespace": "system"}},
                },
                change("xcsh_origin_pool.home"),
            ]
        }
        with self.assertRaisesRegex(controller.ControllerError, "namespace"):
            controller.require_home_lan_plan(wrong, "example")

    def test_terraform_binds_observed_sli_without_mutating_platform_child(self):
        text = (ROOT / "terraform" / "main.tf").read_text()
        self.assertNotIn('resource "xcsh_smsv2_kvm_runtime_interface" "sli"', text)
        self.assertNotIn('data "xcsh_smsv2_kvm_runtime" "sli"', text)
        outputs = (ROOT / "terraform" / "outputs.tf").read_text()
        self.assertIn("device         = var.sli_device", outputs)
        self.assertIn("interface_name = var.sli_interface_name", outputs)
        self.assertEqual(text.count('resource "xcsh_origin_pool" "home"'), 1)
        self.assertEqual(text.count('resource "xcsh_http_loadbalancer" "home"'), 1)
        self.assertIn('network = "SITE_NETWORK_INSIDE"', text)
        self.assertNotIn("198.51.100.0/24", text)
        self.assertNotIn("xcsh_smsv2_kvm_runtime_interface.sli", outputs)

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

    def test_successful_bridge_records_original_state_for_owned_teardown(self):
        before = {
            "manager": "NetworkManager",
            "wiredLink": "enp5s0",
            "bridge": "xckvmlan",
            "hostAddress": "192.168.2.240",
            "gateway": "192.168.2.1",
            "physicalMac": "00:11:22:33:44:55",
            "subnet": "192.168.2.0/24",
            "bridgeReady": False,
            "ipv6": False,
            "neighbors": [],
        }
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            store.ensure()
            runner = mock.Mock()
            with (
                mock.patch.object(
                    controller,
                    "observe_home_lan",
                    side_effect=[before, {**before, "bridgeReady": True}],
                ),
                mock.patch.object(controller, "execute_checkpoint"),
                mock.patch.object(
                    controller.shutil, "which", return_value="/usr/bin/arping"
                ),
                mock.patch.object(controller, "_observed_lan_leases", return_value=[]),
                mock.patch.object(
                    controller,
                    "select_lan_addresses",
                    return_value=("192.168.2.253", "192.168.2.254"),
                ),
                mock.patch.object(controller, "validate_lan_recheck"),
            ):
                controller.prepare_home_lan(store, runner, {})
            self.assertFalse(store.read_receipt("lan")["inventory"]["bridgeReady"])

    def test_restore_skips_expired_transient_timers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "rollback"
            profile_dir = pathlib.Path(directory) / "system-connections"
            root.mkdir()
            profile_dir.mkdir()
            (root / "inventory.json").write_text(
                json.dumps(
                    {
                        "directory": str(profile_dir),
                        "files": {},
                        "manager": "networkmanager",
                        "wired": "enp5s0",
                        "address": "192.168.2.240",
                        "gateway": "192.168.2.1",
                    }
                )
            )
            with (
                mock.patch.object(bridge_prep, "ROOT", root),
                mock.patch.object(
                    bridge_prep,
                    "run",
                    side_effect=lambda *args: (
                        "xcsh-kvm-lan" if args[0] == "nmcli" else "not-found"
                    ),
                ) as commands,
                mock.patch.object(bridge_prep, "schedule"),
                mock.patch.object(bridge_prep, "rollback"),
                mock.patch.object(bridge_prep, "verify_original"),
                mock.patch.object(bridge_prep, "rollback_current") as rollback_current,
            ):
                bridge_prep.restore()
            self.assertFalse(root.exists())
            self.assertFalse(
                any(
                    call.args[:2] == ("systemctl", "stop")
                    for call in commands.call_args_list
                )
            )
            rollback_current.assert_not_called()

    def test_restored_management_never_rolls_back_on_timer_cleanup_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "rollback"
            profile_dir = pathlib.Path(directory) / "system-connections"
            root.mkdir()
            profile_dir.mkdir()
            (root / "inventory.json").write_text(
                json.dumps(
                    {
                        "directory": str(profile_dir),
                        "files": {},
                        "manager": "networkmanager",
                        "wired": "enp5s0",
                        "address": "192.168.2.240",
                        "gateway": "192.168.2.1",
                    }
                )
            )

            reason = "timer stop failed"

            def command(*args: str) -> str:
                if args[0] == "nmcli":
                    return "xcsh-kvm-lan"
                if args[:2] == ("systemctl", "stop"):
                    raise RuntimeError(reason)
                return "loaded"

            with (
                mock.patch.object(bridge_prep, "ROOT", root),
                mock.patch.object(bridge_prep, "run", side_effect=command),
                mock.patch.object(bridge_prep, "schedule"),
                mock.patch.object(bridge_prep, "rollback"),
                mock.patch.object(bridge_prep, "verify_original"),
                mock.patch.object(bridge_prep, "rollback_current") as rollback_current,
                self.assertRaisesRegex(RuntimeError, "timer stop failed"),
            ):
                bridge_prep.restore()
            self.assertTrue(root.exists())
            rollback_current.assert_not_called()

    def test_interrupted_restore_finalizes_verified_original_route(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "rollback"
            root.mkdir()
            (root / "current").mkdir()
            (root / "inventory.json").write_text(
                json.dumps(
                    {
                        "directory": str(
                            pathlib.Path(directory) / "system-connections"
                        ),
                        "files": {},
                        "currentFiles": {},
                        "manager": "networkmanager",
                        "wired": "enp5s0",
                        "address": "192.168.2.240",
                        "gateway": "192.168.2.1",
                    }
                )
            )

            reason = "bridge is absent"

            def command(*args: str) -> str:
                if args[0] == "nmcli":
                    raise RuntimeError(reason)
                return "not-found"

            original_exists = pathlib.Path.exists
            with (
                mock.patch.object(bridge_prep, "ROOT", root),
                mock.patch.object(bridge_prep, "run", side_effect=command),
                mock.patch.object(bridge_prep, "verify_original") as verify,
                mock.patch.object(bridge_prep, "rollback") as rollback,
                mock.patch.object(
                    pathlib.Path,
                    "exists",
                    lambda path: (
                        False
                        if path == pathlib.Path("/sys/class/net/xckvmlan")
                        else original_exists(path)
                    ),
                ),
            ):
                bridge_prep.restore()
            verify.assert_called_once_with("enp5s0", "192.168.2.240", "192.168.2.1")
            rollback.assert_not_called()
            self.assertFalse(root.exists())

    def test_interrupted_networkd_restore_matches_original_profile_before_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "rollback"
            netplan = pathlib.Path(directory) / "netplan"
            root.mkdir()
            (root / "current").mkdir()
            netplan.mkdir()
            profile = netplan / "01-wired.yaml"
            profile.write_text("network: {version: 2}\n")
            digest = hashlib.sha256(profile.read_bytes()).hexdigest()
            (root / "inventory.json").write_text(
                json.dumps(
                    {
                        "directory": str(netplan),
                        "files": {profile.name: digest},
                        "modifiedSource": profile.name,
                        "modifiedSha256": "different",
                        "currentFiles": {profile.name: "different"},
                        "manager": "networkd",
                        "wired": "enp109s0",
                        "address": "192.168.2.34",
                        "gateway": "192.168.2.1",
                    }
                )
            )
            original_exists = pathlib.Path.exists
            with (
                mock.patch.object(bridge_prep, "ROOT", root),
                mock.patch.object(bridge_prep, "run", return_value="not-found"),
                mock.patch.object(bridge_prep, "verify_original") as verify,
                mock.patch.object(bridge_prep, "rollback") as rollback,
                mock.patch.object(
                    pathlib.Path,
                    "exists",
                    lambda path: (
                        False
                        if path == pathlib.Path("/sys/class/net/xckvmlan")
                        else original_exists(path)
                    ),
                ),
            ):
                bridge_prep.restore()
            verify.assert_called_once_with("enp109s0", "192.168.2.34", "192.168.2.1")
            rollback.assert_not_called()
            self.assertFalse(root.exists())

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
                "namespace": "example",
                "name": "site-lan",
                "labels": {"owner": controller.OWNER},
            }
        }
        with mock.patch.object(controller, "_xc_json", return_value=owned) as request:
            self.assertTrue(
                controller._owned_application_object(
                    "http_loadbalancers", "site-lan", "example"
                )["owned"]
            )
            request.assert_called_once_with(
                "/api/config/namespaces/example/http_loadbalancers/site-lan"
            )
        with mock.patch.object(
            controller,
            "_xc_json",
            return_value={"metadata": {**owned["metadata"], "name": "other"}},
        ):
            self.assertFalse(
                controller._owned_application_object(
                    "http_loadbalancers", "site-lan", "example"
                )["owned"]
            )
        with mock.patch.object(
            controller,
            "_xc_json",
            return_value={"metadata": {**owned["metadata"], "namespace": "system"}},
        ):
            self.assertFalse(
                controller._owned_application_object(
                    "http_loadbalancers", "site-lan", "example"
                )["owned"]
            )

    def test_application_namespace_is_selected_and_site_namespace_stays_system(self):
        terraform = (ROOT / "terraform" / "main.tf").read_text()
        variables = (ROOT / "terraform" / "variables.tf").read_text()
        self.assertIn('variable "application_namespace"', variables)
        for resource in ('xcsh_origin_pool" "home', 'xcsh_http_loadbalancer" "home'):
            block = terraform.split('resource "' + resource + '" {', 1)[1]
            self.assertIn(
                "namespace   = var.application_namespace", block.split("\n}", 1)[0]
            )
        self.assertIn(
            "namespace = var.application_namespace",
            terraform.split("default_route_pools {", 1)[1],
        )
        self.assertIn(
            'namespace = "system"',
            terraform.split("origin_servers {", 1)[1].split("\n}", 1)[0],
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
