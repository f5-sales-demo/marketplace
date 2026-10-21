---
description: Check shipped F5 brand reference availability without auditing or changing content
---

# Brand status

Delegate to `brand:brand-operator` to inspect the installed plugin's references.
If delegation is unavailable, run the collector below directly. Resolve this
plugin's installed directory from the command's source path; use that physical
directory as the working directory. Do not assume references are in the caller's
repository. No authentication, fetch, service startup or file writes are needed.

## Safe Local Reference Collector

Run this exact Bash/Zsh-compatible command from the resolved Brand plugin root:

```bash
python3 - <<'PY'
import json
from pathlib import Path
import re

root = Path.cwd().resolve()
warnings = []
references = []
texts = {}
paths = [
    'skills/guardian/references/color-palette.md',
    'skills/guardian/references/typography-rules.md',
    'skills/guardian/references/logo-usage.md',
    'skills/guardian/references/accessibility.md',
    'commands/review-brand.md',
]
for relative in paths:
    path = root / relative
    try:
        if any(part.is_symlink() for part in [path, *path.parents] if part != root):
            raise ValueError('symlink reference is unsupported')
        text = path.read_text(encoding='utf-8')
        if not text.strip():
            raise ValueError('empty reference')
        texts[relative] = text
        state = 'readable'
    except (OSError, UnicodeError, ValueError) as error:
        state = 'unavailable'
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        warnings.append(relative + ': ' + reason)
    references.append({'path': relative, 'state': state})

palette_count = None
families = None
palette = texts.get(paths[0])
if palette is not None:
    section = re.search(r'^## Complete 45-color palette\n(.*?)(?=^## |\Z)', palette, re.M | re.S)
    rows = re.findall(r'^\| (?:Base|[1-4]) \| `#[0-9a-fA-F]{3,6}` \| `--f5-[a-z0-9-]+` \|', section[1], re.M) if section else []
    if len(rows) == 45:
        palette_count = len(rows)
    else:
        warnings.append(paths[0] + ': expected 45 declared palette rows; observed ' + str(len(rows)))
        references[0]['state'] = 'malformed'
typography = texts.get(paths[1])
if typography is not None:
    section = re.search(r'^## Font families\n(.*?)(?=^## |\Z)', typography, re.M | re.S)
    found = re.findall(r'^### (.+)$', section[1], re.M) if section else []
    if found == ['Neusa Next Pro Wide', 'Proxima Nova']:
        families = found
    else:
        warnings.append(paths[1] + ': font family declarations are incomplete or malformed')
        references[1]['state'] = 'malformed'
print(json.dumps({
    'scope': str(root),
    'complete': not warnings,
    'referenceCount': len(references),
    'readableReferenceCount': sum(item['state'] == 'readable' for item in references),
    'paletteColorCount': palette_count,
    'fontFamilies': families,
    'reviewExecuted': False,
    'assetAvailabilityVerified': False,
    'references': references,
    'warnings': warnings,
}, ensure_ascii=False))
PY
```

## Present the result

Lead with plugin identity, inspected scope, completion, reference counts,
palette color count, declared font families and warnings. Use a readable table
with Path and State columns for the five reference checks. Preserve zero, false,
empty strings and unknown (`null`) values. Keep literal corrective guidance.
A missing, empty, unreadable, symlinked or malformed reference means incomplete
inspection; report its exact next action: reconcile the installed reference
with the published plugin. Do not reinstall automatically.

Reference readability does not prove font installation, logo availability or
content compliance. `reviewExecuted: false` and
`assetAvailabilityVerified: false` must remain visible. Report
`/brand:review-brand` as the available content-review command. For longer
results, show twelve rows initially and the remaining rows once on expansion;
provide complete safe evidence once. Let xcsh own framing, commands, themes,
symbols and progress. No progress timer is needed for these local reads.
