"""Exercise original-bound guest dispatch without substituting runtime acceptance."""

from __future__ import annotations

import shlex

import pytest

from plugins.terraform.scripts import gcp_guest_session as module


def replace(binding, **changes):
    """Copy a flat immutable original binding for invalid-input tests."""
    return binding._replace(**changes)


class Transport:
    def __init__(self, root, argv, **kwargs):
        self.root = root
        self.root.mkdir(mode=0o700)
        self.argv = argv
        self.calls = []
        self.listing = b"CONTAINER ID IMAGE\r\nabcdef1234567890 image\r\n>>> "
        self.failed = False
        self.truncated = False
        self.closed = False
        self.disconnected = False

    def exchange(self, command, suffix=b"\r", **kwargs):
        self.calls.append((command, suffix))
        if suffix == b"\t":
            if command == b"":
                return b"health status execcli exit\r\n>>> "
            if command == b"status ":
                return b"vpm\r\n>>> "
            if command == b"execcli ":
                return b"date ip-address ip-route crictl-ps-a crictl-inspect crictl-logs journalctl\r\n>>> "
            return b"--tail -u -n\r\n>>> "
        if command == b"execcli crictl-ps-a":
            return self.listing
        return b"retained response\r\n>>> "

    def clear_pending(self, *, deadline_ms):
        self.calls.append((b"", b"\x15\r"))
        return b">>> "

    def disconnect(self):
        self.disconnected = True

    def close(self):
        self.closed = True
        return True


@pytest.fixture
def binding(tmp_path):
    node_name = "example-node"
    site_name = "example-site"
    paths = {}
    for role in ("observer-key", "ce-key", "observer-hosts", "ce-hosts"):
        path = tmp_path / role
        path.write_text(
            "EXAMPLE_KEY" if "key" in role else "192.0.2.1 ssh-ed25519 EXAMPLE_HOST_KEY"
        )
        path.chmod(0o400)
        paths[role] = path
    return module.GuestBinding(
        project="example-project",
        region="us-central1",
        site_name="example-site",
        node_name=node_name,
        zone="us-central1-a",
        instance_id="123456789",
        observer_name="example-observer",
        observer_id="987654321",
        observer_address="192.0.2.1",
        address="192.0.2.2",
        original_interfaces=("192.0.2.3", "192.0.2.2"),
        token_node=node_name,
        token_site=site_name,
        token_expires=2000.0,
        token_sha256="a" * 64,
        ownership_sha256="b" * 64,
        observer_key=paths["observer-key"],
        ce_key=paths["ce-key"],
        observer_hosts=paths["observer-hosts"],
        ce_hosts=paths["ce-hosts"],
        observer_algorithm="ssh-ed25519",
        ce_algorithm="rsa-sha2-512",
    )


def session(tmp_path, binding, **kwargs):
    return module.GuestSession(
        tmp_path / "guest",
        binding,
        options=module.GuestOptions(
            executable=tmp_path / "ssh",
            executable_sha256="c" * 64,
            guards=module.GuestGuards(
                lambda: None, lambda _value: None, lambda _value, _role: None
            ),
            deadlines=(1000000, 1001000),
            epoch=lambda: 1000.0,
            monotonic=lambda: 1000,
            transport=Transport,
        ),
        **kwargs,
    )


def test_fresh_scoped_completion_precedes_dispatch(tmp_path, binding):
    guest = session(tmp_path, binding)
    with pytest.raises(ValueError, match="Fresh scoped completion"):
        guest.run("vpm")
    guest.discover("root")
    guest.discover("status")
    raw = guest.run("vpm")
    assert raw == b"retained response\r\n>>> "
    assert guest.retained[-1]["instanceId"] == binding.instance_id
    assert guest.retained[-1]["sha256"]
    assert tuple(
        guest.transport.argv[
            guest.transport.argv.index("-e") : guest.transport.argv.index("-e") + 2
        ]
    ) == ("-e", "~")


