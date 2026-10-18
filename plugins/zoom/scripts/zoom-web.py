#!/usr/bin/python3
"""Zoom Web substrate; no software installation, physical media or recording."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import urlparse


def status():
    commands = ('google-chrome-stable', 'pactl', 'v4l2-ctl', 'ffmpeg')
    missing = [c for c in commands if not shutil.which(c)]
    camera = Path('/sys/class/video4linux/video42')
    virtual_camera = (camera / 'name').is_file() and (camera / 'name').read_text().strip() == 'xcsh Camera'
    try:
        sources = subprocess.run(['pactl', 'list', 'short', 'sources'], capture_output=True, timeout=5).stdout.decode()
        sinks = subprocess.run(['pactl', 'list', 'short', 'sinks'], capture_output=True, timeout=5).stdout.decode()
    except (OSError, subprocess.TimeoutExpired):
        sources, sinks = '', ''
    camera_format = False
    if virtual_camera:
        try:
            probe = subprocess.run(['v4l2-ctl', '--device=/dev/video42', '--all'],
                                   capture_output=True, text=True, timeout=5)
            camera_format = (probe.returncode == 0 and 'Driver name      : v4l2 loopback' in probe.stdout
                             and bool(re.search(r'Width/Height\s*:\s*1280/720', probe.stdout))
                             and bool(re.search(r'Frames per second:\s*30[.]', probe.stdout)))
        except (OSError, subprocess.TimeoutExpired):
            camera_format = False
    audio = 'xcsh_zoom_microphone' in sources and 'xcsh_zoom_output' in sinks
    return {'backend': 'zoom-web', 'ready': not missing and virtual_camera and camera_format and audio,
            'missing_software': missing, 'virtual_camera': virtual_camera,
            'virtual_camera_device': '/dev/video42', 'camera_format_verified':camera_format, 'virtual_audio': audio,
            'camera_profile': {'width':1280,'height':720,'fps':30},
            'receiver_acceptance': 'pending controlled meeting', 'recording': False}


def invitation(target):
    if re.fullmatch(r'\d{9,11}', target):
        return 'https://app.zoom.us/wc/join/' + target
    parsed = urlparse(target)
    if (parsed.scheme != 'https' or not parsed.hostname
            or not (parsed.hostname == 'zoom.us' or parsed.hostname.endswith('.zoom.us'))
            or parsed.username or parsed.password or parsed.port not in (None,443)):
        raise ValueError('A complete HTTPS Zoom invitation or numeric meeting ID is required')
    if not re.search(r'/(?:j|wc/join)/\d{9,11}(?:/|$)', parsed.path):
        raise ValueError('Unrecognized Zoom invitation path')
    return target


def join(target):
    ready = status()
    if not ready['ready']:
        return {'exitCode':1,'error':'baked_zoom_web_prerequisites_missing','status':ready}
    url = invitation(target)
    runtime = Path(os.environ.get('XDG_RUNTIME_DIR', ''))
    if not runtime.is_absolute() or runtime.stat().st_uid != os.getuid():
        raise ValueError('Owned runtime directory required')
    profile = runtime / 'pi-zoom-web-profile'
    profile.mkdir(mode=0o700,exist_ok=True)
    preferences = profile / 'Default/Preferences'
    preferences.parent.mkdir(mode=0o700,exist_ok=True)
    # Browser profile is private runtime state, excluded from image construction.
    if not preferences.exists():
        preferences.write_text(json.dumps({'media':{'default_audio_capture_device':'xcsh_zoom_microphone',
                                                  'default_audio_render_device':'xcsh_zoom_output'},
                                          'profile':{'default_content_setting_values':{'media_stream_mic':2,'media_stream_camera':2}}}))
        preferences.chmod(0o600)
    # Device enumeration in WebRTC uses opaque IDs. The controlled meeting must
    # select the labeled virtual camera/microphone and verify receiver behavior.
    subprocess.Popen(['google-chrome-stable','--ozone-platform=wayland','--no-first-run',
                      '--no-default-browser-check','--user-data-dir='+str(profile),
                      '--app='+url],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    return {'exitCode':0,'backend':'zoom-web','browser_launched':True,
            'meeting_joined':'pending UI and receiver verification',
            'media_selection':'explicit virtual device selection required','recording':False}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['status','verify','join'])
    parser.add_argument('target',nargs='?')
    parser.add_argument('--json',action='store_true')
    args=parser.parse_args()
    if args.action=='join':
        result=join(args.target or '')
        code=result['exitCode']
    else:
        result=status()
        code=0 if args.action=='status' or result['ready'] else 1
    print(json.dumps(result))
    return code


if __name__=='__main__':
    try:
        raise SystemExit(main())
    except (ValueError,OSError,subprocess.TimeoutExpired):
        print(json.dumps({'exitCode':1,'error':'zoom_web_operation_failed'}))
        raise SystemExit(1)
