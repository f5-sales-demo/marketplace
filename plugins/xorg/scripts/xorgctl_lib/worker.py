from __future__ import annotations
import base64, hashlib, json, os, pathlib, select, signal, socket, struct, subprocess, threading, time, traceback, uuid
from PyQt6.QtCore import QObject, QTimer, pyqtSignal
from PyQt6.QtWidgets import QApplication
from .common import *
from .clipboard import Clipboard
from .input import Input
from . import observe

class Bridge(QObject):
    request=pyqtSignal(object)

class Worker:
    def __init__(self,c,app):
        self.c=c; self.app=app; self.folder=session_dir(c['name']); private(self.folder/'artifacts')
        self.clip=Clipboard(app); self.input=Input(self); self.cancel=threading.Event(); self.paused=False; self.active=False; self.peer=None
        self.children=[]; self.modules=[]; self.browser_port=None; self.vnc=None
        from .environment import Environment
        self.environment=Environment(self)
        if c.get('display_configuration'):
            self.configure_display(c['display_configuration'],persist=False)
    def check(self):
        if self.cancel.is_set() or self.paused: raise Fault('operation cancelled or paused; observe before resuming')
        if self.peer:
            ready,_,_=select.select([self.peer],[],[],0)
            if ready and not self.peer.recv(1,socket.MSG_PEEK): raise Fault('client disconnected; input released')
    def wait(self,seconds,check=None):
        deadline=time.monotonic()+seconds
        while time.monotonic()<deadline:
            self.app.processEvents(); (check or self.check)(); time.sleep(min(.01,max(0,deadline-time.monotonic())))
    def artifact(self,data,suffix):
        name=uuid.uuid4().hex+'.'+suffix; path=self.folder/'artifacts'/name
        path.write_bytes(data); path.chmod(0o600)
        return {'artifact':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    def command(self,argv,timeout=30,input=None,env=None):
        # Files prevent pipe deadlock; event pumping keeps clipboard ownership responsive.
        import tempfile
        with tempfile.TemporaryFile() as out,tempfile.TemporaryFile() as err,tempfile.TemporaryFile() as src:
            if input: src.write(input); src.seek(0)
            p=subprocess.Popen([str(x) for x in argv],stdin=src,stdout=out,stderr=err,start_new_session=True,env=env)
            try:
                deadline=time.monotonic()+timeout
                while p.poll() is None:
                    if time.monotonic()>deadline: raise Fault(f'{argv[0]} timed out after {timeout}s')
                    self.wait(.02)
                out.seek(0); err.seek(0); stdout=out.read(); stderr=err.read()
                if p.returncode: raise Fault(f'{argv[0]} exited {p.returncode}: '+stderr.decode(errors='replace')[-1500:])
                return stdout
            finally:
                if p.poll() is None:
                    os.killpg(p.pid,signal.SIGTERM)
                    try: p.wait(timeout=3)
                    except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL); p.wait()
    def spawn(self,argv,env=None):
        env=(env or os.environ).copy(); env['QT_LINUX_ACCESSIBILITY_ALWAYS_ON']='1'
        log=(self.folder/'applications.log').open('ab'); os.chmod(log.name,0o600)
        p=subprocess.Popen(argv,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True); self.children.append(p)
        self.wait(.15)
        if p.poll() not in (None,0): raise Fault(f'application exited {p.returncode}; inspect applications.log')
        return p
    def handle(self,item):
        peer,req=item
        if self.active:
            send_packet(peer,{'ok':False,'error':'session busy; cancel or retry after the current operation'}); peer.close(); return
        self.active=True; self.peer=peer; self.cancel.clear()
        try:
            method=req['method']; p=req.get('params',{})
            if self.paused and method not in ('status','screenshot','clipboard.info','window.list','display.info'): raise Fault('human takeover active; use control resume')
            result=self.dispatch(method,p); send_packet(peer,{'ok':True,'result':result})
        except Exception as e:
            try: send_packet(peer,{'ok':False,'error':str(e)})
            except OSError: pass
        finally:
            self.active=False; self.peer=None; peer.close()
    def dispatch(self,m,p):
        if m=='status': return {'version':VERSION,'display':self.c['env']['DISPLAY'],'geometry':self.input.geometry(),'paused':self.paused,'pointer':self.input.pointer(),'clipboard_generation':self.clip.generation,'socket':str(socket_path(self.c['name']))}
        if m=='screenshot':
            data,meta=observe.screenshot(self,p); return {**self.artifact(data,'png'),**meta}
        if m=='inspect.ocr': return observe.ocr(self,p)
        if m=='inspect.accessibility':
            raw=self.command(['/usr/bin/python3',str(pathlib.Path(__file__).with_name('atspi_dump.py'))],timeout=10)
            visible_pids={window['pid'] for window in observe.windows() if window['pid']>0}
            items=[item for item in json.loads(raw) if item.get('pid') in visible_pids]
            return {'source':'AT-SPI','coordinate_space':'X11 display pixels','items':items,
                    'session_pid_filter':sorted(visible_pids),
                    'limitation':'Only AT-SPI applications with an EWMH window PID on the selected Xorg session are visible.'}
        if m=='input.batch': return self.input.execute(p)
        if m=='input.pointer': return self.input.pointer()
        if m=='input.release': self.input.release(); return self.input.pointer()
        if m=='input.layout': return {'xkb':self.command(['setxkbmap','-query']).decode(),'keymap':self.command(['xmodmap','-pke']).decode(),'buttons':list(self.input.d.get_pointer_mapping())}
        if m=='input.secret':
            import keyring
            bus=os.environ.get('DBUS_SESSION_BUS_ADDRESS')
            try:
                os.environ['DBUS_SESSION_BUS_ADDRESS']=f'unix:path=/run/user/{os.getuid()}/bus'
                secret=keyring.get_password(p['service'],p['username'])
            finally:
                if bus is not None: os.environ['DBUS_SESSION_BUS_ADDRESS']=bus
                else: os.environ.pop('DBUS_SESSION_BUS_ADDRESS',None)
            if secret is None: raise Fault('keyring entry not found')
            self.input.execute({**p,'steps':[{'action':'text','text':secret}],'immediate':True}); return {'typed':True}
        if m=='clipboard.transfer-export':
            from .transfer import pack_files
            return self.artifact(pack_files(self.clip.bundle(['CLIPBOARD'])),'zip')
        if m=='clipboard.transfer-import':
            from .transfer import unpack_files
            bundle,files=unpack_files(base64.b64decode(p['data'],validate=True),self.folder/'clipboard-files')
            return {'files_copied':len(files),'clipboard':self.clip.unbundle(bundle)}
        if m=='clipboard.info': return self.clip.info()
        if m=='clipboard.clear': self.clip.restore({p.get('selection','CLIPBOARD'):{}}); return self.clip.info()
        if m=='clipboard.write':
            selection=p.get('selection','CLIPBOARD')
            if 'text' in p: self.clip.set_text(p['text'],selection)
            else: self.clip.restore({selection:{p.get('mime','application/octet-stream'):base64.b64decode(p['data'],validate=True)}})
            return self.clip.info()
        if m=='clipboard.read':
            formats=self.clip.snapshot([p.get('selection','CLIPBOARD')])[p.get('selection','CLIPBOARD')]
            mime=p.get('mime','text/plain')
            if mime not in formats: raise Fault('MIME type unavailable; inspect clipboard info')
            return {**self.artifact(formats[mime],'bin'),'mime':mime}
        if m=='clipboard.snapshot': return self.artifact(self.clip.bundle(p.get('selections')),'zip')
        if m=='clipboard.restore': return self.clip.unbundle(base64.b64decode(p['data'],validate=True))
        if m=='clipboard.watch':
            generation=self.clip.generation; deadline=time.monotonic()+min(float(p.get('seconds',30)),3600)
            while generation==self.clip.generation and time.monotonic()<deadline: self.wait(.05)
            return {'changed':generation!=self.clip.generation,**self.clip.info()}
        if m=='window.list': return {'source':'EWMH','windows':observe.windows(),'focus':self.input.focus()}
        if m=='window.properties':
            w=observe.window(p['window']); return {**w,'properties':self.command(['xprop','-id',str(w['id'])]).decode()}
        if m.startswith('window.'): return self.window(m[7:],p)
        if m=='app.launch':
            argv=p['argv']
            if not isinstance(argv,list) or not argv or not all(isinstance(a,str) for a in argv): raise Fault('argv must be a nonempty string array')
            from .renderer import prepare
            argv,env=prepare(self,argv,p)
            extra=p.get('env',{})
            if not isinstance(extra,dict) or not all(isinstance(k,str) and isinstance(v,str) for k,v in extra.items()): raise Fault('env must map strings to strings')
            if any(k in extra for k in ('DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS')): raise Fault('display and bus environment belong to the selected session')
            env.update(extra)
            if 'audio_sink' in self.c: env['PULSE_SINK']=self.c['audio_sink']
            if 'audio_source' in self.c: env['PULSE_SOURCE']=self.c['audio_source']
            renderer=p.get('renderer','native')
            child=self.spawn(argv,env); return {'pid':child.pid,'renderer_requested':renderer,'rendering_verified':False}
        if m=='app.list': return {'owned_processes':[{'pid':c.pid,'running':c.poll() is None} for c in self.children]}
        if m=='app.close':
            children=[c for c in self.children if c.pid==int(p['pid']) and c.poll() is None]
            if not children: raise Fault('PID is not an active application owned by this worker')
            child=children[0]
            terminate_process_group(child)
            return {'closed':int(p['pid'])}
        if m.startswith('environment.'):
            action=m.split('.',1)[1]
            if action=='ensure': return self.environment.ensure()
            if action=='status': return self.environment.status()
            if action=='restart': return self.environment.restart()
            raise Fault('unknown environment operation')
        if m=='display.info': return {'geometry':self.input.geometry(),'randr':self.command(['xrandr','--current']).decode(),'monitors':self.command(['xrandr','--listmonitors']).decode()}
        if m=='display.configure': return self.configure_display(p,persist=bool(p.get('persist')))
        if m.startswith('gpu.'):
            from .media import gpu
            return gpu(self,m[4:],p)
        if m.startswith('audio.') or m.startswith('record.'):
            from .media import media
            return media(self,m,p)
        if m.startswith('browser.'):
            from .browser import browser
            return browser(self,m[8:],p)
        if m.startswith('view.'): return self.view(m[5:],p)
        raise Fault('unknown method '+m)
    def configure_display(self,p,persist=False):
        argv=['xrandr']
        if 'geometry' in p: argv+=['--fb',p['geometry']]
        if 'output' in p:
            argv+=['--output',p['output']]
            for k,flag in [('mode','--mode'),('rate','--rate'),('scale','--scale'),('position','--pos'),('rotation','--rotate')]:
                if k in p: argv += [flag,str(p[k])]
        if len(argv)==1: raise Fault('provide geometry or output settings')
        self.command(argv); self.wait(.25)
        if persist:
            allowed=('geometry','output','mode','rate','scale','position','rotation')
            self.c['display_configuration']={k:p[k] for k in allowed if k in p}
            save(self.folder/'session.json',self.c)
        return self.dispatch('display.info',{})
    def window(self,action,p):
        wid=str(int(p['window'])); before=observe.window(wid)
        if action=='focus': self.command(['xdotool','windowactivate','--sync',wid])
        elif action in ('move','resize','geometry'):
            x=p.get('x',before['x']); y=p.get('y',before['y']); w=p.get('width',before['width']); h=p.get('height',before['height'])
            self.command(['wmctrl','-ir',wid,'-e',f'0,{x},{y},{w},{h}'])
        elif action=='minimize': self.command(['xdotool','windowminimize',wid])
        elif action in ('maximize','fullscreen','restore'):
            state='fullscreen' if action=='fullscreen' else 'maximized_vert,maximized_horz'
            self.command(['wmctrl','-ir',wid,'-b',('remove' if action=='restore' else 'add')+','+state])
            if action=='restore': self.command(['wmctrl','-ir',wid,'-b','remove,fullscreen,hidden']); self.command(['xdotool','windowmap',wid])
        elif action=='workspace': self.command(['wmctrl','-ir',wid,'-t',str(int(p['workspace']))])
        elif action=='close': self.command(['wmctrl','-ic',wid]); return {'close_requested':int(wid)}
        else: raise Fault('unknown window operation')
        self.wait(.15)
        after=observe.window(wid)
        if action=='focus' and self.input.focus()!=int(wid):
            # Toolkit child windows may own keyboard focus. Active EWMH window is authoritative.
            raw=self.command(['xprop','-root','_NET_ACTIVE_WINDOW']).decode()
            if hex(int(wid)) not in raw: raise Fault('window manager did not activate target')
        return {'before':before,'after':after,'focus':self.input.focus(),'properties':self.command(['xprop','-id',wid,'_NET_WM_STATE']).decode()}
    def view(self,action,p):
        if action=='start':
            if not self.c['owned']:
                return {'display':self.c['env']['DISPLAY'],'port':5900,'existing_console':True,'loopback':True,'tunnel':'ssh -N -L 5900:127.0.0.1:5900 r.mordasiewicz@f5.com','authentication':'existing console password'}
            if self.vnc and self.vnc.poll() is None: return {'port':self.vnc_port,'loopback':True}
            passwd=pathlib.Path(p.get('password_file',pathlib.Path.home()/'.local/state/xorg-console-vnc/passwd'))
            if not passwd.is_file(): raise Fault('provide an existing VNC password_file; no unauthenticated listener is started')
            port=int(p.get('port',5909))
            self.vnc=self.spawn(['x11vnc','-display',self.c['env']['DISPLAY'],'-auth',self.c['env']['XAUTHORITY'],'-localhost','-rfbport',str(port),'-rfbauth',str(passwd),'-forever','-shared','-norepeat','-clear_keys','-skip_dups','-xkb']); self.vnc_port=port
            return {'port':port,'loopback':True,'tunnel':f'ssh -N -L {port}:127.0.0.1:{port} r.mordasiewicz@f5.com'}
        if action=='stop':
            if self.vnc and self.vnc.poll() is None: self.vnc.terminate(); self.vnc.wait(timeout=5)
            return {'stopped_owned_viewer':True,'existing_console_preserved':True}
        raise Fault('unknown view operation')
    def close(self):
        self.input.release()
        for c in reversed(self.children):
            if c.poll() is None:
                try:
                    os.killpg(c.pid,signal.SIGTERM); c.wait(timeout=3)
                except subprocess.TimeoutExpired: os.killpg(c.pid,signal.SIGKILL); c.wait()
                except ProcessLookupError: pass
        for module in self.modules: run(['pactl','unload-module',str(module)],check=False)
        self.c.pop('audio_sink',None); self.c.pop('audio_source',None); save(self.folder/'session.json',self.c)

