# ctypes constructors and media dispatch branches are validated by runtime
# probes; Pylint cannot infer their dynamic signatures.
# pylint: disable=broad-exception-caught,import-outside-toplevel,no-value-for-parameter,too-many-branches,too-many-locals,too-many-return-statements,too-many-statements
import base64
import ctypes
import hashlib
import importlib.metadata
import io
import json
import math
import os
import pathlib
import struct
import time
import wave

from .common import Fault, save

PIPER_VERSION = "1.8.0"
PIPER_MODEL_SHA256 = "5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f"
PIPER_CONFIG_SHA256 = "efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0"


def speech_engine():
    """Return validated, pinned Piper assets without exposing generated media."""
    root = pathlib.Path.home() / ".local/share/xorgctl"
    piper = root / "venv/bin/piper"
    model = root / "voices/en_US-lessac-medium.onnx"
    config = root / "voices/en_US-lessac-medium.onnx.json"
    try:
        version = importlib.metadata.version("piper-tts")
    except importlib.metadata.PackageNotFoundError:
        version = None

    def digest(path):
        if not path.is_file():
            return None
        value = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                value.update(chunk)
        return value.hexdigest()

    checks = {
        "runtime": piper.is_file()
        and os.access(piper, os.X_OK)
        and version == PIPER_VERSION,
        "model": digest(model) == PIPER_MODEL_SHA256,
        "config": digest(config) == PIPER_CONFIG_SHA256,
    }
    return {
        "ready": all(checks.values()),
        "checks": checks,
        "version": version,
        "piper": piper,
        "model": model,
    }


def reconcile_persistent_audio(worker) -> None:
    """Recreate plugin-owned endpoints after a session service restart."""
    if worker.c.get("virtual_audio") is True:
        media(worker, "audio.create", {})


