---
name: self-awareness
description: >-
  Inspect identity, build, history, or health of an explicitly identified devcontainer. Verify the target container and runtime before reporting its identity; host or assistant identity requests do not select this skill.
user-invocable: false
---

**Canonical skill URI**: `skill://devcontainer:self-awareness`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

# Container Self-Awareness

This skill provides live introspection of the running container by
querying the GitHub API, local build metadata, and runtime state.
Optionally delegate to the container-introspector agent to preserve main context.

## Direct execution and optional delegation

When this skill activates, execute directly; optionally delegate:

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="devcontainer:container-introspector",
  description="[identity/diagnosis/history]: [summarize question in 5 words]",
  prompt="User asked: [user's exact question]\n\nRun the appropriate protocol (identity, genealogy, or self-diagnosis) and return a grounded response with live data."
)
```

Complete the requested operation and verify usable results before responding.
If delegated, review the result and integrate it with independent work.

## Target and inventory

Use only when the request identifies a container. Observe its runtime identity
and executable inventory directly before asserting installed tools, user,
capabilities, or version. A catalog describes expected tools; discrepancies
remain visible. Independent host work continues if the container is unavailable.
