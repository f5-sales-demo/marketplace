import os
import pathlib
import shutil

from .common import Fault, run


def prepare(worker, argv, p):
    env = os.environ.copy()
    renderer = p.get("renderer", "native")
    if renderer == "native":
        return argv, env
    if renderer not in ("egl", "glx"):
        msg = "renderer must be native, egl or glx"
        raise Fault(msg)
    device = p.get("device", "egl0" if renderer == "egl" else ":0")
    if renderer == "glx":
        authority = pathlib.Path(
            p.get("gpu_auth", f"/run/user/{os.getuid()}/gdm/Xauthority")
        )
        if not authority.is_file():
            msg = "GLX GPU authority unavailable; specify gpu_auth or use EGL backend"
            raise Fault(msg)
        combined = worker.folder / "GPU-Xauthority"
        shutil.copyfile(worker.c["env"]["XAUTHORITY"], combined)
        combined.chmod(0o600)
        records = run(["xauth", "-f", authority, "extract", "-", device]).stdout
        if not records:
            msg = "no authentication record for the requested GLX GPU display"
            raise Fault(msg)
        run(["xauth", "-f", combined, "merge", "-"], input=records)
        env["XAUTHORITY"] = str(combined)
    return ["/opt/VirtualGL/bin/vglrun", "-d", device, *argv], env