def gpu(w, action, p):
    if action == "info":
        result: dict[str, object] = {}
        for name, argv in {
            "nvidia": [
                "nvidia-smi",
                "--query-gpu=index,name,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu",
                "--format=csv,noheader",
            ],
            "glx": ["glxinfo", "-B"],
            "egl": ["eglinfo", "-B"],
            "vulkan": ["vulkaninfo", "--summary"],
            "codecs": ["ffmpeg", "-hide_banner", "-encoders"],
        }.items():
            try:
                result[name] = {
                    "available": True,
                    "output": w.command(argv, timeout=20).decode(errors="replace")[
                        -15000:
                    ],
                }
            except Exception as e:  # Each optional probe is isolated.
                result[name] = {"available": False, "error": str(e)}
        result["isolated_rendering_verified"] = False
        return result
    if action == "probe":
        api = p.get("api", "glx")
        argv = []
        if api == "glx":
            argv = ["glxinfo", "-B"]
        elif api == "egl":
            argv = (
                ["/opt/VirtualGL/bin/eglxinfo", "-B"]
                if p.get("renderer")
                else ["eglinfo", "-B", "-p", "surfaceless"]
            )
        elif api == "vulkan":
            argv = ["vulkaninfo", "--summary"]
        elif api == "cuda":
            # Driver API workload: allocate, upload, execute a PTX kernel, download, compare.
            lib = ctypes.CDLL("libcuda.so.1")
            ptr = ctypes.c_void_p
            u64 = ctypes.c_uint64

            def call(name, *args) -> None:
                code = getattr(lib, name)(*args)
                if code:
                    msg = f"{name} CUDA error {code}"
                    raise Fault(msg)

            call("cuInit", 0)
            dev = ctypes.c_int()
            call("cuDeviceGet", ctypes.byref(dev), int(p.get("device", 0)))
            ctx = ptr()
            call("cuCtxCreate_v2", ctypes.byref(ctx), 0, dev)
            memory = u64()
            module = ptr()
            try:
                call("cuMemAlloc_v2", ctypes.byref(memory), ctypes.c_size_t(4))
                value = ctypes.c_uint32(41)
                call("cuMemcpyHtoD_v2", memory, ctypes.byref(value), ctypes.c_size_t(4))
                ptx = b".version 6.0\n.target sm_52\n.address_size 64\n.visible .entry addone(.param .u64 p) { .reg .b64 %rd; .reg .b32 %r; ld.param.u64 %rd,[p]; ld.global.u32 %r,[%rd]; add.u32 %r,%r,1; st.global.u32 [%rd],%r; ret; }\n"
                call("cuModuleLoadData", ctypes.byref(module), ctypes.c_char_p(ptx))
                kernel = ptr()
                call(
                    "cuModuleGetFunction",
                    ctypes.byref(kernel),
                    module,
                    ctypes.c_char_p(b"addone"),
                )
                args = (ptr * 1)(ctypes.cast(ctypes.byref(memory), ptr))
                call("cuLaunchKernel", kernel, 1, 1, 1, 1, 1, 1, 0, ptr(), args, ptr())
                call("cuCtxSynchronize")
                out = ctypes.c_uint32()
                call("cuMemcpyDtoH_v2", ctypes.byref(out), memory, ctypes.c_size_t(4))
                if out.value != 42:
                    msg = "CUDA output mismatch"
                    raise Fault(msg)
                return {
                    "api": "CUDA Driver API",
                    "executed_kernel": "addone",
                    "input": 41,
                    "output": 42,
                    "passed": True,
                }
            finally:
                if module:
                    lib.cuModuleUnload(module)
                if memory.value:
                    lib.cuMemFree_v2(memory)
                lib.cuCtxDestroy_v2(ctx)
        else:
            msg = "api must be glx, egl, vulkan or cuda"
            raise Fault(msg)
        from .renderer import prepare

        argv, env = prepare(w, argv, p)
        output = w.command(argv, timeout=30, env=env).decode(errors="replace")
        return {
            "api": api,
            "output": output,
            "software_rendering": "llvmpipe" in output.lower()
            or "softpipe" in output.lower(),
            "visible_rendering_verified": False,
        }
    if action == "codec-test":
        codec = p.get("codec", "h264_nvenc")
        if codec not in ("h264_nvenc", "hevc_nvenc", "av1_nvenc"):
            msg = "choose an NVIDIA encoder"
            raise Fault(msg)
        path = w.folder / "artifacts" / ("codec-" + str(time.time_ns()) + ".mkv")
        w.command(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x240:rate=10",
                "-t",
                "1",
                "-c:v",
                codec,
                "-y",
                path,
            ],
            timeout=30,
        )
        w.command(
            [
                "ffmpeg",
                "-v",
                "error",
                "-hwaccel",
                "cuda",
                "-i",
                path,
                "-f",
                "null",
                "-",
            ],
            timeout=30,
        )
        return {
            "encode": codec,
            "decode": "CUDA hardware acceleration",
            "passed": True,
            **w.artifact(path.read_bytes(), "mkv"),
        }
    msg = "unknown GPU operation"
    raise Fault(msg)


