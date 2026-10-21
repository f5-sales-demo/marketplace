---
description: Inspect local sales engineering workflow prerequisites without preparing a demo
---

# Sales engineering status

Run the collector below from the caller's repository root. This status request
authorizes local file metadata inspection only. Do not delegate to housekeeping,
read credentials, run Prepare or Teardown, or infer live demo readiness.

## Safe Local Status Collector

This exact Bash/Zsh command reads file metadata without opening file contents,
writing files, inspecting environment values or executing external service tools.

```bash
python3 - <<'PY'
import json
from pathlib import Path
import stat

root = Path.cwd().resolve()
required = ["DEMO_READINESS_MATRIX.md", "DEMO_PRODUCT_EXPERTISE.md", "docs/demo/index.mdx"]
references = []
warnings = []
for name in required:
    path = root / name
    state = "unknown"
    try:
        parts = [root.joinpath(*Path(name).parts[:i]) for i in range(1, len(Path(name).parts) + 1)]
        if any(p.is_symlink() for p in parts):
            state = "indirect"
        else:
            metadata = path.stat()
            state = "available" if stat.S_ISREG(metadata.st_mode) and metadata.st_size > 0 else "empty" if stat.S_ISREG(metadata.st_mode) else "not_file"
    except FileNotFoundError:
        state = "missing"
    except OSError:
        state = "unavailable"
    references.append({"path": name, "state": state, "contentValidated": False})
    if state != "available":
        warnings.append(f"{name}: {state}; provide a nonempty regular file at the scoped path before readiness verification.")
available = sum(item["state"] == "available" for item in references)
print(json.dumps({
    "scope": str(root),
    "complete": available == len(required),
    "requiredFileCount": len(required),
    "availableRequiredFileCount": available,
    "demoReady": None,
    "operationalChecksExecuted": 0,
    "prepareExecuted": False,
    "teardownExecuted": False,
    "personas": ["demo-executor", "presenter", "subject-matter-expert"],
    "workflows": ["demo-ops", "demo-executor"],
    "references": references,
    "warnings": warnings,
    "nextAction": "Review the scoped readiness matrix before requesting separately authorized operational verification."
}, sort_keys=True))
PY
```

## Result presentation

Lead with scope, completion, required and available file counts, warnings and
next action. Collection completeness means metadata availability; file contents,
tools, credentials and services remain unverified. Preserve zero, false, empty
strings and unknown values. Show at most twelve findings initially and include
remaining evidence once with literal corrective guidance. A missing or invalid
prerequisite must not produce a READY conclusion. Do not print credentials or
resolved environment values. Keep proposed operational work separate from observed
status. Persona and workflow availability describes shipped guidance.
