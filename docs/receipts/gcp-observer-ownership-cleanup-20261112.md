# Versioned GCP observer ownership and cleanup

Issue: #1559. Delivery: draft PR #1698.

Observer deployment intent now uses version 2 with its complete explicit scope.
The original 18-resource intent remains version 1; an observer field cannot be
silently added to it. Observer intent requires Terraform configuration version 3
and its own immutable artifact profile. Legacy configuration versions and stored
locks keep their original meaning. Unknown versions and mismatched graph requests
refuse before prerequisite or storage calls.

The reviewed graph contains 18 CE resources plus the observer VM, separately owned
disk and narrow SSH firewall. Ownership uses all 21 exact resource addresses and
creation identities. Observer identities remain separate from CE node and token
joins. State projection checks its one SLI NIC, no service account or forwarding,
expected image, disk, labels, public-key metadata and restricted TCP22 firewall.

Independent cloud reads bind the original observer numeric VM/disk identities to
the live interface/account settings and numeric source image ID. The current
Google Compute v1 discovery document confirms the fields used by this mapping.
Missing, changed or malformed live evidence remains a refusal.

Ownership and typed cleanup receipts use version 3 for observer intents. A partial
observer disk can be independently accounted for and removed without requiring
the VM or CE registration to exist. Tests exercise a full 21-resource destroy and
disk-only recovery, empty final destroy, stable state and two repeats without
another submission. Legacy ownership and cleanup receipt versions are preserved.

This qualifies source dispatch and ownership/cleanup behavior. It does not qualify
managed GCP insertion, positive guest access, complete VPM/container evidence or
live traffic. The CE operational/provider qualification gate remains unchanged;
adding an observer cannot qualify an unproven CE lifecycle mapping. Genuine default
installed capture, ordinary configured-model Ubuntu `bun dev`, full networking and
lifecycle acceptance, review, current-head CI, publication and published installation
remain separate gates.

Historical collectors, failed evidence, unresolved locks and immutable v12.3.1
assets remain preserved.
