import csv, ctypes, ctypes.util, io
from PyQt6.QtCore import QBuffer, QIODevice
from PIL import Image
from .common import Fault, ephemeral_artifact, run

def cursor():
    class Cursor(ctypes.Structure):
        _fields_=[('x',ctypes.c_short),('y',ctypes.c_short),('width',ctypes.c_ushort),('height',ctypes.c_ushort),('xhot',ctypes.c_ushort),('yhot',ctypes.c_ushort),('serial',ctypes.c_ulong),('pixels',ctypes.POINTER(ctypes.c_ulong)),('atom',ctypes.c_ulong),('name',ctypes.c_char_p)]
    x=ctypes.CDLL(ctypes.util.find_library('X11')); f=ctypes.CDLL(ctypes.util.find_library('Xfixes'))
    x.XOpenDisplay.argtypes=[ctypes.c_char_p]; x.XOpenDisplay.restype=ctypes.c_void_p
    x.XCloseDisplay.argtypes=[ctypes.c_void_p]; x.XFree.argtypes=[ctypes.c_void_p]
    f.XFixesGetCursorImage.argtypes=[ctypes.c_void_p]; f.XFixesGetCursorImage.restype=ctypes.POINTER(Cursor)
    d=x.XOpenDisplay(None)
    if not d: raise Fault('cannot open display for XFixes cursor')
    ptr=f.XFixesGetCursorImage(d)
    if not ptr: x.XCloseDisplay(d); raise Fault('XFixes cursor unavailable')
    try:
        c=ptr.contents; raw=bytearray()
        for i in range(c.width*c.height):
            argb=c.pixels[i]; a=(argb>>24)&255
            # XFixes returns premultiplied ARGB; PIL expects straight RGBA.
            raw.extend([min(255,((argb>>shift)&255)*255//a) if a else 0 for shift in (16,8,0)]+[a])
        return Image.frombytes('RGBA',(c.width,c.height),bytes(raw)),(c.x-c.xhot,c.y-c.yhot)
    finally: x.XFree(ptr); x.XCloseDisplay(d)

def windows():
    rows=[]
    for line in run(['wmctrl','-lpG']).stdout.decode(errors='replace').splitlines():
        fields=line.split(None,8)
        if len(fields)==9:
            wid,desk,pid,x,y,w,h,host,title=fields
            rows.append(dict(id=int(wid,16),workspace=int(desk),pid=int(pid),x=int(x),y=int(y),width=int(w),height=int(h),title=title))
    return rows

def window(wid):
    for w in windows():
        if w['id']==int(wid): return w
    raise Fault('window ID expired or not managed; list windows and resolve again')

def screenshot(worker,p):
    width,height=worker.input.geometry(); box=p.get('region',[0,0,width,height])
    if 'window' in p:
        w=window(p['window']); box=[w['x'],w['y'],w['width'],w['height']]
    if 'monitor' in p:
        monitors=worker.app.screens(); idx=int(p['monitor'])
        if not 0<=idx<len(monitors): raise Fault('monitor index is not present')
        g=monitors[idx].geometry(); box=[g.x(),g.y(),g.width(),g.height()]
    x,y,w,h=map(int,box)
    if min(x,y)<0 or min(w,h)<1 or x+w>width or y+h>height: raise Fault('capture rectangle outside display; observe geometry again')
    pix=worker.app.primaryScreen().grabWindow(0,x,y,w,h)
    buffer=QBuffer(); buffer.open(QIODevice.OpenModeFlag.WriteOnly); pix.save(buffer,'PNG')
    im=Image.open(io.BytesIO(bytes(buffer.data()))).convert('RGBA')
    if im.size!=(w,h): raise Fault('capture scale differs from display pixels; disable Qt scaling')
    if p.get('cursor',True):
        cur,position=cursor(); im.alpha_composite(cur,(position[0]-x,position[1]-y))
    output=io.BytesIO(); im.save(output,format='PNG')
    return output.getvalue(),{'width':w,'height':h,'origin':[x,y],'display_geometry':[width,height],'coordinate_space':'X11 display pixels','transform':{'scale':[1,1],'offset':[x,y]},'sources':['Qt X11 root capture']+(['XFixes actual cursor'] if p.get('cursor',True) else [])}

def ocr(worker,p):
    data,meta=screenshot(worker,{**p,'cursor':False})
    # Small desktop fonts need magnification; map OCR bounds back to native pixels.
    im=Image.open(io.BytesIO(data)).convert('RGB'); scale=2
    im=im.resize((im.width*scale,im.height*scale),Image.Resampling.LANCZOS)
    mode=int(p.get('psm',11))
    if mode not in (3,6,11,12): raise Fault('OCR psm must be 3, 6, 11, or 12')
    buffer=io.BytesIO(); im.save(buffer,format='PNG')
    raw=ephemeral_artifact(worker,buffer.getvalue(),'png',
        lambda path:worker.command(['tesseract',str(path),'stdout','--psm',str(mode),'tsv'],timeout=30))
    rows=[]; ox,oy=meta['origin']
    for r in csv.DictReader(io.StringIO(raw.decode()),delimiter='\t'):
        if r.get('text','').strip() and float(r['conf'])>=float(p.get('confidence',45)):
            rows.append({'text':r['text'],'confidence':float(r['conf']),'box':[int(r['left'])/scale+ox,int(r['top'])/scale+oy,int(r['width'])/scale,int(r['height'])/scale]})
    return {'source':'Tesseract OCR','coordinate_space':'X11 display pixels','preprocessing_scale':scale,'items':rows,'capture':meta}
