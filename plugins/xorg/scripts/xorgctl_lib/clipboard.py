import hashlib
import io
import json
import zipfile

from PyQt6.QtCore import QMimeData
from PyQt6.QtGui import QClipboard

from .common import Fault

MODES = {"CLIPBOARD": QClipboard.Mode.Clipboard, "PRIMARY": QClipboard.Mode.Selection}
MAX_BYTES = 128 * 1024 * 1024


class Clipboard:
    def __init__(self, app) -> None:
        self.cb = app.clipboard()
        self.generation = 0
        self.cb.changed.connect(self.changed)

    def changed(self, *_) -> None:
        self.generation += 1

    def snapshot(self, selections=None):
        result = {}
        total = 0
        for name in selections or MODES:
            if name not in MODES:
                msg = "selection must be CLIPBOARD or PRIMARY"
                raise Fault(msg)
            md = self.cb.mimeData(MODES[name])
            formats = {}
            if md:
                for fmt in md.formats():
                    data = bytes(md.data(fmt))
                    total += len(data)
                    if total > MAX_BYTES:
                        msg = "clipboard exceeds 128 MiB"
                        raise Fault(msg)
                    formats[fmt] = data
            result[name] = formats
        return result

    def restore(self, data) -> None:
        for name, formats in data.items():
            if name not in MODES:
                msg = "invalid selection"
                raise Fault(msg)
            md = QMimeData()
            for fmt, value in formats.items():
                md.setData(fmt, value)
            self.cb.setMimeData(md, MODES[name])

    def set_text(self, text, selection="CLIPBOARD") -> None:
        self.restore(
            {
                selection: {
                    "text/plain": text.encode(),
                    "text/plain;charset=utf-8": text.encode(),
                }
            }
        )

    def info(self):
        return {
            "generation": self.generation,
            "selections": {
                k: {
                    "formats": {
                        f: {"bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}
                        for f, b in v.items()
                    },
                    "owned": self.cb.ownsClipboard()
                    if k == "CLIPBOARD"
                    else self.cb.ownsSelection(),
                }
                for k, v in self.snapshot().items()
            },
        }

    def bundle(self, selections=None):
        out = io.BytesIO()
        manifest: dict[str, dict[str, str]] = {}
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for name, formats in self.snapshot(selections).items():
                manifest[name] = {}
                for fmt, data in formats.items():
                    key = f"payload/{len(z.namelist())}"
                    z.writestr(key, data)
                    manifest[name][fmt] = key
            z.writestr("manifest.json", json.dumps(manifest))
        return out.getvalue()

    def unbundle(self, data):
        result = {}
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if sum(i.file_size for i in z.infolist()) > MAX_BYTES:
                msg = "uncompressed clipboard exceeds 128 MiB"
                raise Fault(msg)
            manifest = json.loads(z.read("manifest.json"))
            for name, formats in manifest.items():
                result[name] = {fmt: z.read(key) for fmt, key in formats.items()}
        self.restore(result)
        return self.info()
