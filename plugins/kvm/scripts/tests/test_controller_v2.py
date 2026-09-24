"""Unit contracts for the clean-break KVM SMSv2 controller."""
# pylint: disable=protected-access,too-many-lines,too-many-public-methods
# ruff: noqa: ANN001, ANN201, ANN202, ANN204, ANN003, D101, D102, INP001, PT009, PT027, RUF012, S101, SIM117, SLF001

import importlib.util
import io
import json
import os
import pathlib
import stat
import subprocess
import tempfile
import unittest
from typing import Any
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "kvm_smsv2_controller", ROOT / "scripts" / "kvm_smsv2_controller.py"
)
assert SPEC is not None
assert SPEC.loader is not None
controller = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(controller)
WAIT_SPEC = importlib.util.spec_from_file_location(
    "wait_registration", ROOT / "terraform" / "wait-registration.py"
)
assert WAIT_SPEC is not None
assert WAIT_SPEC.loader is not None
wait_registration = importlib.util.module_from_spec(WAIT_SPEC)
WAIT_SPEC.loader.exec_module(wait_registration)


class ControllerContractTests(unittest.TestCase):
    def test_controller_failures_emit_structured_detail_on_stderr(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(
                controller,
                "dispatch",
                side_effect=controller.ControllerError("observed failure"),
            ),
            mock.patch.object(controller.StateStore, "__init__", return_value=None),
            mock.patch("sys.stdout", stdout),
            mock.patch("sys.stderr", stderr),
            self.assertRaises(SystemExit) as raised,
        ):
            controller.main(["--json", "readiness"])
        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(stdout.getvalue(), "")
        payload = json.loads(stderr.getvalue())
        self.assertIs(payload["ok"], False)
        self.assertEqual(payload["error"], "observed failure")

    def test_registration_waiter_accepts_live_api_provider_field(self):
        observed = {
            "items": [
                {
                    "name": "r-observed",
                    "object": {"status": {"current_state": "ONLINE"}},
                    "get_spec": {
                        "passport": {"cluster_name": "onprem-nuc-kvm"},
                        "infra": {"provider": "KVM", "provider_ref": ""},
                    },
                }
            ]
        }
        self.assertEqual(
            wait_registration.registration_matches(observed, "onprem-nuc-kvm"),
            [observed["items"][0]],
        )

    def test_read_only_state_store_construction_does_not_create_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "state"
            store = controller.StateStore(root)
            runner = mock.Mock()
            with mock.patch.object(
                controller, "readiness", return_value={"state": "setup_required"}
            ):
                self.assertEqual(
                    controller.dispatch("setup", "status", {}, store, runner),
                    {"state": "setup_required", "deploymentAccepted": False},
                )
            self.assertFalse(root.exists())

    def test_setup_status_requires_an_accepted_owned_deployment(self):
        ready = {"state": "ready", "checks": {"artifacts": True}}
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "state"
            store = controller.StateStore(root)
            runner = mock.Mock()
            with mock.patch.object(controller, "readiness", return_value=ready):
                result = controller.dispatch("setup", "status", {}, store, runner)
            self.assertEqual(result["state"], "setup_required")
            self.assertIs(result["deploymentAccepted"], False)
            self.assertFalse(root.exists())

            expected = [
                {
                    "kind": "pool",
                    "name": controller.POOL,
                    "identity": "pool",
                    "owned": True,
                },
                {
                    "kind": "network",
                    "name": controller.NETWORK,
                    "identity": "network",
                    "owned": True,
                },
                {
                    "kind": "container",
                    "name": controller.FRR,
                    "identity": "frr",
                    "owned": True,
                },
                {
                    "kind": "domain",
                    "name": controller.CE_DOMAIN,
                    "identity": "ce",
                    "owned": True,
                },
                {
                    "kind": "domain",
                    "name": controller.WORKLOAD_DOMAIN,
                    "identity": "workload",
                    "owned": True,
                },
            ]
            store.write_receipt("status", {"accepted": True})
            store.write_receipt(
                "ownership",
                {
                    "resources": [
                        {key: item[key] for key in ("kind", "name", "identity")}
                        for item in expected
                    ]
                },
            )
            with (
                mock.patch.object(controller, "readiness", return_value=ready),
                mock.patch.object(controller, "inventory", return_value=expected),
            ):
                result = controller.dispatch("setup", "status", {}, store, runner)
            self.assertEqual(result["state"], "ready")
            self.assertIs(result["deploymentAccepted"], True)

    def test_default_site_name_is_stable_and_sanitized(self):
        self.assertEqual(
            controller.default_site_name("NUC Lab_01.example"),
            "onprem-nuc-lab-01-example-kvm",
        )

    def test_envelope_is_versioned_and_redacts_secrets(self):
        envelope = controller.envelope(
            "status",
            {
                "token": "secret-value",
                "message": "Bearer abc",
                "passwordlessSudo": True,
            },
        )
        encoded = json.dumps(envelope)
        self.assertEqual(envelope["schemaVersion"], "kvm.smsv2/v3")
        self.assertIs(envelope["result"]["passwordlessSudo"], True)
        self.assertNotIn("secret-value", encoded)
        self.assertNotIn("Bearer abc", encoded)

    def test_receipt_is_atomic_owner_only_and_stale_receipts_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            path = store.write_receipt("deploy", {"siteName": "onprem-nuc-kvm"})
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            receipt = store.read_receipt("deploy")
            self.assertEqual(receipt["siteName"], "onprem-nuc-kvm")
            secret_path = store.write_receipt(
                "secret-check", {"apiToken": "never-store-this"}
            )
            self.assertNotIn("never-store-this", secret_path.read_text())
            receipt["schemaVersion"] = "old"
            path.write_text(json.dumps(receipt))
            with self.assertRaisesRegex(controller.ControllerError, "stale receipt"):
                store.read_receipt("deploy")

    def test_plan_policy_rejects_cloud_actions_and_allows_only_owned_providers(self):
        allowed = {
            "resource_changes": [
                {
                    "address": "libvirt_domain.ce",
                    "provider_name": "registry.terraform.io/dmacvicar/libvirt",
                    "change": {"actions": ["create"]},
                }
            ]
        }
        self.assertEqual(controller.inspect_plan(allowed)["create"], 1)
        runtime_read = {
            "resource_changes": [
                {
                    "address": "data.xcsh_smsv2_kvm_runtime.ce",
                    "provider_name": "registry.terraform.io/f5-sales-demo/xcsh",
                    "change": {"actions": ["read"]},
                }
            ]
        }
        self.assertEqual(controller.inspect_plan(runtime_read)["read"], 1)
        forbidden = {
            "resource_changes": [
                {
                    "address": "aws_instance.bad",
                    "provider_name": "registry.terraform.io/hashicorp/aws",
                    "change": {"actions": ["create"]},
                }
            ]
        }
        with self.assertRaisesRegex(controller.ControllerError, "forbidden provider"):
            controller.inspect_plan(forbidden)
        external = {
            "resource_changes": [
                {
                    "address": "data.external.bad",
                    "provider_name": "registry.terraform.io/hashicorp/external",
                    "change": {"actions": ["read"]},
                }
            ]
        }
        with self.assertRaisesRegex(controller.ControllerError, "forbidden provider"):
            controller.inspect_plan(external)

    def test_exact_saved_plan_hash_is_required(self):
        with tempfile.TemporaryDirectory() as directory:
            plan = pathlib.Path(directory) / "plan.tfplan"
            plan.write_bytes(b"one")
            digest = controller.file_digest(plan, "sha256")
            controller.require_plan_digest(plan, digest)
            plan.write_bytes(b"two")
            with self.assertRaisesRegex(
                controller.ControllerError, "saved plan hash changed"
            ):
                controller.require_plan_digest(plan, digest)

    def test_eof_classification_never_retries_and_requires_exact_owned_match(self):
        self.assertEqual(
            controller.classify_ambiguous_post("POST failed: EOF", None), "stop_absent"
        )
        self.assertEqual(
            controller.classify_ambiguous_post(
                "unexpected EOF", {"owned": True, "specMatches": True}
            ),
            "reconcile_exact_owned",
        )
        self.assertEqual(
            controller.classify_ambiguous_post(
                "unexpected EOF", {"owned": False, "specMatches": True}
            ),
            "stop_collision",
        )

    def test_sli_permission_failure_is_classified_without_echoing_api_output(self):
        output = (
            'Error: KVM Runtime Interface Adoption Failed\n'
            'with xcsh_smsv2_kvm_runtime_interface.sli\n'
            '[FORBIDDEN] Access denied - insufficient permissions '
            '(resource: network_interface; token=never-print-this)'
        )
        self.assertEqual(
            controller.safe_apply_failure(output),
            "XC network_interface write denied for the SLI; use an authorized "
            "XC credential and a new reviewed plan",
        )
        self.assertIsNone(controller.safe_apply_failure("unrelated failure"))

    def test_inventory_rejects_conflicts_and_preserves_unrelated_resources(self):
        inventory = [
            {"kind": "domain", "name": "unrelated", "owned": False},
            {"kind": "network", "name": "xcsh-kvm-smsv2", "owned": False},
        ]
        with self.assertRaisesRegex(controller.ControllerError, "ownership collision"):
            controller.reject_collisions(inventory)
        self.assertEqual(
            controller.unrelated_resources(inventory),
            [{"kind": "domain", "name": "unrelated"}],
        )

    def test_supplementary_groups_are_resolved_from_process_group_ids(self):
        primary = type("Group", (), {"gr_name": "primary", "gr_mem": []})()
        supplemental = type("Group", (), {"gr_name": "libvirt", "gr_mem": []})()
        with (
            mock.patch.object(controller.os, "getgid", return_value=100),
            mock.patch.object(controller.os, "getgroups", return_value=[100, 200]),
            mock.patch.object(controller.grp, "getgrall", return_value=[]),
            mock.patch.object(
                controller.grp,
                "getgrgid",
                side_effect={100: primary, 200: supplemental}.__getitem__,
            ),
        ):
            self.assertEqual(controller._group_names(), {"primary", "libvirt"})

    def test_terraform_version_requires_exact_pin(self):
        class VersionRunner:
            def __init__(self, version):
                self.version = version

            def run(self, argv, **_kwargs):
                return subprocess.CompletedProcess(
                    argv, 0, json.dumps({"terraform_version": self.version}), ""
                )

        self.assertTrue(controller.terraform_version_ready(VersionRunner("1.16.3")))
        self.assertFalse(controller.terraform_version_ready(VersionRunner("1.16.2")))

    def test_runner_prepends_standard_user_bin_over_shadowed_terraform(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            user_bin = root / ".local" / "bin"
            shadow_bin = root / "shadow" / "bin"
            user_bin.mkdir(parents=True)
            shadow_bin.mkdir(parents=True)
            expected = user_bin / "terraform"
            shadowed = shadow_bin / "terraform"
            expected.write_text(
                "#!/bin/sh\nprintf '%s\\n' '{\"terraform_version\":\"1.16.3\"}'\n"
            )
            shadowed.write_text(
                "#!/bin/sh\nprintf '%s\\n' '{\"terraform_version\":\"1.7.5\"}'\n"
            )
            expected.chmod(0o755)
            shadowed.chmod(0o755)
            with mock.patch.object(controller.pathlib.Path, "home", return_value=root):
                result = controller.Runner().run(
                    ["terraform", "version", "-json"],
                    env={"PATH": f"{shadow_bin}:/usr/bin:/bin"},
                )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["terraform_version"], "1.16.3")

    def test_setup_missing_credentials_rejects_before_any_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            runner = mock.Mock()
            with (
                mock.patch.dict(os.environ, {}, clear=True),
                mock.patch.object(controller, "install_bundle") as install_bundle,
                mock.patch.object(controller, "_setup_apply") as setup_apply,
            ):
                with self.assertRaisesRegex(
                    controller.ControllerError,
                    "active xcsh context must provide XCSH_API_URL and XCSH_API_TOKEN",
                ):
                    controller.dispatch("setup", "apply", {}, store, runner)
        install_bundle.assert_not_called()
        setup_apply.assert_not_called()
        runner.run.assert_not_called()
        runner.checked.assert_not_called()

    def test_constrained_capacity_is_not_ready(self):
        self.assertTrue(controller.capacity_ready(10, 34, 125))
        self.assertFalse(controller.capacity_ready(9, 34, 125))
        self.assertFalse(controller.capacity_ready(10, 33, 125))
        self.assertFalse(controller.capacity_ready(10, 34, 124))

    def test_receipt_owned_domains_satisfy_consumed_capacity(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            runner = mock.Mock()
            owned = [
                {
                    "kind": "domain",
                    "name": controller.CE_DOMAIN,
                    "identity": "ce-uuid",
                    "owned": True,
                },
                {
                    "kind": "domain",
                    "name": controller.WORKLOAD_DOMAIN,
                    "identity": "workload-uuid",
                    "owned": True,
                },
            ]
            store.write_receipt(
                "ownership",
                {
                    "resources": [
                        {key: item[key] for key in ("kind", "name", "identity")}
                        for item in owned
                    ]
                },
            )
            with mock.patch.object(controller, "inventory", return_value=owned):
                self.assertTrue(
                    controller.capacity_ready(10, 2, 20, store=store, runner=runner)
                )

            mismatched = [{**owned[0], "identity": "other-ce-uuid"}, owned[1]]
            with mock.patch.object(controller, "inventory", return_value=mismatched):
                self.assertFalse(
                    controller.capacity_ready(10, 2, 20, store=store, runner=runner)
                )

    def test_readiness_requires_every_managed_package(self):
        runner = mock.Mock()
        runner.run.side_effect = lambda argv, **_kwargs: subprocess.CompletedProcess(
            argv,
            1
            if argv[:3] == ["dpkg-query", "--show", "--showformat=${db:Status-Abbrev}"]
            and argv[-1] == "bridge-utils"
            else 0,
            '{"terraform_version":"1.16.3"}'
            if argv[:2] == ["terraform", "version"]
            else "",
            "",
        )
        with (
            mock.patch.object(
                controller, "_group_names", return_value={"kvm", "libvirt", "docker"}
            ),
            mock.patch.object(controller, "_memory_gib", return_value=64),
            mock.patch.object(controller.os, "cpu_count", return_value=16),
            mock.patch.object(controller.shutil, "which", return_value="/usr/bin/tool"),
            mock.patch.object(controller.pathlib.Path, "exists", return_value=True),
            mock.patch.object(controller.pathlib.Path, "is_file", return_value=True),
            mock.patch.object(controller, "_artifact_manifest", return_value={}),
            mock.patch.object(
                controller.shutil,
                "disk_usage",
                return_value=type("Usage", (), {"free": 200 * 2**30})(),
            ),
        ):
            result = controller.readiness(runner)
        self.assertFalse(result["checks"]["packages"]["bridge-utils"])
        self.assertEqual(result["state"], "setup_required")

    def test_live_identity_requires_ce_shape_mac_and_dhcp_address(self):
        domain = {
            "exists": True,
            "state": "running",
            "vcpu": 8,
            "memoryKiB": 32 * 1024 * 1024,
            "diskCapacityBytes": 100 * 1024**3,
            "macs": ["52:54:00:10:00:11"],
        }
        self.assertTrue(
            controller.ce_identity_ready(
                domain, ["10.100.0.11/24"], "52:54:00:10:00:11"
            )
        )
        self.assertFalse(
            controller.ce_identity_ready(
                {**domain, "vcpu": 4}, ["10.100.0.11/24"], "52:54:00:10:00:11"
            )
        )
        self.assertFalse(
            controller.ce_identity_ready(
                domain, ["10.100.0.12/24"], "52:54:00:10:00:11"
            )
        )

    def test_domain_observation_uses_supported_domblkinfo_contract(self):
        class DomainRunner:
            def __init__(self):
                self.calls = []

            def run(self, argv, **_kwargs):
                self.calls.append(argv)
                if "dumpxml" in argv:
                    return subprocess.CompletedProcess(
                        argv,
                        0,
                        """<domain><memory unit="KiB">33554432</memory><vcpu>8</vcpu>
                        <devices><disk device="disk"><target dev="vda"/></disk>
                        <interface><mac address="52:54:00:10:00:11"/></interface>
                        </devices></domain>""",
                        "",
                    )
                if "domblkinfo" in argv:
                    if "--bytes" in argv:
                        return subprocess.CompletedProcess(
                            argv, 1, "", "option --bytes is unsupported"
                        )
                    return subprocess.CompletedProcess(
                        argv, 0, "Capacity:       107374182400\n", ""
                    )
                if "domstate" in argv:
                    return subprocess.CompletedProcess(argv, 0, "running\n", "")
                return subprocess.CompletedProcess(argv, 1, "", "unexpected")

        runner = DomainRunner()
        observed = controller._domain_observation(runner, controller.CE_DOMAIN)
        self.assertEqual(observed["diskCapacityBytes"], 100 * 1024**3)
        self.assertFalse(any("--bytes" in argv for argv in runner.calls))

    def test_unrelated_left_stopped_reports_only_previously_running_workloads(self):
        before = [
            {"kind": "domain", "name": "manual-vm", "owned": False, "running": True},
            {
                "kind": "container",
                "name": "already-stopped",
                "owned": False,
                "running": False,
            },
            {"kind": "network", "name": "default", "owned": False},
        ]
        after = [
            {"kind": "domain", "name": "manual-vm", "owned": False, "running": False},
            {
                "kind": "container",
                "name": "already-stopped",
                "owned": False,
                "running": False,
            },
            {"kind": "network", "name": "default", "owned": False},
        ]
        self.assertEqual(
            controller.unrelated_left_stopped(
                controller.unrelated_resources(before), after
            ),
            [{"kind": "domain", "name": "manual-vm", "state": "stopped"}],
        )

    def test_setup_apply_recovers_interrupted_state_before_collision_check(self):
        ready = {
            "state": "ready",
            "checks": {
                "platform": True,
                "passwordlessSudo": True,
                "commands": {"terraform": True},
                "packages": dict.fromkeys(controller.APT_PACKAGES, True),
                "groups": {"kvm": True, "libvirt": True, "docker": True},
                "modules": True,
                "services": {
                    "libvirtd": {"active": True, "enabled": True},
                    "docker": {"active": True, "enabled": True},
                },
                "capacity": {"ready": True},
            },
        }
        events = []

        def inventory_side_effect(*_args: Any):
            events.append("inventory")
            return []

        runner = mock.Mock()
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with (
                mock.patch.object(
                    controller,
                    "_credentials",
                    return_value=("https://example.test", "token"),
                ),
                mock.patch.object(
                    controller,
                    "_config",
                    return_value={"siteName": "onprem-nuc-kvm"},
                ),
                mock.patch.object(
                    controller,
                    "_recover_interrupted_ownership",
                    side_effect=lambda *_args: events.append("recover"),
                ) as recover,
                mock.patch.object(
                    controller,
                    "inventory",
                    side_effect=inventory_side_effect,
                ),
                mock.patch.object(controller, "readiness", side_effect=[ready, ready]),
                mock.patch.object(
                    controller, "terraform_version_ready", return_value=True
                ),
                mock.patch.object(
                    controller, "_deploy", return_value={"accepted": True}
                ) as deploy,
            ):
                result = controller._setup_apply(store, {}, runner)

        self.assertEqual(result, {"accepted": True})
        self.assertEqual(events[:2], ["recover", "inventory"])
        recover.assert_called_once_with(
            store, store.root / "terraform", "onprem-nuc-kvm", runner
        )
        deploy.assert_called_once_with(store, {}, runner)

    def test_clean_host_setup_repairs_requirements_checkpoints_and_reboots(self):
        before = {
            "state": "setup_required",
            "checks": {
                "platform": True,
                "passwordlessSudo": True,
                "commands": {"terraform": False},
                "packages": {"qemu-kvm": False},
                "groups": {"kvm": False, "libvirt": False, "docker": False},
                "modules": False,
                "services": {
                    "libvirtd": {"active": False, "enabled": False},
                    "docker": {"active": False, "enabled": False},
                },
                "capacity": {"ready": True},
            },
        }
        after = json.loads(json.dumps(before))
        after["checks"]["commands"] = {"terraform": True}
        after["checks"]["packages"] = {"qemu-kvm": True}
        after["checks"]["groups"] = {"kvm": True, "libvirt": True, "docker": True}
        after["checks"]["modules"] = True
        after["checks"]["services"] = {
            "libvirtd": {"active": True, "enabled": True},
            "docker": {"active": True, "enabled": True},
        }
        runner = mock.Mock()
        runner.run.return_value = subprocess.CompletedProcess([], 0, "", "")
        runner.checked.return_value = ""
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with (
                mock.patch.object(
                    controller,
                    "_credentials",
                    return_value=("https://example.test", "token"),
                ),
                mock.patch.object(controller, "inventory", return_value=[]),
                mock.patch.object(controller, "readiness", side_effect=[before, after]),
                mock.patch.object(
                    controller, "terraform_version_ready", return_value=False
                ),
                mock.patch.object(
                    controller, "_install_terraform"
                ) as install_terraform,
                mock.patch.object(
                    controller, "_config", return_value={"siteName": "onprem-nuc-kvm"}
                ),
                mock.patch.object(
                    controller, "_persist_resume_credentials"
                ) as persist_credentials,
                mock.patch.object(controller, "_herdr_ids", return_value=["w2"]),
            ):
                result = controller._setup_apply(store, {}, runner)
        self.assertEqual(result["state"], "rebooting")
        self.assertEqual(result["checkpoint"]["herdrWorkspaces"], ["w2"])
        install_terraform.assert_called_once_with(runner)
        persist_credentials.assert_called_once_with(runner, mock.ANY)
        checked_commands = [call.args[0] for call in runner.checked.call_args_list]
        self.assertIn(["sudo", "apt-get", "update"], checked_commands)
        self.assertIn(["sudo", "systemctl", "reboot"], checked_commands)

    def test_partial_setup_changes_only_the_missing_group(self):
        ready_checks = {
            "platform": True,
            "passwordlessSudo": True,
            "commands": {"docker": True, "terraform": True},
            "packages": dict.fromkeys(controller.APT_PACKAGES, True),
            "groups": {"kvm": True, "libvirt": False, "docker": True},
            "modules": True,
            "services": {
                "libvirtd": {"active": True, "enabled": True},
                "docker": {"active": True, "enabled": True},
            },
            "capacity": {"ready": True},
        }
        before = {"state": "setup_required", "checks": ready_checks}
        after = json.loads(json.dumps(before))
        after["checks"]["groups"]["libvirt"] = True
        runner = mock.Mock()
        runner.run.return_value = subprocess.CompletedProcess([], 0, "", "")
        runner.checked.return_value = ""
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with (
                mock.patch.object(
                    controller,
                    "_credentials",
                    return_value=("https://example.test", "token"),
                ),
                mock.patch.object(controller, "inventory", return_value=[]),
                mock.patch.object(controller, "readiness", side_effect=[before, after]),
                mock.patch.object(
                    controller, "terraform_version_ready", return_value=True
                ),
                mock.patch.object(
                    controller, "_config", return_value={"siteName": "onprem-nuc-kvm"}
                ),
                mock.patch.object(controller, "_persist_resume_credentials"),
                mock.patch.object(controller, "_herdr_ids", return_value=[]),
            ):
                controller._setup_apply(store, {}, runner)
        checked_commands = [call.args[0] for call in runner.checked.call_args_list]
        self.assertEqual(
            [
                command
                for command in checked_commands
                if command[:2] == ["sudo", "usermod"]
            ],
            [["sudo", "usermod", "--append", "--groups", "libvirt", mock.ANY]],
        )
        self.assertFalse(
            any(
                command[:3] == ["sudo", "apt-get", "update"]
                for command in checked_commands
            )
        )
        self.assertFalse(
            any(
                command[:3] == ["sudo", "systemctl", "enable"]
                for command in checked_commands
            )
        )

    def test_non_session_remediation_continues_without_reboot(self):
        ready_checks = {
            "platform": True,
            "passwordlessSudo": True,
            "commands": {"docker": True, "terraform": True},
            "packages": dict.fromkeys(controller.APT_PACKAGES, True),
            "groups": {"kvm": True, "libvirt": True, "docker": True},
            "modules": True,
            "services": {
                "libvirtd": {"active": False, "enabled": True},
                "docker": {"active": True, "enabled": True},
            },
            "capacity": {"ready": True},
        }
        before = {"state": "setup_required", "checks": ready_checks}
        after = json.loads(json.dumps(before))
        after["state"] = "ready"
        after["checks"]["services"]["libvirtd"]["active"] = True
        runner = mock.Mock()
        runner.run.return_value = subprocess.CompletedProcess([], 0, "", "")
        runner.checked.return_value = ""
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with (
                mock.patch.object(
                    controller,
                    "_credentials",
                    return_value=("https://example.test", "token"),
                ),
                mock.patch.object(controller, "inventory", return_value=[]),
                mock.patch.object(controller, "readiness", side_effect=[before, after]),
                mock.patch.object(
                    controller, "terraform_version_ready", return_value=False
                ),
                mock.patch.object(
                    controller, "_install_terraform"
                ) as install_terraform,
                mock.patch.object(
                    controller, "_deploy", return_value={"accepted": True}
                ) as deploy,
            ):
                result = controller._setup_apply(store, {}, runner)
        self.assertEqual(result, {"accepted": True})
        install_terraform.assert_called_once_with(runner)
        deploy.assert_called_once_with(store, {}, runner)
        self.assertNotIn(
            ["sudo", "systemctl", "reboot"],
            [call.args[0] for call in runner.checked.call_args_list],
        )

    def test_existing_docker_provider_does_not_request_conflicting_docker_io_package(
        self,
    ):
        checks = {
            "commands": {"docker": True, "terraform": False},
            "packages": {
                name: True for name in controller.APT_PACKAGES if name != "docker.io"
            },
        }
        checks["packages"]["docker.io"] = False

        self.assertEqual(controller.apt_packages_to_install(checks), [])
        checks["commands"]["docker"] = False
        self.assertEqual(controller.apt_packages_to_install(checks), ["docker.io"])

    def test_matching_names_are_not_ownership_evidence(self):
        class InventoryRunner:
            identities = {
                "xcsh-kvm-smsv2-ce": "domain-uuid",
                "xcsh-kvm-smsv2": "network-uuid",
            }

            def run(self, argv, **_kwargs):
                if argv[1:4] == ["--connect", "qemu:///system", "list"]:
                    return subprocess.CompletedProcess(
                        argv, 0, "xcsh-kvm-smsv2-ce\n", ""
                    )
                if "net-list" in argv:
                    return subprocess.CompletedProcess(argv, 0, "xcsh-kvm-smsv2\n", "")
                if "pool-list" in argv or argv[:2] == ["docker", "ps"]:
                    return subprocess.CompletedProcess(argv, 0, "", "")
                if "domuuid" in argv:
                    return subprocess.CompletedProcess(argv, 0, "domain-uuid\n", "")
                if "net-uuid" in argv:
                    return subprocess.CompletedProcess(argv, 0, "network-uuid\n", "")
                return subprocess.CompletedProcess(argv, 1, "", "not found")

        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            observed = controller.inventory(InventoryRunner(), store)
            self.assertTrue(all(item["owned"] is False for item in observed))
            store.write_receipt(
                "ownership",
                {
                    "resources": [
                        {
                            "kind": item["kind"],
                            "name": item["name"],
                            "identity": item["identity"],
                        }
                        for item in observed
                    ]
                },
            )
            observed = controller.inventory(InventoryRunner(), store)
            self.assertTrue(all(item["owned"] is True for item in observed))

    def test_interrupted_apply_recovers_only_exact_state_owned_resources(self):
        state: dict[str, Any] = {
            "resources": [
                {
                    "mode": "managed",
                    "type": "docker_container",
                    "name": "frr",
                    "instances": [
                        {
                            "attributes": {
                                "id": "container-id",
                                "name": controller.FRR,
                            }
                        }
                    ],
                },
                {
                    "mode": "managed",
                    "type": "libvirt_domain",
                    "name": "workload",
                    "instances": [
                        {
                            "attributes": {
                                "id": "domain-id",
                                "name": controller.WORKLOAD_DOMAIN,
                            }
                        }
                    ],
                },
                {
                    "mode": "managed",
                    "type": "xcsh_securemesh_site_v2",
                    "name": "site",
                    "instances": [
                        {
                            "attributes": {
                                "id": "onprem-nuc-kvm",
                                "name": "onprem-nuc-kvm",
                            }
                        }
                    ],
                },
            ]
        }
        resources, site_owned = controller.parse_state_ownership(
            state, "onprem-nuc-kvm"
        )
        self.assertEqual(
            resources,
            [
                {
                    "kind": "container",
                    "name": controller.FRR,
                    "identity": "container-id",
                },
                {
                    "kind": "domain",
                    "name": controller.WORKLOAD_DOMAIN,
                    "identity": "domain-id",
                },
            ],
        )
        self.assertTrue(site_owned)

        state["resources"][0]["instances"][0]["attributes"]["name"] = "foreign"
        with self.assertRaisesRegex(controller.ControllerError, "state ownership"):
            controller.parse_state_ownership(state, "onprem-nuc-kvm")

    def test_interrupted_apply_allows_state_owned_resources_to_be_absent(self):
        state = {
            "resources": [
                {
                    "mode": "managed",
                    "type": "docker_container",
                    "name": "frr",
                    "instances": [
                        {
                            "attributes": {
                                "id": "missing-container-id",
                                "name": controller.FRR,
                            }
                        }
                    ],
                },
                {
                    "mode": "managed",
                    "type": "libvirt_domain",
                    "name": "workload",
                    "instances": [
                        {
                            "attributes": {
                                "id": "domain-id",
                                "name": controller.WORKLOAD_DOMAIN,
                            }
                        }
                    ],
                },
                {
                    "mode": "managed",
                    "type": "xcsh_securemesh_site_v2",
                    "name": "site",
                    "instances": [
                        {
                            "attributes": {
                                "id": "onprem-nuc-kvm",
                                "name": "onprem-nuc-kvm",
                            }
                        }
                    ],
                },
            ]
        }

        class RecoveryRunner:
            def run(self, argv, **_kwargs):
                if argv[:2] == ["docker", "inspect"]:
                    return subprocess.CompletedProcess(argv, 1, "", "not found")
                if "domuuid" in argv:
                    return subprocess.CompletedProcess(argv, 0, "domain-id\n", "")
                return subprocess.CompletedProcess(argv, 1, "", "not found")

        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            terraform_root = store.root / "terraform"
            terraform_root.mkdir(parents=True)
            (terraform_root / "terraform.tfstate").write_text(json.dumps(state))

            site_owned = controller._recover_interrupted_ownership(
                store, terraform_root, "onprem-nuc-kvm", RecoveryRunner()
            )

            self.assertTrue(site_owned)
            self.assertEqual(
                store.read_receipt("ownership")["resources"],
                [
                    {
                        "kind": "domain",
                        "name": controller.WORKLOAD_DOMAIN,
                        "identity": "domain-id",
                    }
                ],
            )

            class CollisionRunner(RecoveryRunner):
                def run(self, argv, **kwargs):
                    if "domuuid" in argv:
                        return subprocess.CompletedProcess(argv, 0, "foreign-id\n", "")
                    return super().run(argv, **kwargs)

            with self.assertRaisesRegex(
                controller.ControllerError, "ownership collision"
            ):
                controller._recover_interrupted_ownership(
                    store, terraform_root, "onprem-nuc-kvm", CollisionRunner()
                )

    def test_installed_bundle_is_checksum_verified_and_resume_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source"
            (source / "terraform").mkdir(parents=True)
            (source / "scripts").mkdir()
            (source / "terraform" / "main.tf").write_text("terraform {}\n")
            (source / "scripts" / "kvm_smsv2_controller.py").write_text(
                "# installed controller\n"
            )
            artifacts = {
                "terraform/main.tf": controller.file_digest(
                    source / "terraform" / "main.tf"
                ),
                "scripts/kvm_smsv2_controller.py": controller.file_digest(
                    source / "scripts" / "kvm_smsv2_controller.py"
                ),
            }
            (source / "artifacts.json").write_text(json.dumps({"artifacts": artifacts}))
            store = controller.StateStore(root / "state")
            installed = controller.install_bundle(store, source)
            self.assertEqual(installed, store.root / "terraform")
            immutable = controller.active_bundle(store)
            (immutable / "terraform" / "main.tf").write_text("corrupt\n")
            with self.assertRaisesRegex(
                controller.ControllerError, "artifact checksum failed"
            ):
                controller.active_bundle(store)

    def test_exclusive_lock_rejects_interruption(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            with store.lock():
                with self.assertRaisesRegex(
                    controller.ControllerError, "exclusive lock"
                ):
                    with store.lock():
                        pass

    def test_acceptance_requires_online_bgp_routes_traffic_and_zero_change(self):
        accepted = {
            "site": {"state": "ONLINE", "errorCount": 0},
            "registration": {
                "count": 1,
                "onlineCount": 1,
                "registrations": [
                    {
                        "provider": "KVM",
                        "macs": ["52:54:00:10:00:11", "52:54:00:10:00:12"],
                    }
                ],
            },
            "host": {
                "ceIdentityReady": True,
                "sliIdentityReady": True,
                "workloadIdentityReady": True,
            },
            "lan": {"localHttp": True, "bridgeReady": True, "conflictFree": True},
            "application": {"origin": {"owned": True}, "httpLb": {"owned": True}},
            "images": {"verified": True},
            "bgp": {
                "peerCount": 1,
                "establishedCount": 1,
                "importedRoutes": ["10.231.0.0/24"],
                "advertisedRouteCount": 1,
            },
            "traffic": {"samples": 5, "successes": 5},
            "zeroChange": True,
        }
        self.assertTrue(controller.acceptance_ready(accepted))
        for path in (
            ("site", "state"),
            ("host", "ceIdentityReady"),
            ("host", "sliIdentityReady"),
            ("lan", "localHttp"),
            ("lan", "conflictFree"),
            ("application", "origin"),
            ("images", "verified"),
            ("bgp", "establishedCount"),
            ("traffic", "successes"),
            (None, "zeroChange"),
        ):
            broken = json.loads(json.dumps(accepted))
            if path[0] is None:
                broken[path[1]] = False
            else:
                broken[path[0]][path[1]] = "OFFLINE" if path[1] == "state" else 0
            self.assertFalse(controller.acceptance_ready(broken))

    def test_image_hash_observation_verifies_both_pinned_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            ce = root / "ce-test.qcow2"
            workload = root / "workload-test.qcow2"
            ce.write_bytes(b"ce-image")
            workload.write_bytes(b"workload-image")
            observed = controller.image_hash_observation(
                ce,
                controller.file_digest(ce, "md5"),
                workload,
                controller.file_digest(workload, "sha512"),
            )
            self.assertTrue(observed["verified"])
            workload.write_bytes(b"drifted")
            self.assertFalse(
                controller.image_hash_observation(
                    ce,
                    observed["ce"]["expected"],
                    workload,
                    observed["workload"]["expected"],
                )["verified"]
            )

    def test_generated_traffic_targets_only_the_owned_ce(self):
        class TrafficRunner:
            def __init__(self):
                self.requests = []

            def run(self, argv, **_kwargs):
                request = json.loads(argv[-1])
                self.requests.append(request)
                if request["execute"] == "guest-exec":
                    self.assert_owned_target(request)
                    return subprocess.CompletedProcess(
                        argv, 0, json.dumps({"return": {"pid": 7}}), ""
                    )
                return subprocess.CompletedProcess(
                    argv,
                    0,
                    json.dumps({"return": {"exited": True, "exitcode": 0}}),
                    "",
                )

            @staticmethod
            def assert_owned_target(request) -> None:
                arguments = request["arguments"]
                assert arguments["path"] == "/usr/bin/ping"
                assert arguments["arg"] == ["-c", "1", "-W", "5", controller.CE_ADDRESS]
                assert "http" not in json.dumps(request).lower()

        runner = TrafficRunner()
        self.assertEqual(
            controller._guest_traffic(runner, samples=1), {"samples": 1, "successes": 1}
        )
        self.assertEqual(len(runner.requests), 2)

    def test_runtime_observations_require_exact_online_registration_and_route_path(
        self,
    ):
        registrations = {
            "items": [
                {
                    "name": "r-1",
                    "object": {"status": {"current_state": "ONLINE"}},
                    "get_spec": {
                        "passport": {"cluster_name": "onprem-nuc-kvm"},
                        "infra": {
                            "provider": "KVM",
                            "hw_info": {
                                "network": [{"mac_address": "52:54:00:10:00:11"}]
                            },
                        },
                    },
                }
            ]
        }
        self.assertEqual(
            controller.parse_registration_observation(registrations, "onprem-nuc-kvm")[
                "onlineCount"
            ],
            1,
        )
        peers = {
            "ver": [
                {
                    "name": "node-1",
                    "peer": [
                        {
                            "peer_address": {"ipv4": {"addr": "10.100.0.2"}},
                            "protocol_status": "Established",
                            "received_prefix_count": 1,
                            "advertised_prefix_count": 1,
                        }
                    ],
                }
            ]
        }
        routes = {
            "ver": [
                {
                    "name": "node-1",
                    "ri_table": [
                        {
                            "rt_table": [
                                {
                                    "imported": [
                                        {
                                            "subnet": "10.231.0.0/24",
                                            "path": [
                                                {
                                                    "peer": {
                                                        "ipv4": {"addr": "10.100.0.2"}
                                                    }
                                                }
                                            ],
                                        }
                                    ],
                                    "exported": [{"subnet": "10.100.0.0/24"}],
                                }
                            ]
                        }
                    ],
                }
            ]
        }
        parsed = controller.parse_bgp_observation(peers, routes)
        self.assertEqual(parsed["establishedCount"], 1)
        self.assertEqual(parsed["importedRoutes"], ["10.231.0.0/24"])
        self.assertEqual(parsed["advertisedRouteCount"], 1)

    def test_destroy_rejects_unowned_site_before_planning(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            store.write_receipt(
                "installation", {"release": "unused", "manifestSha256": "0" * 64}
            )
            with (
                mock.patch.object(
                    controller, "_config", return_value={"siteName": "onprem-nuc-kvm"}
                ),
                mock.patch.object(
                    controller,
                    "_site_observation",
                    return_value={"owned": False, "specMatches": True},
                ),
                self.assertRaisesRegex(controller.ControllerError, "destroy refused"),
            ):
                controller._destroy(store, controller.Runner())

    def test_reboot_resume_uses_the_installed_bundle_and_completes_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            store.write_receipt(
                "checkpoint", {"phase": "reboot_pending", "siteName": "onprem-nuc-kvm"}
            )
            bundle = store.releases / "v2.0.0-test"
            terraform_root = store.root / "terraform"
            bundle.mkdir()
            with (
                mock.patch.object(
                    controller, "active_bundle", return_value=bundle
                ) as active,
                mock.patch.object(
                    controller, "terraform_workspace", return_value=terraform_root
                ) as workspace,
                mock.patch.object(
                    controller, "_deploy", return_value={"accepted": True}
                ) as deploy,
                mock.patch.object(controller, "inventory", return_value=[]),
                mock.patch.object(controller, "_erase_resume_credentials") as erase,
            ):
                self.assertEqual(
                    controller._setup_resume(store, controller.Runner()),
                    {"accepted": True},
                )
            active.assert_called_once_with(store)
            workspace.assert_called_once_with(store, bundle)
            deploy.assert_called_once_with(
                store,
                {"siteName": "onprem-nuc-kvm"},
                mock.ANY,
                reconcile=True,
                terraform_root=terraform_root,
            )
            erase.assert_called_once()
            self.assertEqual(store.read_receipt("checkpoint")["phase"], "complete")

    def test_setup_apply_resumes_failed_reboot_checkpoint_after_host_repair(self):
        ready = {
            "state": "ready",
            "checks": {
                "platform": True,
                "passwordlessSudo": True,
                "packages": dict.fromkeys(controller.APT_PACKAGES, True),
                "groups": {"kvm": True, "libvirt": True, "docker": True},
                "modules": True,
                "services": {
                    "libvirtd": {"active": True, "enabled": True},
                    "docker": {"active": True, "enabled": True},
                },
                "capacity": {"ready": True},
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            store = controller.StateStore(pathlib.Path(directory))
            store.write_receipt(
                "checkpoint", {"phase": "reboot_pending", "siteName": "onprem-nuc-kvm"}
            )
            runner = mock.Mock()
            with (
                mock.patch.object(controller, "_credentials"),
                mock.patch.object(
                    controller, "_config", return_value={"siteName": "onprem-nuc-kvm"}
                ),
                mock.patch.object(controller, "_recover_interrupted_ownership"),
                mock.patch.object(controller, "inventory", return_value=[]),
                mock.patch.object(controller, "reject_collisions"),
                mock.patch.object(controller, "readiness", side_effect=[ready, ready]),
                mock.patch.object(controller, "terraform_version_ready", return_value=True),
                mock.patch.object(controller, "_setup_resume", return_value={"accepted": True}) as resume,
                mock.patch.object(controller, "_deploy") as deploy,
            ):
                self.assertEqual(
                    controller._setup_apply(store, {}, runner), {"accepted": True}
                )
            resume.assert_called_once_with(store, runner)
            deploy.assert_not_called()


if __name__ == "__main__":
    unittest.main()
