from __future__ import annotations
import fcntl, os, pathlib, secrets, shutil, signal, subprocess, sys, time
from .common import *

def environment(c):
    env=os.environ.copy(); env.update(c['env'])
    runtime=pathlib.Path(f'/run/user/{os.getuid()}'); user_bus=runtime/'bus'
    if user_bus.exists():
        env['XDG_RUNTIME_DIR']=str(runtime)
        env['DBUS_SESSION_BUS_ADDRESS']='unix:path='+str(user_bus)
    env['QT_QPA_PLATFORM']='xcb'; env['QT_AUTO_SCREEN_SCALE_FACTOR']='0'; env['QT_SCALE_FACTOR']='1'
    return env

def discover():
    return {'displays':[p.name.replace('X',':',1) for p in pathlib.Path('/tmp/.X11-unix').glob('X*')], 'console_auth_available':pathlib.Path(f'/run/user/{os.getuid()}/gdm/Xauthority').is_file()}

def manage(name, action, p):
    private(ROOT); private(RUNTIME)
    with (ROOT/'.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        return _manage(name,action,p)

def _manage(name, action, p):
    if action=='discover': return discover()
    if action=='list':
        return [{'name':x.parent.name,'display':config(x.parent.name)['env']['DISPLAY'],'running':alive(config(x.parent.name)),'owned_display':config(x.parent.name)['owned']} for x in ROOT.glob('*/session.json')]
    folder=session_dir(name)
    if action in ('create','attach'):
        if folder.exists(): raise Fault('session already exists; use start, restart or another name')
        private(folder)
        try:
            owned=action=='create'
            display=p.get('display')
            if owned:
                display=display or next(':'+str(i) for i in range(120,220) if not pathlib.Path(f'/tmp/.X11-unix/X{i}').exists())
                if not re.fullmatch(r':\d+',display) or pathlib.Path('/tmp/.X11-unix/X'+display[1:]).exists(): raise Fault('requested X display already exists or invalid')
                auth=folder/'Xauthority'; auth.touch(mode=0o600)
                run(['xauth','-f',auth,'add',display,'.',secrets.token_hex(16)])
            else:
                display=display or ':0'
                auth=pathlib.Path(p.get('auth',f'/run/user/{os.getuid()}/gdm/Xauthority'))
                if not auth.is_file(): raise Fault('Xauthority not found; specify --auth')
                run(['xdpyinfo'],env={**os.environ,'DISPLAY':display,'XAUTHORITY':str(auth)})
            geometry=p.get('geometry','1920x1080')
            if not re.fullmatch(r'[1-9]\d{2,4}x[1-9]\d{2,4}',geometry): raise Fault('geometry must be WIDTHxHEIGHT, at least 100x100')
            c=dict(name=name,owned=owned,geometry=geometry,env={'DISPLAY':display,'XAUTHORITY':str(auth)},version=VERSION)
            if not owned: c['env']['DBUS_SESSION_BUS_ADDRESS']=os.environ.get('DBUS_SESSION_BUS_ADDRESS',f'unix:path=/run/user/{os.getuid()}/bus')
            save(folder/'session.json',c)
        except Exception:
            shutil.rmtree(folder); raise
        return start(c)
    c=config(name)
    if action=='status':
        return {**c,'running':alive(c),'worker':rpc(name,'status',{}) if alive(c) else None}
    if action in ('stop','restart','remove'):
        if alive(c):
            os.kill(c['pid'],signal.SIGTERM)
            deadline=time.monotonic()+12
            while alive(c) and time.monotonic()<deadline: time.sleep(.1)
            if alive(c): raise Fault('supervisor did not stop; inspect worker.log before retrying')
        if action=='remove': shutil.rmtree(folder); return {'removed':name}
        if action=='stop': return {'stopped':name,'display_preserved':not c['owned']}
    if action in ('start','restart'):
        if 'geometry' in p:
            if not c['owned']: raise Fault('attached display geometry is managed by RandR, not session restart')
            if not re.fullmatch(r'[1-9]\d{2,4}x[1-9]\d{2,4}',p['geometry']): raise Fault('geometry must be WIDTHxHEIGHT')
            c['geometry']=p['geometry']; save(folder/'session.json',c)
        return start(c)
    raise Fault('unknown session operation')

def start(c):
    if alive(c): return {'name':c['name'],'running':True}
    folder=session_dir(c['name']); entry=pathlib.Path(__file__).parents[1]/'xorgctl'
    log=(folder/'worker.log').open('ab'); os.chmod(log.name,0o600)
    argv=[sys.executable,str(entry),'_supervise',c['name']]
    p=subprocess.Popen(argv,env=environment(c),stdout=log,stderr=log,stdin=subprocess.DEVNULL,start_new_session=True)
    # The supervisor persists its actual PID inside dbus-run-session.
    for _ in range(120):
        if p.poll() is not None: raise Fault(f'session failed to start; inspect {folder}/worker.log')
        try: return {'name':c['name'],'running':True,**rpc(c['name'],'status',{})}
        except (Fault,EOFError): time.sleep(.1)
    p.terminate(); raise Fault(f'worker startup timeout; inspect {folder}/worker.log')

def service(name):
    """Run a configured session in the foreground for a user systemd unit."""
    c=config(name)
    env=environment(c)
    os.environ.clear(); os.environ.update(env)
    supervise(name)

def supervise(name):
    os.umask(0o077)
    c=config(name); folder=session_dir(name); children=[]
    display_lock=(private(RUNTIME)/('display-'+c['env']['DISPLAY'].replace(':','')+'.lock')).open('a')
    try: fcntl.flock(display_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError: raise Fault('another xorgctl worker owns this display; use its named session')
    c.update(pid=os.getpid(),start_ticks=process_identity(os.getpid()))
    c['env']['DBUS_SESSION_BUS_ADDRESS']=os.environ.get('DBUS_SESSION_BUS_ADDRESS','')
    save(folder/'session.json',c)
    def stop(*_): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
    try:
        if c['owned']:
            if pathlib.Path('/tmp/.X11-unix/X'+c['env']['DISPLAY'][1:]).exists(): raise Fault('display claimed by another server; choose a new session')
            x=subprocess.Popen(['Xvfb',c['env']['DISPLAY'],'-screen','0',c['geometry']+'x24','-auth',c['env']['XAUTHORITY'],'-nolisten','tcp','+extension','XTEST','+extension','RANDR','-noreset']); children.append(x)
            for _ in range(100):
                if x.poll() is not None: raise Fault('Xvfb exited')
                if run(['xdpyinfo'],check=False).returncode==0: break
                time.sleep(.05)
            # Isolate the WM from application foreground-process-group signals;
            # systemd still owns and cleans the complete session cgroup.
            children.append(subprocess.Popen(['openbox','--sm-disable'],start_new_session=True))
        # Apply the no-idle contract to attached and owned displays. These are
        # idempotent X server settings and never depend on a desktop shell.
        for command in (['xset','s','off'],['xset','s','noblank'],['xset','-dpms']):
            run(command,check=False)
        from .worker import serve
        serve(c)
    except KeyboardInterrupt: pass
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try: child.wait(timeout=4)
                except subprocess.TimeoutExpired: child.kill(); child.wait()
        try: socket_path(name).unlink()
        except FileNotFoundError: pass