def media(w, m, p):
    if m == "audio.devices":
        return {
            kind: json.loads(w.command(["pactl", "--format=json", "list", kind]))
            for kind in ("sinks", "sources", "sink-inputs", "source-outputs")
        }
    if m == "audio.create":
        name = "xorgctl_" + w.c["name"]
        sinks = json.loads(w.command(["pactl", "--format=json", "list", "sinks"]))
        matching_sinks = [x for x in sinks if x["name"] == name]
        # A killed worker can leave a Pulse module behind, while concurrent
        # startup used to create a second null sink before the first appeared.
        # Collapse only this session's duplicate modules before provisioning.
        if matching_sinks and (
            len(matching_sinks) > 1
            or any(
                item.get("description") != "xcsh_Inbound_Audio"
                for item in matching_sinks
            )
        ):
            for item in matching_sinks:
                module = item.get("owner_module")
                if isinstance(module, int) and module != 4294967295:
                    w.command(["pactl", "unload-module", str(module)])
            matching_sinks = []
        module = None
        if not matching_sinks:
            module = int(
                w.command(
                    [
                        "pactl",
                        "load-module",
                        "module-null-sink",
                        f"sink_name={name}",
                        "sink_properties=device.description=xcsh_Inbound_Audio",
                    ]
                ).strip()
            )
            w.modules.append(module)
        for _ in range(100):
            current = json.loads(w.command(["pactl", "--format=json", "list", "sinks"]))
            if sum(x["name"] == name for x in current) == 1:
                break
            w.wait(0.02)
        else:
            msg = f"{name} did not become uniquely available"
            raise Fault(msg)
        w.c["audio_sink"] = name
        injection = "xcsh_microphone"
        current = json.loads(w.command(["pactl", "--format=json", "list", "sinks"]))
        injection_matches = [x for x in current if x["name"] == injection]
        injection_module = None
        if not injection_matches:
            injection_module = int(
                w.command(
                    [
                        "pactl",
                        "load-module",
                        "module-null-sink",
                        f"sink_name={injection}",
                        f"sink_properties=device.description={injection}",
                    ]
                ).strip()
            )
            w.modules.append(injection_module)
        for _ in range(100):
            current = json.loads(w.command(["pactl", "--format=json", "list", "sinks"]))
            if sum(x["name"] == injection for x in current) == 1:
                break
            w.wait(0.02)
        else:
            msg = "xcsh_microphone did not become uniquely available"
            raise Fault(msg)
        w.c["audio_injection_sink"] = injection
        microphone = "xcsh_microphone_input"
        sources = json.loads(w.command(["pactl", "--format=json", "list", "sources"]))
        matching_sources = [x for x in sources if x["name"] == microphone]
        if matching_sources and (
            len(matching_sources) > 1
            or any(x.get("description") != "xcsh Microphone" for x in matching_sources)
        ):
            for item in matching_sources:
                module_id = item.get("owner_module")
                if isinstance(module_id, int) and module_id != 4294967295:
                    w.command(["pactl", "unload-module", str(module_id)])
            matching_sources = []
        microphone_module = None
        if not matching_sources:
            microphone_module = int(
                w.command(
                    [
                        "pactl",
                        "load-module",
                        "module-remap-source",
                        f"master={injection}.monitor",
                        f"source_name={microphone}",
                        "source_properties='device.description=\"xcsh Microphone\"'",
                    ]
                ).strip()
            )
            w.modules.append(microphone_module)
        # Module creation is asynchronous under PipeWire. Do not advertise a
        # device until its exact application-visible name has materialized.
        for _ in range(100):
            current = json.loads(
                w.command(["pactl", "--format=json", "list", "sources"])
            )
            if any(
                x["name"] == microphone and x.get("description") == "xcsh Microphone"
                for x in current
            ):
                break
            w.wait(0.02)
        else:
            msg = "xcsh Microphone did not become available"
            raise Fault(msg)
        w.c["audio_source"] = microphone
        w.c["virtual_audio"] = True
        save(w.folder / "session.json", w.c)
        return {
            "sink": name,
            "injection_sink": injection,
            "source": microphone,
            "module": module,
            "injection_module": injection_module,
            "microphone_module": microphone_module,
        }
    if m in ("audio.volume", "audio.mute"):
        kind = p.get("kind", "sink")
        if kind not in ("sink", "source", "sink-input", "source-output"):
            msg = "invalid audio object kind"
            raise Fault(msg)
        target = str(p.get("target", w.c.get("audio_sink", "")))
        if not target:
            msg = "select an explicit audio target or create session audio"
            raise Fault(msg)
        op = "volume" if m.endswith("volume") else "mute"
        value = str(p["value"])
        w.command(["pactl", f"set-{kind}-{op}", target, value])
        return {"target": target, op: value}
    if m == "audio.route":
        kind = p.get("kind", "sink-input")
        if kind not in ("sink-input", "source-output"):
            msg = "route kind must be sink-input or source-output"
            raise Fault(msg)
        w.command(["pactl", f"move-{kind}", str(int(p["stream"])), p["target"]])
        return {"routed": p["stream"], "target": p["target"]}
    if m == "audio.stimulus":
        # lavfi is deliberately used directly: a UAT stimulus must not leave a
        # media file in the session artifact directory.  The named patterns are
        # finite, reproducible and restricted to the virtual session sink.
        sink = str(
            p.get("target", w.c.get("audio_injection_sink", w.c.get("audio_sink", "")))
        )
        if not sink:
            msg = "audio stimulus requires an explicit virtual sink"
            raise Fault(msg)
        if sink not in (w.c.get("audio_sink"), w.c.get("audio_injection_sink")):
            msg = "audio stimulus target must be a session virtual sink"
            raise Fault(msg)
        kind = str(p.get("kind", "tones"))
        if kind not in ("tones", "speech"):
            msg = "audio stimulus kind must be tones or speech"
            raise Fault(msg)
        token = str(p.get("token", ""))
        if token and (len(token) > 32 or not token.replace("-", "").isalnum()):
            msg = "stimulus token must be a short alphanumeric token"
            raise Fault(msg)
        seconds = float(p.get("seconds", 2.4))
        if not 0.1 <= seconds <= 30:
            msg = "stimulus duration must be .1..30 seconds"
            raise Fault(msg)
        if kind == "speech":
            if not token:
                msg = "speech stimulus requires a generated token"
                raise Fault(msg)
            # Piper produces WAV on stdout; feeding it directly to ffmpeg keeps
            # generated speech and PCM out of the filesystem.
            digits = {
                "0": "zero",
                "1": "one",
                "2": "two",
                "3": "three",
                "4": "four",
                "5": "five",
                "6": "six",
                "7": "seven",
                "8": "eight",
                "9": "nine",
            }
            # The receiver explicitly requested ordinary letters and numbers,
            # not NATO phonetics. Comma pauses make each character distinct.
            spoken = ", ".join(
                "dash" if char == "-" else digits.get(char, char.upper())
                for char in token
            )
            engine = speech_engine()
            if not engine["ready"]:
                msg = "validated Piper speech runtime is unavailable"
                raise Fault(msg)
            phrase = f"{spoken}.\n".encode()
            wav = w.command(
                [
                    str(engine["piper"]),
                    "--model",
                    str(engine["model"]),
                    "--length-scale",
                    "1.08",
                    "--sentence-silence",
                    "0.35",
                    "--output-file",
                    "-",
                ],
                input_data=phrase,
                timeout=30,
            )
            try:
                with wave.open(io.BytesIO(wav), "rb") as stream:
                    rate = stream.getframerate()
                    speech_seconds = stream.getnframes() / rate
            except (EOFError, wave.Error, ZeroDivisionError) as error:
                msg = "speech engine returned invalid WAV"
                raise Fault(msg) from error
            delay_seconds = 0.6
            if seconds < speech_seconds + delay_seconds:
                msg = "speech stimulus duration is too short for generated token"
                raise Fault(msg)
            w.command(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-re",
                    "-i",
                    "pipe:0",
                    "-af",
                    "adelay=600:all=1,volume=1.15,apad=pad_dur=2",
                    "-t",
                    str(seconds),
                    "-f",
                    "pulse",
                    "-device",
                    sink,
                    "xorgctl-uat",
                ],
                input_data=wav,
                timeout=seconds + 15,
            )
            return {
                "stimulus": kind,
                "seconds": seconds,
                "speech_seconds": speech_seconds,
                "sink": sink,
                "complete": True,
                "token_sha256": __import__("hashlib")
                .sha256(token.encode())
                .hexdigest(),
                "retention": "none",
            }
        frequencies = "660|880|990"
        inputs = []
        labels = []
        for index, frequency in enumerate(frequencies.split("|")):
            inputs += [
                "-f",
                "lavfi",
                "-i",
                f"sine=frequency={frequency}:sample_rate=48000:duration={seconds / 3:.3f}",
            ]
            labels.append(f"[{index}:a]")
        graph = "".join(labels) + f"concat=n={len(labels)}:v=0:a=1"
        w.command(
            [
                "ffmpeg",
                "-v",
                "error",
                *inputs,
                "-filter_complex",
                graph,
                "-f",
                "pulse",
                "-device",
                sink,
                "xorgctl-uat",
            ],
            timeout=seconds + 15,
        )
        return {
            "stimulus": kind,
            "seconds": seconds,
            "sink": sink,
            "token_sha256": __import__("hashlib").sha256(token.encode()).hexdigest()
            if token
            else None,
            "retention": "none",
        }
    if m == "audio.measure":
        # PCM arrives through the request and is never written to disk.  This
        # intentionally accepts only signed 16-bit mono samples so thresholds
        # are portable across the UAT fixtures.
        data = p.get("data")
        if not isinstance(data, str):
            msg = "audio measure requires PCM through --input"
            raise Fault(msg)
        raw = base64.b64decode(data, validate=True)
        if len(raw) < 2 or len(raw) % 2:
            msg = "audio measure expects s16le mono PCM"
            raise Fault(msg)
        rate = int(p.get("sample_rate", 48000))
        burst_db = float(p.get("burst_db", -42))
        gap = float(p.get("min_gap_seconds", 0.4))
        if not 8000 <= rate <= 192000 or gap < 0:
            msg = "invalid PCM measurement parameters"
            raise Fault(msg)
        samples = struct.unpack(f"<{len(raw) // 2}h", raw)
        squared = sum(x * x for x in samples) / len(samples)
        rms = math.sqrt(squared) / 32768
        peak = max(abs(x) for x in samples) / 32768

        def db(value):
            return -120.0 if value <= 1e-12 else 20 * math.log10(value)

        window = max(1, rate // 50)
        active = []
        for offset in range(0, len(samples), window):
            chunk = samples[offset : offset + window]
            active.append(
                db(math.sqrt(sum(x * x for x in chunk) / len(chunk)) / 32768)
                >= burst_db
            )
        starts = []
        was = False
        last_end = -(10**9)
        for index, on in enumerate(active):
            if on and not was and index * window - last_end >= gap * rate:
                starts.append(index * window)
            if not on and was:
                last_end = index * window
            was = on
        silent = sum(1 for x in samples if abs(x) < 104) / len(samples)
        return {
            "samples": len(samples),
            "seconds": len(samples) / rate,
            "rms_dbfs": round(db(rms), 3),
            "peak_dbfs": round(db(peak), 3),
            "silence_ratio": round(silent, 6),
            "burst_count": len(starts),
            "retention": "memory_only",
        }
    if m in ("record.start", "audio.capture", "audio.play"):
        seconds = float(p.get("seconds", 5))
        if not 0.1 <= seconds <= 3600:
            msg = "capture/play duration must be .1..3600 seconds"
            raise Fault(msg)
        if m == "audio.play":
            sink = p.get("target", w.c.get("audio_sink"))
            if not sink:
                msg = "create session audio or provide a target sink"
                raise Fault(msg)
            if "data" in p:
                source = (
                    w.folder / "artifacts" / ("play-" + str(time.time_ns()) + ".audio")
                )
                source.write_bytes(base64.b64decode(p["data"], validate=True))
                source.chmod(0o600)
                argv = ["ffmpeg", "-v", "error", "-re", "-i", source]
            else:
                argv = [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-re",
                    "-f",
                    "lavfi",
                    "-i",
                    f"sine=frequency={int(p.get('frequency', 440))}:sample_rate=48000",
                ]
            w.command(
                [*argv, "-t", str(seconds), "-f", "pulse", "-device", sink, "xorgctl"],
                timeout=seconds + 15,
            )
            return {"played_seconds": seconds, "sink": sink}
        suffix = "wav" if m == "audio.capture" else "mkv"
        path = w.folder / "artifacts" / (str(time.time_ns()) + "." + suffix)
        argv = ["ffmpeg", "-v", "error", "-y"]
        if m == "record.start":
            width, height = w.input.geometry()
            codec = p.get("codec", "h264_nvenc")
            if codec not in ("h264_nvenc", "hevc_nvenc", "av1_nvenc", "libx264"):
                msg = "unsupported requested encoder"
                raise Fault(msg)
            argv += [
                "-f",
                "x11grab",
                "-draw_mouse",
                "1" if p.get("cursor", True) else "0",
                "-video_size",
                f"{width}x{height}",
                "-framerate",
                str(int(p.get("fps", 30))),
                "-i",
                w.c["env"]["DISPLAY"],
            ]
            if p.get("audio"):
                source = p.get("source", w.c.get("audio_sink", "") + ".monitor")
                if source == ".monitor":
                    msg = "create session audio or specify source"
                    raise Fault(msg)
                argv += ["-f", "pulse", "-i", source]
            argv += ["-c:v", codec, "-pix_fmt", "yuv420p"]
        else:
            source = p.get("source", w.c.get("audio_sink", "") + ".monitor")
            if source == ".monitor":
                msg = "create session audio or specify source"
                raise Fault(msg)
            argv += ["-f", "pulse", "-i", source]
        w.command([*argv, "-t", str(seconds), path], timeout=seconds + 20)
        metadata = json.loads(
            w.command(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_streams",
                    "-show_format",
                    "-of",
                    "json",
                    path,
                ]
            )
        )
        return {**w.artifact(path.read_bytes(), suffix), "media": metadata}
    msg = "unknown media operation"
    raise Fault(msg)
