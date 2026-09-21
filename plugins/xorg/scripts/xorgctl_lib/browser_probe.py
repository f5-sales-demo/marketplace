import json, sys
from playwright.sync_api import sync_playwright
r=json.load(sys.stdin)
with sync_playwright() as p:
    browser=p.chromium.connect_over_cdp(f'http://127.0.0.1:{r["port"]}')
    try:
        page=browser.contexts[0].pages[-1]
        metrics=page.evaluate('({x:screenX+(outerWidth-innerWidth)/2,y:screenY+(outerHeight-innerHeight),scale:devicePixelRatio})')
        # Native Chrome frame translation is approximate, especially under custom decorations.
        # Explicitly refuse non-unit scaling instead of quietly sending incorrect coordinates.
        if metrics['scale']!=1: raise RuntimeError('browser devicePixelRatio is not 1; use screenshot coordinates or reset browser scaling')
        meta={'source':'Chrome DOM via loopback CDP','transform':metrics,'coordinate_space':'X11 display pixels','frame_offset':'estimated from Chrome outer/inner dimensions; verify target with screenshot'}
        if r['action']=='navigate':
            page.goto(r['params']['url'],wait_until='domcontentloaded')
            print(json.dumps({**meta,'url':page.url,'title':page.title()}))
        elif r['action']=='snapshot':
            items=page.locator('body *').evaluate_all('''(els)=>els.slice(0,2000).map((e)=>{const r=e.getBoundingClientRect();return {tag:e.tagName,role:e.getAttribute('role'),name:e.getAttribute('aria-label')||e.innerText||'',value:e.type==='password'?null:e.value,box:{x:r.x,y:r.y,width:r.width,height:r.height}}}).filter(x=>x.box.width&&x.box.height&&(x.name||x.value||x.tag==='INPUT'))''')
            for e in items: e['box']['x']+=metrics['x']; e['box']['y']+=metrics['y']
            print(json.dumps({**meta,'url':page.url,'title':page.title(),'elements':items}))
        elif r['action'] in ('locate','activate'):
            locator=page.locator(r['params']['selector'])
            if 'text' in r['params']: locator=locator.filter(has_text=r['params']['text'])
            if locator.count()!=1: raise RuntimeError('selector must resolve to exactly one target')
            box=locator.bounding_box()
            if not box: raise RuntimeError('target is not visible')
            box['x']+=metrics['x']; box['y']+=metrics['y']; print(json.dumps({**meta,'box':box}))
        elif r['action']=='font-report':
            probe=browser.contexts[0].new_page()
            try:
                probe.set_content('''<!doctype html><meta charset="utf-8"><style>
                  p { font-size: 32px; }
                  #standard { font-family: "Times New Roman"; }
                  #serif { font-family: serif; }
                  #sans { font-family: sans-serif; }
                  #fixed { font-family: monospace; }
                  #system { font-family: system-ui; }
                </style><p id="standard">Windows font rendering 012345</p>
                <p id="serif">Windows font rendering 012345</p>
                <p id="sans">Windows font rendering 012345</p>
                <p id="fixed">Windows font rendering 012345</p>
                <p id="system">Windows font rendering 012345</p>''')
                cdp=probe.context.new_cdp_session(probe); cdp.send('DOM.enable'); cdp.send('CSS.enable')
                root=cdp.send('DOM.getDocument')['root']['nodeId']; fonts={}
                for name in ('standard','serif','sans','fixed','system'):
                    node=cdp.send('DOM.querySelector',{'nodeId':root,'selector':'#'+name})['nodeId']
                    rows=cdp.send('CSS.getPlatformFontsForNode',{'nodeId':node})['fonts']
                    fonts[name]=[{'family':x['familyName'],'glyphs':x['glyphCount']} for x in rows]
                print(json.dumps({**meta,'fonts':fonts,'retention':'font_names_and_glyph_counts_only'}))
            finally: probe.close()
        else: raise RuntimeError('unknown browser operation')
    finally: browser.close()
