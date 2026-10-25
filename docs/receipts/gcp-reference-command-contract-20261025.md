# Reference guest command evidence

Attempt 191 inspected an existing authorized KVM reference CE through its
node-specific diagnostic API. Independent domain UUID, NIC MACs, registration
and site membership checks bracketed each command. The guest and its
configuration were unchanged. This is reference command evidence; it does not
qualify GCP SSH access or substitute for installed runtime acceptance.

The fresh command catalog and successful help/version responses verified:

- `journalctl --help`
- `journalctl --version`
- `journalctl -u vpm -n 20 --no-pager --utc -o short-iso-precise`
- `crictl-ps-a` and an inspection derived from that original node's fresh listing.

The guest reported `systemd 252 (252-67.el9_8.6)`. Its bounded journal response
contained 20 timestamped records using a compact UTC offset, for example
`2026-10-25T13:36:24.326100+0000`, and one terminal empty line. The earlier
source-backed systemd 258 parser requires colonated offsets and correctly
refused this dialect. That parser and all frozen collectors remain unchanged.
A separate private parser for the observed reference dialect passes nine
failing-first tests for timestamps, version binding, empty lines, invalid
offsets, calendar errors, backward clocks, truncation and control bytes.

The existing shared runtime parser accepted the fresh 92-container listing and
one listing-derived inspection. It verified full container identity, name,
attempt, pod, state and namespace. This listing already included a namespace
column; it does not qualify omitted-namespace resolution on a GCP original.
All transferred capture hashes verified. Raw guest output remains private.

The journal sample contains recent records and establishes no bootstrap
coverage. Both GCP guest mapping holds remain active. Current-source campaign
admission, original GCP SSH/serial trust, complete bootstrap/container capture,
health, traffic and cleanup remain unqualified. No infrastructure was submitted;
all three first-stage campaign allowances remain unused.
