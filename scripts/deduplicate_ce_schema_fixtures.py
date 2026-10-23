"""Store identical CE fixture objects once; expansion preserves the full vendor schemas."""

import collections
import hashlib
import json
from pathlib import Path
from typing import Any, NoReturn

ROOT = Path(__file__).resolve().parents[1] / "plugins/platform/test/fixtures"
PREFIX = "./shared-schema-components.json#/"
MIN_SHARED_OBJECT_BYTES = 60


def canonical(value: Any) -> str:
    """Return stable JSON for exact object identity."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def fail(message: str) -> NoReturn:
    """Reject invalid fixture storage without publishing partial changes."""
    raise ValueError(message)


def main() -> None:
    """Regenerate shared objects without changing expanded fixture documents."""
    shared_path = ROOT / "shared-schema-components.json"
    existing = json.loads(shared_path.read_text()) if shared_path.exists() else {}

    def expand(value: Any, visiting: tuple[str, ...] = ()) -> Any:
        if isinstance(value, list):
            return [expand(item, visiting) for item in value]
        if not isinstance(value, dict):
            return value
        reference = value.get("$ref", "")
        if isinstance(reference, str) and reference.startswith(PREFIX):
            name = reference.removeprefix(PREFIX)
            if len(value) != 1 or name not in existing or name in visiting:
                fail("Invalid, missing or cyclic shared fixture reference")
            if not isinstance(existing[name], dict):
                fail("Shared fixture component must be an object")
            return expand(existing[name], (*visiting, name))
        return {key: expand(item, visiting) for key, item in value.items()}

    documents = {
        path: expand(json.loads(path.read_text()))
        for path in sorted(ROOT.glob("*schema.json"))
    }
    counts: collections.Counter[str] = collections.Counter()
    examples = {}

    def visit(value: Any) -> None:
        if isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            encoded = canonical(value)
            if len(encoded) >= MIN_SHARED_OBJECT_BYTES:
                counts[encoded] += 1
                examples[encoded] = value
            for item in value.values():
                visit(item)

    for document in documents.values():
        visit(document["schemas"])
    selected = {
        key: hashlib.sha256(key.encode()).hexdigest()
        for key, count in counts.items()
        if count > 1
    }
    if len(set(selected.values())) != len(selected):
        fail("Shared fixture digest collision")
    used = set()

    def rewrite(value: Any, *, root: bool = False) -> Any:
        if isinstance(value, list):
            return [rewrite(item) for item in value]
        if not isinstance(value, dict):
            return value
        name = selected.get(canonical(value)) if not root else None
        if name:
            used.add(name)
            return {"$ref": PREFIX + name}
        return {key: rewrite(item) for key, item in value.items()}

    output = {path: rewrite(document) for path, document in documents.items()}
    by_name = {name: key for key, name in selected.items()}
    shared: dict[str, Any] = {}
    while set(shared) != used:
        for name in sorted(used - set(shared)):
            shared[name] = rewrite(examples[by_name[name]], root=True)
    for path, document in output.items():
        path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    shared_path.write_text(
        json.dumps(dict(sorted(shared.items())), indent=2, ensure_ascii=False) + "\n"
    )
    print(f"Stored {len(shared)} shared fixture objects")


if __name__ == "__main__":
    main()
