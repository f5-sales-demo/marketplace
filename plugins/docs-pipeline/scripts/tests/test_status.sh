#!/usr/bin/env bash
# Execute the shipped collector on isolated content fixtures, never start a preview.
set -euo pipefail

test_shipped_status_content_fixtures() {
  python3 - "$PLUGIN_ROOT" <<'PYTHON'
import json, os, pathlib, re, subprocess, sys, tempfile
plugin = pathlib.Path(sys.argv[1])
text = (plugin / 'commands/docs-pipeline-status.md').read_text()
match = re.search(r'## Safe Local Status Collector\n.*?```bash\n(.*?)```', text, re.S)
assert match, 'missing executable status collector'
script = match.group(1)
for shell in ('bash', 'zsh'):
    with tempfile.TemporaryDirectory() as temp:
        root = pathlib.Path(temp)
        def collect():
            result = subprocess.run([shell, '-c', script], cwd=root, text=True, capture_output=True, check=True)
            return json.loads(result.stdout)
        result = collect()
        assert result['completion'] == 'incomplete' and result['contentCount'] == 0
        assert result['checks']['entrypoint'] == 'missing'
        (root / 'docs').mkdir()
        (root / 'docs/index.mdx').write_text('---\ntitle: Fixture\n---\n# Fixture\n')
        result = collect()
        assert result['checks']['entrypoint'] == 'present', result
        assert result['contentCount'] == 1
        assert 'astro' not in result['checks']
        (root / '.github/workflows').mkdir(parents=True)
        (root / '.github/workflows/pages.yml').write_text('jobs:\n  docs:\n    uses: f5-sales-demo/docs-control/.github/workflows/github-pages-deploy.yml@fixture\n')
        (root / '.claude').mkdir()
        (root / '.claude/governance.json').write_text('{broken')
        result = collect()
        assert result['checks']['governance'] == 'malformed' and result['completion'] == 'incomplete'
        (root / '.claude/governance.json').write_text('{}')
        result = collect()
        assert result['completion'] == 'complete' and result['buildExecuted'] is False
        for i in range(20):
            (root / ('docs/long name-%02d.mdx' % i)).write_text('')
        result = collect()
        assert result['contentCount'] == 21 and len(result['contentPreview']) == 12
        assert len(result['remainingContent']) == 9
        assert len(set(result['contentPreview'] + result['remainingContent'])) == 21
        (root / '.claude/governance.json').write_text('false')
        assert collect()['checks']['governance'] == 'malformed'
        (root / '.claude/governance.json').unlink()
        (root / '.claude/governance.json').symlink_to('/etc/passwd')
        assert collect()['checks']['governance'] == 'unsupported-symlink'
PYTHON
}

test_status_preview_effects_are_explicit() {
  grep -qF 'Preview and production builds are separate actions' "$PLUGIN_ROOT/agents/pipeline-operator.md"
  if grep -qF 'For previews, use read-only build commands' "$PLUGIN_ROOT/agents/pipeline-operator.md"; then
    echo 'preview builds incorrectly described as read-only'
    return 1
  fi
}
