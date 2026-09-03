Retrieve bounded, read-only Azure Activity Log evidence for exactly one resource group or exact resource.

The default window is the retention-safe relative offset `89d`, the default status is `succeeded`, and the
default operation family is `write`. Results contain only allowlisted normalized fields, UTC coverage,
truncation state, and conservative caller evidence. Claims, request/response bodies, tokens, arbitrary
properties, network identifiers, raw events, and continuation data are never returned.

Caller evidence identifies who was associated with an observed operation; it is historical provenance,
not ownership. A generic create-or-update write is ambiguous. Empty output means only that no matching event
was observed in the returned coverage. Use this tool, never generic `az_exec` or a synthesized absolute start
date, for Customer Edge Activity Log attribution.
