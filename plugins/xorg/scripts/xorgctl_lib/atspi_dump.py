#!/usr/bin/python3
# Individual inaccessible AT-SPI nodes must not hide the rest of the tree.
# pylint: disable=broad-exception-caught
import json
import sys
import time

try:
    import gi

    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi
except Exception as exc:  # noqa: BLE001 - GI can raise runtime-specific exceptions.
    sys.stderr.write(f"AT-SPI unavailable: {exc}\n")
    raise SystemExit(1) from None

desktop = Atspi.get_desktop(0)
items: list[dict[str, object]] = []


def walk(node, depth=0, inherited_pid=None) -> None:
    if depth > 8 or len(items) >= 2000:
        return
    try:
        name = node.get_name() or ""
        role = node.get_role_name() or "unknown"
        pid = inherited_pid
        try:
            candidate = int(node.get_process_id())
            if candidate > 0:
                pid = candidate
        except Exception:  # noqa: BLE001 - inaccessible AT-SPI nodes are isolated.
            pass
        item = {"name": name, "role": role, "source": "AT-SPI"}
        if pid is not None:
            item["pid"] = pid
        try:
            states = node.get_state_set()
            item["showing"] = bool(states.contains(Atspi.StateType.SHOWING))
            item["visible"] = bool(states.contains(Atspi.StateType.VISIBLE))
            item["enabled"] = bool(states.contains(Atspi.StateType.ENABLED))
            item["checked"] = bool(states.contains(Atspi.StateType.CHECKED))
            item["selected"] = bool(states.contains(Atspi.StateType.SELECTED))
        except Exception:  # noqa: BLE001 - inaccessible AT-SPI nodes are isolated.
            pass
        try:
            component = node.get_component_iface()
            rect = component.get_extents(Atspi.CoordType.SCREEN)
            item["box"] = [rect.x, rect.y, rect.width, rect.height]
        except Exception:  # noqa: BLE001 - inaccessible AT-SPI nodes are isolated.
            pass
        if name or role not in {"unknown", "invalid"}:
            items.append(item)
        for i in range(node.get_child_count()):
            walk(node.get_child_at_index(i), depth + 1, pid)
    except Exception:  # noqa: BLE001 - one bad subtree must not hide the desktop.
        return


# First access can activate the session accessibility registry. Allow applications
# to register before returning an empty tree.
for _ in range(15):
    items.clear()
    for i in range(desktop.get_child_count()):
        walk(desktop.get_child_at_index(i))
    if any(item["role"] in ("frame", "dialog", "window") for item in items):
        break
    time.sleep(0.1)
sys.stdout.write(json.dumps(items, ensure_ascii=False) + "\n")