def serve(c):
    app=QApplication([]); app.setQuitOnLastWindowClosed(False)
    worker=Worker(c,app); bridge=Bridge(); bridge.request.connect(worker.handle)
    path=socket_path(c['name'])
    if path.exists(): path.unlink()
    server=socket.socket(socket.AF_UNIX); server.bind(str(path)); os.chmod(path,0o600); server.listen(8)
    def listen():
        while True:
            try: peer,_=server.accept()
            except OSError: return
            def read(peer):
                try:
                    _,uid,_=struct.unpack('3i',peer.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
                    if uid!=os.getuid(): raise Fault('socket peer is not session owner')
                    peer.settimeout(15); req=recv_packet(peer); peer.settimeout(None)
                    if req['method'].startswith('control.'):
                        a=req['method'].split('.')[1]
                        if a in ('cancel','pause','takeover'): worker.cancel.set()
                        if a in ('pause','takeover'): worker.paused=True
                        if a=='resume': worker.paused=False
                        if a not in ('cancel','pause','takeover','resume'): raise Fault('unknown control action')
                        send_packet(peer,{'ok':True,'result':{'paused':worker.paused,'cancel_requested':worker.cancel.is_set()}}); peer.close()
                    else: bridge.request.emit((peer,req))
                except Exception as e:
                    try: send_packet(peer,{'ok':False,'error':str(e)}); peer.close()
                    except OSError: pass
            threading.Thread(target=read,args=(peer,),daemon=True).start()
    threading.Thread(target=listen,daemon=True).start()
    timer=QTimer()
    def tick():
        if not worker.active and (worker.cancel.is_set() or worker.input.expiry and time.monotonic()>worker.input.expiry): worker.input.release(); worker.input.expiry=0
        if not worker.active:
            try: worker.environment.tick()
            except Exception:
                # A transient supervisor probe must never tear down its X server
                # and every supervised application. Log and retry next tick.
                traceback.print_exc()
    timer.timeout.connect(tick); timer.start(50)
    # Python signals need a live timer to interrupt the Qt event loop.
    def stop(*_): worker.cancel.set(); app.quit()
    signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
    try: app.exec()
    finally: server.close(); worker.close()
