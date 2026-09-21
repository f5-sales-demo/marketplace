#!/usr/bin/python3
import json
import time

try:
    import gi
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi
except Exception as exc:
    import sys
    print("AT-SPI unavailable: "+str(exc),file=sys.stderr); raise SystemExit(1)

desktop = Atspi.get_desktop(0)
items = []

def walk(node, depth=0, inherited_pid=None):
    if depth > 8 or len(items) >= 2000: return
    try:
        name = node.get_name() or ""; role = node.get_role_name() or "unknown"
        pid = inherited_pid
        try:
            candidate = int(node.get_process_id())
            if candidate > 0: pid = candidate
        except Exception: pass
        item = {"name": name, "role": role, "source": "AT-SPI"}
        if pid is not None: item["pid"] = pid
        try:
            component = node.get_component_iface(); rect = component.get_extents(Atspi.CoordType.SCREEN)
            item["box"] = [rect.x, rect.y, rect.width, rect.height]
        except Exception: pass
        if name or role not in {"unknown", "invalid"}: items.append(item)
        for i in range(node.get_child_count()): walk(node.get_child_at_index(i), depth+1, pid)
    except Exception: return

# First access can activate the session accessibility registry. Allow applications
# to register before returning an empty tree.
for _ in range(15):
    items.clear()
    for i in range(desktop.get_child_count()): walk(desktop.get_child_at_index(i))
    if any(item['role'] in ('frame','dialog','window') for item in items): break
    time.sleep(.1)
print(json.dumps(items, ensure_ascii=False))
