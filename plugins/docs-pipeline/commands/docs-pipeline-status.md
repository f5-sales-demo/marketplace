---
description: Inspect content, shared docs workflow and governance readiness without building
---

# Documentation pipeline status

Delegate to the `docs-pipeline:pipeline-operator` agent to inspect the caller's
repository. Use the collector below from that repository's root. Report the
resolved scope first; inspect only that scope. If delegation is unavailable,
report that limitation and use the same collector directly when authorized.

A content repository receives Astro configuration and dependencies from the
shared docs-theme/docs-builder pipeline. Do not require local `astro.config.*`
or an Astro dependency in `package.json` to recognize it.

## Safe Local Status Collector

This exact Bash/Zsh-compatible command reads local files using Python 3. It
starts no service, runs no build, fetches nothing and writes no repository files.
Missing Python 3 means inspection is unavailable; do not infer readiness.

```bash
python3 - <<'PYTHON'
import json
from pathlib import Path

root = Path.cwd().resolve()
checks = {}
warnings = []
content = []

def note(key, state, guidance):
    checks[key] = state
    if state != 'present':
        warnings.append(guidance)

try:
    docs = root / 'docs'
    if docs.is_symlink():
        note('content', 'unsupported-symlink', 'Inspect the docs symlink target separately with explicit scope.')
    elif not docs.is_dir():
        note('content', 'missing', 'Add documentation content under docs/ through the content workflow.')
    else:
        note('content', 'present', '')
        for item in sorted(docs.rglob('*')):
            if item.suffix in ('.md', '.mdx'):
                if item.is_symlink() or not item.resolve().is_relative_to(docs.resolve()):
                    warnings.append('Skipped content outside the repository docs scope: ' + str(item.relative_to(root)))
                elif item.is_file():
                    content.append(str(item.relative_to(root)))
        entrypoint = any(path in content for path in ('docs/index.md', 'docs/index.mdx'))
        note('entrypoint', 'present' if entrypoint else 'missing', 'Provide docs/index.md or docs/index.mdx and validate its frontmatter separately.')
except OSError:
    note('content', 'unreadable', 'Restore read access to docs/ and repeat the inspection.')
checks.setdefault('entrypoint', 'missing')

try:
    workflow_root = root / '.github/workflows'
    if workflow_root.is_symlink() or (root / '.github').is_symlink():
        note('workflow', 'unsupported-symlink', 'Inspect the workflow symlink target separately with explicit scope.')
    else:
        workflows = sorted(list(workflow_root.glob('*.yml')) + list(workflow_root.glob('*.yaml')))
        shared = any(not path.is_symlink() and 'f5-sales-demo/docs-control/.github/workflows/github-pages-deploy.yml@' in path.read_text() for path in workflows)
        note('workflow', 'present' if shared else 'missing', 'Review the shared Pages workflow through docs-control; do not create local Astro configuration.')
except (OSError, UnicodeError):
    note('workflow', 'unreadable', 'Restore read access to workflow files and repeat the inspection.')

try:
    governance = root / '.claude/governance.json'
    if governance.is_symlink() or governance.parent.is_symlink():
        note('governance', 'unsupported-symlink', 'Inspect the governance symlink target separately with explicit scope.')
    elif not governance.exists():
        note('governance', 'missing', 'Review governance enrollment through docs-control before changing managed files.')
    else:
        data = json.loads(governance.read_text())
        if not isinstance(data, dict):
            raise ValueError('Governance must be a JSON object')
        note('governance', 'present', '')
except (ValueError, UnicodeError):
    note('governance', 'malformed', 'Repair malformed governance through docs-control and repeat the inspection.')
except OSError:
    note('governance', 'unreadable', 'Restore read access to governance and repeat the inspection.')

print(json.dumps({
    'plugin': 'docs-pipeline',
    'scope': str(root),
    'completion': 'complete' if all(state == 'present' for state in checks.values()) and not warnings else 'incomplete',
    'checks': checks,
    'contentCount': len(content),
    'contentPreview': content[:12],
    'remainingContent': content[12:],
    'warnings': warnings,
    'buildExecuted': False,
    'configurationValidated': False,
    'previewStarted': False,
}, indent=2))
PYTHON
```

## Result presentation

Show repository scope, inspection completion, the independent content,
entrypoint, shared-workflow and governance states, content count and warnings
first. Show twelve content paths by default; retain remaining paths once in
expanded evidence. Preserve zero counts, false flags, empty lists and literal
corrective guidance. A complete inspection means these local indicators were
found. It does not validate YAML semantics, frontmatter, governance rules, a
build, publication or the running service. An unreadable, missing or malformed
indicator makes the inspection incomplete; do not report a clean build.

List `/docs-pipeline:preview-docs` as the available preview action. Starting it
is a separate service action. Do not run it during status inspection.
