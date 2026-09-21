"""Clipboard archive transfer: materialize referenced regular files before publication."""

import io
import json
import pathlib
import urllib.parse
import uuid
import zipfile

from .common import Fault, private

MAX = 128 * 1024 * 1024


def pack_files(bundle):
    out = io.BytesIO()
    unsupported = []
    total = 0
    with (
        zipfile.ZipFile(io.BytesIO(bundle)) as src,
        zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst,
    ):
        if sum(i.file_size for i in src.infolist()) > MAX:
            msg = "clipboard transfer exceeds 128 MiB"
            raise Fault(msg)
        for item in src.infolist():
            dst.writestr(item.filename, src.read(item.filename))
        manifest = json.loads(src.read("manifest.json"))
        files = {}
        for formats in manifest.values():
            if "text/uri-list" not in formats:
                continue
            for uri in src.read(formats["text/uri-list"]).decode().splitlines():
                if not uri or uri.startswith("#"):
                    continue
                u = urllib.parse.urlparse(uri)
                if u.scheme != "file" or u.netloc not in ("", "localhost"):
                    unsupported.append(uri)
                    continue
                path = pathlib.Path(urllib.parse.unquote(u.path))
                if not path.is_file() or path.is_symlink():
                    unsupported.append(uri)
                    continue
                total += path.stat().st_size
                if total + sum(i.file_size for i in src.infolist()) > MAX:
                    msg = "clipboard plus file attachments exceed 128 MiB"
                    raise Fault(msg)
                member = "files/" + uuid.uuid4().hex + "/" + path.name
                dst.writestr(member, path.read_bytes())
                files[uri] = member
        dst.writestr("files.json", json.dumps(files))
        dst.writestr("unsupported.json", json.dumps(unsupported))
    if unsupported:
        raise Fault(
            "cannot publish untransferred file references: " + ", ".join(unsupported)
        )
    return out.getvalue()


def unpack_files(bundle, root):
    out = io.BytesIO()
    private(root)
    with (
        zipfile.ZipFile(io.BytesIO(bundle)) as src,
        zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst,
    ):
        if sum(i.file_size for i in src.infolist()) > MAX:
            msg = "clipboard transfer exceeds 128 MiB"
            raise Fault(msg)
        files = (
            json.loads(src.read("files.json")) if "files.json" in src.namelist() else {}
        )
        translated = {}
        for uri, member in files.items():
            path = private(root / uuid.uuid4().hex) / pathlib.PurePosixPath(member).name
            path.write_bytes(src.read(member))
            path.chmod(0o600)
            translated[uri] = path.as_uri()
        manifest = json.loads(src.read("manifest.json"))
        uris = {
            formats["text/uri-list"]
            for formats in manifest.values()
            if "text/uri-list" in formats
        }
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename in uris:
                lines = data.decode().splitlines()
                rewritten = []
                for uri in lines:
                    if uri.startswith("file:") and uri not in translated:
                        msg = "file reference was not transferred"
                        raise Fault(msg)
                    rewritten.append(translated.get(uri, uri))
                data = ("\r\n".join(rewritten) + "\r\n").encode()
            dst.writestr(item.filename, data)
    return out.getvalue(), translated
