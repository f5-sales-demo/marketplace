"""Persistent application supervision for the dedicated browser desktop."""
from __future__ import annotations
import os, pathlib, shutil, time
import subprocess
import stat
from .common import Fault, private
from . import observe
from .media import media

APPLICATIONS = ('chrome', 'ghostty', 'zoom')

class Environment:
    def __init__(self, worker):
        self.w=worker
        self.apps={name:{'process':None,'restarts':0,'next_start':0.0,'last_exit':None} for name in APPLICATIONS}
        self.enabled=worker.c.get('application_profile')=='zoom-browser'
        self.last_tick=0.0; self.last_accessibility_check=0.0

    def bootstrap(self):
        """Clone Zoom authentication once without returning or logging profile data."""
        target=self.w.folder/'zoom-home'
        marker=target/'.bootstrapped'
        if marker.exists(): return
        if target.exists(): shutil.rmtree(target)
        private(target)
        source=pathlib.Path.home()
        def copy_regular_tree(src,dst):
            dst.mkdir(parents=True,exist_ok=True,mode=0o700)
            for item in src.iterdir():
                try: mode=item.lstat().st_mode
                except FileNotFoundError: continue
                if item.name in ('logs','SingletonLock','SingletonCookie','SingletonSocket') or item.name.endswith(('.log','.lock')): continue
                if stat.S_ISDIR(mode): copy_regular_tree(item,dst/item.name)
                elif stat.S_ISREG(mode): shutil.copy2(item,dst/item.name)
        for relative in ('.zoom', '.config/zoom.conf', '.config/zoomus.conf'):
            src=source/relative; dst=target/relative
            if not src.exists(): continue
            dst.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            if src.is_dir(): copy_regular_tree(src,dst)
            else: shutil.copy2(src,dst)
        for item in target.rglob('*'):
            try: item.chmod(0o700 if item.is_dir() else 0o600)
            except FileNotFoundError: pass
        marker.write_text('profile copied locally; contents are never returned by xorgctl\n'); marker.chmod(0o600)

    def _chrome(self):
        from .browser import browser
        result=browser(self.w,'launch',{'profile':'automation','url':'about:blank'})
        return next(c for c in self.w.children if c.pid==result['pid'])

    def _ensure_accessibility(self):
        socket_path=pathlib.Path(f'/run/user/{os.getuid()}/at-spi/bus_0')
        now=time.monotonic()
        if socket_path.is_socket() and now-self.last_accessibility_check<30: return
        if not socket_path.is_socket():
            self.w.command(['systemctl','--user','restart','at-spi-dbus-bus.service'])
        self.w.command(['gdbus','call','--session','--dest','org.a11y.Bus','--object-path','/org/a11y/bus',
                        '--method','org.a11y.Bus.GetAddress'])
        deadline=time.monotonic()+3
        while not socket_path.is_socket() and time.monotonic()<deadline: self.w.wait(.05)
        if not socket_path.is_socket(): raise Fault('AT-SPI accessibility bus did not expose its socket')
        self.last_accessibility_check=now

    def _spawn(self,name):
        env=os.environ.copy()
        if 'audio_sink' in self.w.c: env['PULSE_SINK']=self.w.c['audio_sink']
        if name=='chrome': return self._chrome()
        if name=='ghostty':
            env.update(GDK_BACKEND='x11',GSK_RENDERER='gl')
            return self.w.spawn(['/snap/bin/ghostty','--class=xorgctl-ghostty'],env)
        if name=='zoom':
            self.bootstrap(); home=self.w.folder/'zoom-home'
            env.update(HOME=str(home),XDG_CONFIG_HOME=str(home/'.config'),PULSE_SOURCE=self.w.c.get('audio_source','xcsh_microphone_input'))
            return self.w.spawn(['/usr/bin/zoom'],env)
        raise Fault('unknown managed application')

    def ensure(self):
        if self.w.c['name']!='desktop': raise Fault('zoom-browser environment is restricted to the desktop session')
        self.enabled=True; self.w.c['application_profile']='zoom-browser'
        if not self.w.c.get('audio_sink') or not self.w.c.get('audio_source') or not self.w.c.get('audio_injection_sink'):
            media(self.w,'audio.create',{})
        self._ensure_accessibility()
        self.bootstrap()
        now=time.monotonic()
        for name,state in self.apps.items():
            process=state['process']
            if process and process.poll() is None: continue
            if now < state['next_start']: continue
            if process:
                state['last_exit']=process.returncode; state['restarts']+=1
            try:
                state['process']=self._spawn(name)
                state['next_start']=now+min(30,2**min(state['restarts'],5))
            except Exception as exc:
                state['last_exit']=str(exc); state['restarts']+=1
                state['next_start']=now+min(30,2**min(state['restarts'],5))
        from .common import save
        save(self.w.folder/'session.json',self.w.c)
        return self.status()

    def tick(self):
        now=time.monotonic()
        if self.enabled and now-self.last_tick>=1:
            self.last_tick=now; self.ensure()

    def _descendants(self,pid):
        found={pid}; changed=True
        while changed:
            changed=False
            for entry in pathlib.Path('/proc').glob('[0-9]*'):
                try: ppid=int((entry/'stat').read_text().split(') ',1)[1].split()[1])
                # /proc entries can disappear between glob and read for any
                # short-lived process; ProcessLookupError is distinct from
                # FileNotFoundError on some procfs paths.
                except (OSError,ValueError,IndexError): continue
                if ppid in found and int(entry.name) not in found: found.add(int(entry.name)); changed=True
        return found

    def status(self):
        windows=observe.windows(); result={}
        for name,state in self.apps.items():
            process=state['process']; running=bool(process and process.poll() is None)
            pids=self._descendants(process.pid) if running else set()
            owned=[x for x in windows if x['pid'] in pids]
            result[name]={'pid':process.pid if running else None,'running':running,'healthy':running and bool(owned),
                          'windows':owned,'restart_count':state['restarts'],'last_exit':state['last_exit']}
        return {'profile':'zoom-browser','enabled':self.enabled,'healthy':all(x['healthy'] for x in result.values()),
                'audio_sink':self.w.c.get('audio_sink'),'applications':result}

    def restart(self):
        for state in self.apps.values():
            process=state['process']
            if process and process.poll() is None:
                try: os.killpg(process.pid,15); process.wait(timeout=5)
                except (ProcessLookupError,subprocess.TimeoutExpired): pass
            state.update(process=None,next_start=0.0)
        return self.ensure()
