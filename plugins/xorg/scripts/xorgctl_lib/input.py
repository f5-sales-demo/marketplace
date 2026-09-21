"""XTEST input, with minimum-jerk trajectory adapted from Linux Computer Use."""
import math, random, time, uuid
from Xlib import X, XK, display
from Xlib.ext import xtest
from .common import Fault

def trajectory(start,end,seed,steps=None):
    sx,sy=start; ex,ey=end; distance=math.hypot(ex-sx,ey-sy)
    count=steps or max(3,min(90,int(distance/12)+3)); rng=random.Random(seed)
    bend=rng.uniform(-1,1)*min(28.,distance*.08); norm=max(distance,1.)
    points=[]
    for i in range(1,count+1):
        t=i/count; eased=10*t**3-15*t**4+6*t**5; arc=4*t*(1-t)*bend
        points.append((round(sx+(ex-sx)*eased-(ey-sy)/norm*arc),round(sy+(ey-sy)*eased+(ex-sx)/norm*arc)))
    points[-1]=end; return points

class Input:
    def __init__(self,worker):
        self.w=worker; self.d=display.Display(); self.keys=set(); self.buttons=set(); self.expiry=0; self.lease=None
    def pointer(self):
        p=self.d.screen().root.query_pointer()
        return {'x':p.root_x,'y':p.root_y,'mask':p.mask,'owned_keys':sorted(self.keys),'owned_buttons':sorted(self.buttons)}
    def geometry(self):
        g=self.d.screen().root.get_geometry(); return [g.width,g.height]
    def focus(self):
        f=self.d.get_input_focus().focus; return f.id if hasattr(f,'id') else f
    def emit(self,typ,detail=0,**kw):
        xtest.fake_input(self.d,typ,detail,**kw); self.d.sync()
    def release(self):
        self.lease=None; self.expiry=0
        for b in list(self.buttons): self.emit(X.ButtonRelease,b); self.buttons.discard(b)
        for k in list(self.keys): self.emit(X.KeyRelease,k); self.keys.discard(k)
    def code(self,key):
        if isinstance(key,int):
            if not 8<=key<=255: raise Fault('X keycode must be 8..255')
            return key
        for group in ('xf86','latin1','xkb','miscellany'):
            try: XK.load_keysym_group(group)
            except ImportError: pass
        sym=XK.string_to_keysym(key)
        if not sym and key.startswith('XF86') and not key.startswith('XF86_'):
            sym=XK.string_to_keysym('XF86_'+key[4:])
        code=self.d.keysym_to_keycode(sym)
        if not code: raise Fault(f'keysym {key!r} is not mapped; inspect input layout')
        return code
    def key(self,key,down):
        c=self.code(key)
        if down:
            if c not in self.keys:
                bitmap=self.d.query_keymap()
                if bitmap[c//8] & (1<<(c%8)): raise Fault('key already held by another input owner')
            self.keys.add(c); self.emit(X.KeyPress,c)
        elif c in self.keys: self.emit(X.KeyRelease,c); self.keys.remove(c)
        else: raise Fault('cannot release a key not owned by xorgctl')
    def button(self,b,down):
        b={'left':1,'middle':2,'right':3}.get(b,b); b=int(b)
        if not 1<=b<=len(self.d.get_pointer_mapping()): raise Fault('button outside X11 pointer mapping')
        if down:
            if b<=5 and b not in self.buttons and self.pointer()['mask'] & (1<<(7+b)): raise Fault('button already held by another owner')
            self.buttons.add(b); self.emit(X.ButtonPress,b)
        elif b in self.buttons: self.emit(X.ButtonRelease,b); self.buttons.remove(b)
        else: raise Fault('cannot release a button not owned by xorgctl')
    def execute(self,p):
        if (self.keys or self.buttons) and self.lease and p.get('owner')!=self.lease:
            raise Fault('held input belongs to another operation; supply its owner lease or explicitly cancel/release it')
        steps=p.get('steps',[])
        if not isinstance(steps,list) or len(steps)>10000: raise Fault('steps must be an array of at most 10000 actions')
        rng=random.Random(p.get('seed')); instant=p.get('immediate',False)
        geo=self.geometry(); expected=p.get('geometry',geo)
        if expected!=geo: raise Fault(f'geometry changed: expected {expected}, current {geo}; observe again')
        focus=p.get('window',self.focus())
        if self.focus()!=focus: raise Fault('focus changed; focus the target then observe again')
        def check():
            self.w.check()
            if self.geometry()!=geo: raise Fault('geometry changed during input; observe again')
            if not p.get('allow_focus_change') and self.focus()!=focus: raise Fault('focus changed during input; observe again')
        def wait(sec): self.w.wait(sec,check)
        def move(x,y):
            if not isinstance(x,int) or not isinstance(y,int) or not(0<=x<geo[0] and 0<=y<geo[1]): raise Fault('point outside current display; observe again')
            old=self.pointer(); start=(old['x'],old['y']); path=[(x,y)] if instant else trajectory(start,(x,y),rng.getrandbits(64))
            delay=min(.85,max(.10,.08+math.dist(start,(x,y))/1700))/len(path)
            for px,py in path:
                check(); self.emit(X.MotionNotify,x=max(0,min(geo[0]-1,px)),y=max(0,min(geo[1]-1,py)))
                if not instant: wait(delay)
        try:
            for s in steps:
                check(); a=s['action']
                if a in ('move','relative','hover'):
                    old=self.pointer(); move(int(s['x'])+(old['x'] if a=='relative' else 0),int(s['y'])+(old['y'] if a=='relative' else 0))
                    if a=='hover': wait(min(float(s.get('seconds',.5)),60))
                elif a in ('down','up'): self.key(s['key'],a=='down')
                elif a in ('button-down','button-up'): self.button(s.get('button',1),a=='button-down')
                elif a in ('key','chord'):
                    keys=s.get('keys',[s.get('key')]); repeat=int(s.get('repeat',1))
                    if not 1<=repeat<=1000: raise Fault('repeat must be 1..1000')
                    for _ in range(repeat):
                        fresh=[k for k in keys if self.code(k) not in self.keys]
                        for key in fresh: self.key(key,True)
                        wait(0 if instant else rng.uniform(.025,.095))
                        for key in reversed(fresh): self.key(key,False)
                        if not instant: wait(.04)
                elif a in ('click','drag'):
                    if 'x' in s: move(int(s['x']),int(s['y']))
                    count=int(s.get('count',1)); b=s.get('button',1)
                    if not 1<=count<=100: raise Fault('click count must be 1..100')
                    for _ in range(count):
                        self.button(b,True); wait(0 if instant else rng.uniform(.045,.12))
                        if a=='drag': move(int(s['to_x']),int(s['to_y']))
                        self.button(b,False)
                        if not instant: wait(.08)
                elif a=='scroll':
                    amount=int(s.get('amount',1))
                    if abs(amount)>1000: raise Fault('scroll amount exceeds 1000')
                    b=(6 if amount>0 else 7) if s.get('horizontal') else (4 if amount>0 else 5)
                    for _ in range(abs(amount)):
                        check(); self.button(b,True); self.button(b,False)
                        if not instant: wait(.04)
                elif a=='wait': wait(min(max(float(s['seconds']),0),60))
                elif a=='text':
                    text=s['text']
                    if self.keys or self.buttons: raise Fault('release held input before typing text')
                    old=self.w.clip.snapshot(['CLIPBOARD'])
                    def paste(value):
                        self.w.clip.set_text(value); wait(.05)
                        for key in ('Control_L','v'): self.key(key,True)
                        wait(.03)
                        for key in ('v','Control_L'): self.key(key,False)
                        # Process X selection requests while the target consumes this payload.
                        wait(.6)
                    try:
                        if instant: paste(text)
                        else:
                            i=0
                            while i<len(text):
                                check(); ch=text[i]
                                if ch.isascii():
                                    sym=XK.string_to_keysym({'\n':'Return','\t':'Tab'}.get(ch,ch)) or ord(ch)
                                    mappings=[(code,level) for code,level in self.d.keysym_to_keycodes(sym) if level in (0,1)]
                                else: mappings=[]
                                if mappings:
                                    code,level=mappings[0]
                                    if level: self.key('Shift_L',True)
                                    self.key(code,True); wait(rng.uniform(.025,.05)); self.key(code,False)
                                    if level: self.key('Shift_L',False)
                                    wait(rng.uniform(.025,.095)); i+=1
                                else:
                                    end=i+1
                                    while end<len(text) and not text[end].isascii(): end+=1
                                    paste(text[i:end]); i=end
                                if ch in '.,;:!?\n': wait(rng.uniform(.05,.18))
                    finally: self.w.clip.restore(old)
                else: raise Fault('unknown input action '+a)
            if p.get('retain'):
                ttl=float(p.get('ttl',15))
                if not 0<ttl<=30: raise Fault('held-input lease must be 0..30 seconds')
                self.expiry=time.monotonic()+ttl
                self.lease=self.lease or uuid.uuid4().hex
            else: self.release()
            return {'pointer':self.pointer(),'geometry':geo,'focus':self.focus(),'seed':p.get('seed'),'steps':len(steps),'owner':self.lease,'lease_seconds':max(0,self.expiry-time.monotonic())}
        except BaseException:
            self.release(); raise
