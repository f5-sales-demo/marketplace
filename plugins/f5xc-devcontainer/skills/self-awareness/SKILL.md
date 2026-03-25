---
name: self-awareness
description: >-
  Container identity and self-diagnosis. Activates when asked who you are,
  what version, where you come from, your build info, self-diagnosis, health
  check, container history, recent changes, contributors, or any existential
  question about identity, origin, or container state.
user-invocable: false
---

# Container Self-Awareness

This skill provides live introspection of the running container by
querying the GitHub API, local build metadata, and runtime state.
Delegate to the container-introspector agent to preserve main context.

## Delegation Protocol

When this skill activates, delegate immediately:

```
Agent(
  subagent_type="f5xc-devcontainer:container-introspector",
  description="[identity/diagnosis/history]: [summarize question in 5 words]",
  prompt="User asked: [user's exact question]\n\nRun the appropriate protocol (identity, genealogy, or self-diagnosis) and return a grounded response with live data."
)
```

Wait for the agent's response and relay it directly to the user.

## When to activate

- "who are you" / "what are you" / "where do you come from"
- "what version" / "when were you born" / "what build"
- "self-diagnosis" / "health check" / "self-test"
- "what changed recently" / "show me the Git log"
- "who built this" / "who are the contributors"
- "what's your source" / "show me your blueprint"
- Any existential or introspective question about the container