def test_only_original_fresh_listing_can_select_container(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    guest.discover("execcli")
    with pytest.raises(ValueError, match="Fresh original listing"):
        guest.run("cri-inspect", container_id="abcdef1234567890")
    guest.run("cri-list")
    with pytest.raises(ValueError, match="Foreign or ambiguous container"):
        guest.run("cri-inspect", container_id="9999999999999999")
    guest.run("cri-inspect", container_id="abcdef1234567890")
    assert guest.transport.calls[-1][0] == b"execcli crictl-inspect abcdef1234567890"


def test_stale_completion_and_listing_refuse_without_writing(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    guest.discover("execcli")
    guest.run("cri-list")
    guest.monotonic = lambda: 400001
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Fresh scoped completion"):
        guest.run("cri-inspect", container_id="abcdef1234567890")
    assert len(guest.transport.calls) == before


def test_changed_owner_preserves_failure_and_uses_protocol_close(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    guest.verify_original = lambda _value: (_ for _ in ()).throw(
        ValueError("original owner changed")
    )
    with pytest.raises(ValueError, match="original owner changed"):
        guest.run("health")
    assert guest.failed
    assert guest.close()
    assert guest.transport.disconnected
    assert list((tmp_path / "guest").glob("failure-*.json"))


def test_invalid_token_or_nic_never_opens_transport(tmp_path, binding):
    foreign_node = "example-foreign"
    for field in ("token", "nic", "expired"):
        bad = (
            replace(binding, token_node=foreign_node)
            if field == "token"
            else (
                replace(binding, address="192.0.2.99")
                if field == "nic"
                else replace(binding, token_expires=999.0)
            )
        )
        with pytest.raises(ValueError, match="Original"):
            session(tmp_path, bad)
        assert not (tmp_path / "guest").exists()


def test_malformed_listing_is_not_accepted_as_no_containers(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    guest.discover("execcli")
    guest.transport.listing = b"CONTAINER ID IMAGE\r\nnot-an-id vpm\r\n>>> "
    with pytest.raises(ValueError, match="Malformed original container listing"):
        guest.run("cri-list")
    assert guest.failed
    assert not guest.listings
    assert list((tmp_path / "guest").glob("*.output.private.bin"))


def test_replaced_private_key_refuses_before_command_write(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    before = len(guest.transport.calls)
    raw = binding.ce_key.read_bytes()
    replacement = tmp_path / "replacement"
    replacement.write_bytes(raw)
    replacement.chmod(0o400)
    replacement.replace(binding.ce_key)
    with pytest.raises(ValueError, match="replaced or rotated"):
        guest.run("health")
    assert len(guest.transport.calls) == before
    assert guest.failed


def test_new_completion_does_not_refresh_old_listing(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    guest.discover("execcli")
    guest.run("cri-list")
    guest.monotonic = lambda: 400001
    guest.discover("root")
    guest.discover("execcli")
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Fresh original listing"):
        guest.run("cri-inspect", container_id="abcdef1234567890")
    assert len(guest.transport.calls) == before


def test_expired_token_after_start_refuses_before_command_write(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    guest.epoch = lambda: 2000.0
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Original unexpired"):
        guest.run("health")
    assert len(guest.transport.calls) == before


def test_supported_log_option_must_be_discovered_in_its_own_scope(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    guest.discover("execcli")
    guest.run("cri-list")
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Fresh scoped completion"):
        guest.run("cri-logs", container_id="abcdef1234567890")
    assert len(guest.transport.calls) == before
    guest.discover("cri-logs")
    guest.run("cri-logs", container_id="abcdef1234567890")
    assert guest.retained[-1]["listingSha256"] == guest.listings["cri"][2]


def test_binding_and_budgets_cannot_be_replaced(tmp_path, binding):
    guest = session(tmp_path, binding)
    with pytest.raises(AttributeError):
        guest.binding = replace(binding, instance_id="5555555")
    with pytest.raises(AttributeError):
        guest.deadlines = (2000000, 2001000)


def test_failing_final_owner_check_keeps_raw_response_without_verification(
    tmp_path, binding
):
    guest = session(tmp_path, binding)
    guest.discover("root")
    calls = 0

    def owner(_value):
        nonlocal calls
        calls += 1
        if calls == 2:
            msg = "original owner changed"
            raise ValueError(msg)

    guest.verify_original = owner
    with pytest.raises(ValueError, match="original owner changed"):
        guest.run("health")
    item = guest.retained[-1]
    assert not item["guestAcceptanceComplete"]
    assert list((tmp_path / "guest").glob("guest-2.output.private.bin"))
    assert not list((tmp_path / "guest").glob("guest-2.verified.private.json"))


def test_token_expiry_during_ownership_read_refuses_before_write(tmp_path, binding):
    guest = session(tmp_path, binding)
    guest.discover("root")
    clock = [1000.0]
    guest.epoch = lambda: clock[0]

    def owner(_value):
        clock[0] = 2000.0

    guest.verify_original = owner
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Original unexpired"):
        guest.run("health")
    assert len(guest.transport.calls) == before


def test_reviewed_ubuntu_observer_route_retains_both_host_pins(tmp_path, binding):
    guest = session(tmp_path, binding)
    argv = guest.transport.argv
    proxy = next(
        value.removeprefix("ProxyCommand=")
        for value in argv
        if value.startswith("ProxyCommand=")
    )
    inner = shlex.split(proxy)
    assert inner[-1] == "ubuntu@" + binding.observer_address
    assert argv[-1] == "admin@" + binding.address
    assert "UserKnownHostsFile=" + str(binding.observer_hosts) in inner
    assert "UserKnownHostsFile=" + str(binding.ce_hosts) in argv
    assert "IdentityAgent=none" in inner
    assert "IdentityAgent=none" in argv


def test_unqualified_slo_guest_access_refuses_before_spawn(tmp_path, binding):
    bad = replace(binding, address=binding.original_interfaces[0])
    with pytest.raises(ValueError, match="Original two-interface CE NIC join"):
        session(tmp_path, bad)
    assert not (tmp_path / "guest").exists()


JOURNAL_HELP = b"""journalctl [OPTIONS...] [MATCHES...]
  -u --unit=UNIT             Show logs from the specified unit
  -b --boot[=ID]             Show logs from the specified boot
  -p --priority=RANGE        Show entries of the specified priority
  -o --output=STRING         Change journal output mode
     --no-pager              Do not pipe output into a pager
     --utc                   Express time in Coordinated Universal Time
>>> """
CRI_LOG_HELP = b"""NAME:
   crictl logs - Fetch the logs of a container
USAGE:
   crictl logs [command options] CONTAINER-ID
OPTIONS:
   --tail value   Number of lines to show from the end of the logs (default: -1)
>>> """
DOCKER_LOG_HELP = b"""Usage: docker logs [OPTIONS] CONTAINER
Options:
      --tail string   Number of lines to show from the end of the logs (default "all")
>>> """


def full_capture_session(tmp_path, binding):
    guest = session(tmp_path, binding)
    original = guest.transport.exchange
    responses = {
        b"execcli journalctl --help": JOURNAL_HELP,
        b"execcli crictl-logs --help": CRI_LOG_HELP,
        b"execcli docker-logs --help": DOCKER_LOG_HELP,
    }

    def exchange(command, suffix=b"\r", **kwargs):
        if suffix == b"\t" and command not in (b"", b"status "):
            guest.transport.calls.append((command, suffix))
            return b"journalctl\r\ncrictl-ps-a\r\ncrictl-inspect\r\ncrictl-logs\r\ndocker-ps-a\r\ndocker-inspect\r\ndocker-logs\r\n--help\r\n--tail\r\n-u\r\n-b\r\n-p\r\n-o\r\n--no-pager\r\n--utc\r\n>>> "
        if command in responses:
            guest.transport.calls.append((command, suffix))
            return responses[command]
        if command == b"execcli docker-ps-a":
            guest.transport.calls.append((command, suffix))
            return guest.transport.listing
        return original(command, suffix, **kwargs)

    guest.transport.exchange = exchange
    guest.discover("root")
    guest.discover("execcli")
    return guest, responses


def test_full_journal_requires_fresh_original_help_before_write(tmp_path, binding):
    guest, _responses = full_capture_session(tmp_path, binding)
    guest.discover("journal")
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Fresh original command help"):
        guest.run("vpm-journal-full")
    assert len(guest.transport.calls) == before
    guest.run("journal-help")
    guest.run("vpm-journal-full")
    assert guest.transport.calls[-1][0] == (
        b"execcli journalctl -u vpm --no-pager --utc -o short-iso-precise"
    )
    assert guest.retained[-1]["logSelection"] == "all-retained"
    assert not guest.retained[-1]["guestAcceptanceComplete"]
    assert guest.retained[-1]["helpSha256"]


@pytest.mark.parametrize(("runtime", "tail"), [("cri", "-1"), ("docker", "all")])
def test_full_container_logs_bind_help_and_fresh_listing(
    tmp_path, binding, runtime, tail
):
    guest, _responses = full_capture_session(tmp_path, binding)
    guest.discover(runtime + "-logs")
    guest.run(runtime + "-logs-help")
    guest.run(runtime + "-list")
    guest.run(runtime + "-logs-full", container_id="abcdef1234567890")
    command = guest.transport.calls[-1][0]
    executable = "crictl" if runtime == "cri" else "docker"
    assert (
        command == f"execcli {executable}-logs abcdef1234567890 --tail={tail}".encode()
    )
    assert guest.retained[-1]["listingSha256"] == guest.listings[runtime][2]
    assert guest.retained[-1]["helpSha256"]
    assert guest.retained[-1]["logSelection"] == "all-retained"


def test_unknown_full_log_help_is_retained_and_refuses(tmp_path, binding):
    guest, responses = full_capture_session(tmp_path, binding)
    guest.discover("cri-logs")
    responses[b"execcli crictl-logs --help"] = CRI_LOG_HELP.replace(
        b"default: -1", b"default: 200"
    )
    guest.run("cri-logs-help")
    guest.run("cri-list")
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Supported complete log selection"):
        guest.run("cri-logs-full", container_id="abcdef1234567890")
    assert len(guest.transport.calls) == before
    assert guest.retained[-2]["path"]


def test_refreshing_completion_does_not_refresh_command_help(tmp_path, binding):
    guest, _responses = full_capture_session(tmp_path, binding)
    guest.discover("journal")
    guest.run("journal-help")
    guest.monotonic = lambda: 400001
    guest.discover("root")
    guest.discover("execcli")
    guest.discover("journal")
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Fresh original command help"):
        guest.run("vpm-journal-full")
    assert len(guest.transport.calls) == before


def test_large_full_log_is_not_classified_using_tail_line_limit(tmp_path, binding):
    guest, _responses = full_capture_session(tmp_path, binding)
    guest.discover("journal")
    guest.run("journal-help")
    original = guest.transport.exchange

    def exchange(command, suffix=b"\r", **kwargs):
        if command.startswith(b"execcli journalctl -u vpm"):
            return b"2026-11-21T00:00:00+0000 example\r\n" * 250 + b">>> "
        return original(command, suffix, **kwargs)

    guest.transport.exchange = exchange
    guest.run("vpm-journal-full")
    assert not guest.retained[-1]["truncated"]
    assert not guest.retained[-1]["guestAcceptanceComplete"]


@pytest.mark.parametrize("flag", [b"--no-pager", b"--utc", b"-o"])
def test_full_journal_refuses_missing_help_option_before_write(tmp_path, binding, flag):
    guest, responses = full_capture_session(tmp_path, binding)
    guest.discover("journal")
    responses[b"execcli journalctl --help"] = JOURNAL_HELP.replace(flag, b"unavailable")
    guest.run("journal-help")
    before = len(guest.transport.calls)
    with pytest.raises(ValueError, match="Supported complete log selection"):
        guest.run("vpm-journal-full")
    assert len(guest.transport.calls) == before


def test_full_logs_cannot_select_foreign_or_injected_container(tmp_path, binding):
    guest, _responses = full_capture_session(tmp_path, binding)
    guest.discover("cri-logs")
    guest.run("cri-logs-help")
    guest.run("cri-list")
    before = len(guest.transport.calls)
    for container_id in ("9999999999999999", "abcdef1234567890;id"):
        with pytest.raises(ValueError, match="Foreign or ambiguous container"):
            guest.run("cri-logs-full", container_id=container_id)
    assert len(guest.transport.calls) == before


def test_transport_truncation_keeps_full_log_incomplete(tmp_path, binding):
    guest, _responses = full_capture_session(tmp_path, binding)
    guest.discover("journal")
    guest.run("journal-help")

    def exchange(_command, _suffix=b"\r", **_kwargs):
        guest.transport.truncated = True
        return b"partial retained log\r\n>>> "

    guest.transport.exchange = exchange
    with pytest.raises(ValueError, match="capture is retired"):
        guest.run("vpm-journal-full")
    assert guest.retained[-1]["truncated"]
    assert not guest.retained[-1]["guestAcceptanceComplete"]
    assert guest.failed
