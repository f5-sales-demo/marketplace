"""Browser semantics are evidence; all activating input remains visible XTEST input."""
import json, os, pathlib, socket, sys
from .common import Fault

CHROME_WINDOWS_FONTS = {
    'standard': 'Times New Roman',
    'serif': 'Times New Roman',
    'sansserif': 'Arial',
    # Chromium bypasses Fontconfig's generic substitution for this preference:
    # an unavailable Consolas falls back to Times New Roman. Name the installed
    # Omarchy monospace family directly so fixed text remains monospace.
    'fixed': 'JetBrainsMono Nerd Font',
}

def profile_lock_is_live(profile,lock,hostname=None,proc_root=pathlib.Path('/proc')):
    """Return whether Chrome's lock names a process that owns this profile."""
    if not lock.is_symlink(): return lock.exists()
    target=os.readlink(lock); machine,separator,pid=target.rpartition('-')
    if not separator or machine!=(hostname or socket.gethostname()) or not pid.isdigit(): return True
    process=proc_root/pid
    if not process.exists(): return False
    try: arguments=(process/'cmdline').read_bytes().split(b'\0')
    except OSError: return True
    expected=('--user-data-dir='+str(profile)).encode()
    return expected in arguments

def configure_chrome_fonts(profile):
    """Set the dedicated Chrome profile to Windows-compatible Latin defaults."""
    path=profile/'Default'/'Preferences'
    path.parent.mkdir(parents=True,exist_ok=True)
    try: preferences=json.loads(path.read_text()) if path.exists() else {}
    except json.JSONDecodeError as exc: raise Fault('Chrome preferences are not valid JSON') from exc
    webprefs=preferences.setdefault('webkit',{}).setdefault('webprefs',{})
    fonts=webprefs.setdefault('fonts',{})
    for category,family in CHROME_WINDOWS_FONTS.items():
        fonts.setdefault(category,{})['Zyyy']=family
    webprefs['default_font_size']=16
    webprefs['default_fixed_font_size']=13
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(preferences,separators=(',',':'),sort_keys=True))
    temporary.chmod(0o600); temporary.replace(path)
    return {'preferences':str(path),'fonts':dict(CHROME_WINDOWS_FONTS)}

def browser(w,action,p):
    if action=='launch':
        mode=p.get('profile','automation'); profile=w.folder/'browser-profile'
        if mode=='default':
            profile=pathlib.Path.home()/'.config/google-chrome'
            if (profile/'SingletonLock').is_symlink() or (profile/'SingletonLock').exists(): raise Fault('real Chrome profile is already owned; close it before launching')
            flags=[]
        elif mode=='automation':
            s=socket.socket(); s.bind(('127.0.0.1',0)); port=s.getsockname()[1]; s.close()
            flags=[f'--remote-debugging-port={port}','--remote-debugging-address=127.0.0.1']; w.browser_port=port
            configure_chrome_fonts(profile)
        else: raise Fault('profile must be automation or default')
        lock=profile/'SingletonLock'
        if profile_lock_is_live(profile,lock):
            raise Fault('browser profile already owned; use existing browser or another session')
        # Let Chrome perform its own normal stale-lock handling; never delete profile locks here.
        child=w.spawn(['google-chrome',f'--user-data-dir={profile}','--profile-directory=Default',*flags,
                       '--no-first-run','--no-default-browser-check','--hide-crash-restore-bubble',
                       '--disable-session-crashed-bubble','--disable-default-apps','--start-maximized',p.get('url','about:blank')])
        return {'pid':child.pid,'profile':mode,'cdp_port':w.browser_port if mode=='automation' else None}
    if not w.browser_port: raise Fault('semantic observation requires this session automation browser; launch it first')
    request={'port':w.browser_port,'action':action,'params':p}
    data=json.loads(w.command([sys.executable,str(pathlib.Path(__file__).with_name('browser_probe.py'))],input=json.dumps(request).encode(),timeout=20))
    if action=='activate':
        box=data['box']; wid=p.get('window')
        if wid: w.window('focus',{'window':wid})
        result=w.input.execute({'steps':[{'action':'click','x':round(box['x']+box['width']/2),'y':round(box['y']+box['height']/2)}]})
        return {'target':data,'input':result,'verify':'take a fresh browser snapshot or screenshot'}
    return data
