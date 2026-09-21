import os, pathlib, shutil
from .common import Fault, run

def prepare(worker,argv,p):
    env=os.environ.copy(); renderer=p.get('renderer','native')
    if renderer=='native': return argv,env
    if renderer not in ('egl','glx'): raise Fault('renderer must be native, egl or glx')
    device=p.get('device','egl0' if renderer=='egl' else ':0')
    if renderer=='glx':
        authority=pathlib.Path(p.get('gpu_auth',f'/run/user/{os.getuid()}/gdm/Xauthority'))
        if not authority.is_file(): raise Fault('GLX GPU authority unavailable; specify gpu_auth or use EGL backend')
        combined=worker.folder/'GPU-Xauthority'; shutil.copyfile(worker.c['env']['XAUTHORITY'],combined); combined.chmod(0o600)
        records=run(['xauth','-f',authority,'extract','-',device]).stdout
        if not records: raise Fault('no authentication record for the requested GLX GPU display')
        run(['xauth','-f',combined,'merge','-'],input=records)
        env['XAUTHORITY']=str(combined)
    return ['/opt/VirtualGL/bin/vglrun','-d',device,*argv],env
