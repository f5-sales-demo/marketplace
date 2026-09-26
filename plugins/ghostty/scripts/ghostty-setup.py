#!/usr/bin/env python3
"""Convergent Ghostty setup; never launches Ghostty or changes Xorg."""
from __future__ import annotations
import hashlib,json,os,pathlib,platform,re,shutil,stat,subprocess,sys,tempfile,urllib.request
from datetime import datetime,timezone
V='1.0.0'; MIN=(1,3,1); BEGIN='# xcsh ghostty advisory recommendations'; END='# end xcsh ghostty advisory recommendations'
REC={'font-family':'JetBrainsMono Nerd Font','font-size':'9','window-padding-x':'14','window-padding-y':'14','gtk-single-instance':'false','cursor-style':'block','mouse-reporting':'true','scrollback-limit':'10000000','clipboard-read':'allow','clipboard-write':'allow','working-directory':'inherit','shell-integration':'detect','keybind:insert':'copy_to_clipboard','keybind:shift+insert':'paste_from_clipboard','keybind:shift+enter':'text:\\x1b[13;2u','keybind:alt+shift+enter':'text:\\x1b[13;4u','palette:0':'#1d1f21','palette:1':'#cc6666','background':'#1d1f21','foreground':'#c5c8c6'}
def paths():
 h=pathlib.Path.home(); c=pathlib.Path(os.getenv('XCSH_GHOSTTY_CONFIG',h/'.config/ghostty/config')); return c,pathlib.Path(os.getenv('XDG_STATE_HOME',h/'.local/state'))/'xcsh/ghostty/setup-receipt.json'
def key(line):
 a,s,b=line.partition('=');a=a.strip();b=b.strip()
 if not s or a.startswith('#'):return None
 if a=='palette':return 'palette:'+b.partition('=')[0].strip()
 if a=='keybind':return 'keybind:'+b.partition('=')[0].strip().lower()
 return a
def graph(path,seen=None):
 seen=set() if seen is None else seen;path=path.resolve()
 if path in seen or not path.exists():return set(),[]
 seen.add(path);ks=set();fs=[path]
 for line in path.read_text().splitlines():
  k=key(line);ks.add(k) if k else None
  if k=='config-file':
   v=line.partition('=')[2].strip().strip('"\'');p=pathlib.Path(v);ck,cf=graph(p if p.is_absolute() else path.parent/p,seen);ks|=ck;fs+=cf
 return ks,fs
def valid(path,exe='ghostty'):
 e=shutil.which(exe);return not e or subprocess.run([e,'+validate-config','--config-file='+str(path)],capture_output=True).returncode==0
def merge(c,exe='ghostty'):
 c.parent.mkdir(parents=True,exist_ok=True,mode=0o700);old=c.read_text() if c.exists() else ''
 if c.exists() and not valid(c,exe):raise RuntimeError('existing_config_invalid')
 ks,_=graph(c);missing={k:v for k,v in REC.items() if k not in ks}
 if not missing:return {},False
 lines=[BEGIN]+[('palette = '+k[8:]+'='+v if k.startswith('palette:') else 'keybind = '+k[8:]+'='+v if k.startswith('keybind:') else k+' = '+v) for k,v in missing.items()]+[END];candidate=(old.rstrip()+'\n\n' if old.strip() else '')+'\n'.join(lines)+'\n'
 with tempfile.NamedTemporaryFile('w',dir=c.parent,delete=False) as f:f.write(candidate);t=pathlib.Path(f.name)
 try:
  if not valid(t,exe):raise RuntimeError('candidate_config_invalid')
  if c.exists():shutil.copy2(c,c.with_name(c.name+'.xcsh-backup'));os.chmod(c.with_name(c.name+'.xcsh-backup'),0o600)
  os.chmod(t,stat.S_IMODE(c.stat().st_mode) if c.exists() else 0o600);os.replace(t,c)
 finally:t.unlink(missing_ok=True)
 return missing,True
def run(a,check=True):
 r=subprocess.run(a,text=True,capture_output=True)
 if check and r.returncode:raise RuntimeError('command_failed:'+a[0])
 return r
def installed():
 e=shutil.which('ghostty')
 if not e:return None
 t=run([e,'+version'],False).stdout;m=re.search(r'(\d+)\.(\d+)\.(\d+)',t);return e,tuple(map(int,m.groups())) if m else None
def install():
 p=run(['apt-cache','policy','ghostty'],False).stdout
 if 'Candidate:' in p and 'Candidate: (none)' not in p:run(['sudo','-n','apt-get','update']);run(['sudo','-n','apt-get','install','-y','ghostty']);return 'apt',None
 arch={'x86_64':'amd64','aarch64':'arm64'}.get(platform.machine())
 if arch:
  try:
   rel=json.load(urllib.request.urlopen('https://api.github.com/repos/mkasberg/ghostty-ubuntu/releases/latest',timeout=20));a={x['name']:x for x in rel['assets']};name=next(n for n in a if re.fullmatch('ghostty_.*_'+arch+'\\.deb',n));check=name+'.sha256';assert check in a;d=pathlib.Path(tempfile.mkdtemp());deb=d/name;urllib.request.urlretrieve(a[name]['browser_download_url'],deb);want=urllib.request.urlopen(a[check]['browser_download_url']).read().decode().split()[0];got=hashlib.sha256(deb.read_bytes()).hexdigest();assert re.fullmatch('[0-9a-fA-F]{64}',want) and got.lower()==want.lower();run(['sudo','-n','apt-get','install','-y',str(deb)]);return 'github_deb',got
  except (OSError,KeyError,StopIteration,AssertionError,ValueError):pass
 run(['sudo','-n','snap','install','ghostty','--channel=latest/stable']);return 'snap',None
def apply():
 if sys.platform!='linux' or 'ID=ubuntu' not in pathlib.Path('/etc/os-release').read_text():raise RuntimeError('unsupported_platform')
 cur=installed();src,digest='existing',None
 if cur and (not cur[1] or cur[1]<MIN):raise RuntimeError('incompatible_existing_installation')
 if not cur:src,digest=install();cur=installed()
 if not cur or not cur[1] or cur[1]<MIN:raise RuntimeError('ghostty_installation_unverified')
 c,r=paths();off,_=merge(c,cur[0]);r.parent.mkdir(parents=True,exist_ok=True,mode=0o700);v={'schema_version':1,'plugin_version':V,'state':'ready','executable':cur[0],'version':'.'.join(map(str,cur[1])),'source':src,'package_digest':digest,'config_sha256':hashlib.sha256(c.read_bytes()).hexdigest(),'configuration':{'result':'advisory_only','offered_keys':sorted(off)},'installed_at':datetime.now(timezone.utc).isoformat()};t=r.with_suffix('.tmp');t.write_text(json.dumps(v,sort_keys=True)+'\n');os.chmod(t,0o600);os.replace(t,r);os.chmod(r,0o600);return v
def main():
 try:
  action=sys.argv[1];c,r=paths();v=apply() if action=='apply' else json.loads(r.read_text()) if r.exists() else {'state':'setup_required','reason':'receipt_missing'}
  if action=='verify' and v['state']!='ready':raise RuntimeError('receipt_missing')
  print(json.dumps(v));return 0
 except Exception as e:print(json.dumps({'state':'setup_required','reason':str(e)}));return 1
if __name__=='__main__':raise SystemExit(main())
