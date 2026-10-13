import sys,os,glob; sys.path.insert(0,os.path.dirname(__file__)); import nds,pak
from PIL import Image
OUT='.'
EXT={b'RGCN':'NCGR',b'RLCN':'NCLR',b'RECN':'NCER',b'RNAN':'NANR',b'RCSN':'NSCR'}
def ext(b): return EXT.get(b[:4],'bin')
def tilepix(g,start,i):
    # pixel i of tile `start` (in 8x8 tiles)
    k=start*64+i; return g['px'][k] if k<len(g['px']) else 0
def render_cell(objs,g,pal,mapping):
    if not objs: return None
    x0=min(o['x'] for o in objs); y0=min(o['y'] for o in objs)
    x1=max(o['x']+o['w'] for o in objs); y1=max(o['y']+o['h'] for o in objs)
    im=Image.new('RGBA',(x1-x0,y1-y0),(0,0,0,0)); P=im.load()
    bnd=32<<((mapping>>20)&3) if mapping else 32
    for o in reversed(objs):
        bpp8=g['bd']==4
        tstart=o['tile']*bnd//(64 if bpp8 else 32)
        tw=o['w']//8
        for ty in range(o['h']//8):
            for tx in range(tw):
                t=tstart+ty*tw+tx
                for py in range(8):
                    for px in range(8):
                        v=tilepix(g,t,py*8+px)
                        if v==0: continue
                        ci=v if bpp8 else o['pal']*16+v
                        if ci>=len(pal): continue
                        X=tx*8+px; Y=ty*8+py
                        if o['hf']: X=o['w']-1-X
                        if o['vf']: Y=o['h']-1-Y
                        P[o['x']-x0+X,o['y']-y0+Y]=pal[ci]+(255,)
    return im
def render_bg(g,pal,scr=None):
    bpp8=g['bd']==4; tiles=len(g['px'])//64
    if scr:
        _,s=nds.sections(scr)['SCRN']; import struct
        w,h,_,ds=struct.unpack_from('<HHII',s,8); m=s[0x14:0x14+ds]
        im=Image.new('RGBA',(w,h)); P=im.load(); tw=w//8
        for n in range(min(len(m)//2,tw*(h//8))):
            e=m[2*n]|m[2*n+1]<<8; t=e&0x3ff; hf=e>>10&1; vf=e>>11&1; pl=e>>12
            for py in range(8):
                for px in range(8):
                    v=tilepix(g,t,py*8+px); ci=v if bpp8 else pl*16+v
                    c=pal[ci] if ci<len(pal) else (0,0,0)
                    X=7-px if hf else px; Y=7-py if vf else py
                    P[(n%tw)*8+X,(n//tw)*8+Y]=c+(255,)
        return im
    tw=g['w'] if g['w'] not in (0xffff,0) and g['w']<=64 else 16
    th=(tiles+tw-1)//tw; im=Image.new('RGBA',(tw*8,th*8),(0,0,0,0)); P=im.load()
    for t in range(tiles):
        for i in range(64):
            v=g['px'][t*64+i]
            if v and v<len(pal): P[(t%tw)*8+i%8,(t//tw)*8+i//8]=pal[v]+(255,)
    return im
def sheet(imgs,path):
    imgs=[i for i in imgs if i]
    if not imgs: return
    cw=max(i.width for i in imgs); ch=max(i.height for i in imgs); cols=min(8,len(imgs))
    s=Image.new('RGBA',(cw*cols,ch*((len(imgs)+cols-1)//cols)))
    for k,i in enumerate(imgs): s.paste(i,((k%cols)*cw,(k//cols)*ch))
    s.save(path)
def do_cells(name,g,c,e,pal):
    cells,mp=nds.ncer(e); d=f'{OUT}/sprites/{name}'; os.makedirs(d,exist_ok=True); ims=[]
    for k,objs in enumerate(cells):
        try: im=render_cell(objs,g,pal,mp)
        except Exception as ex: im=None
        if im: im.save(f'{d}/cell_{k:03}.png'); ims.append(im)
    sheet(ims,f'{d}/_sheet.png')
if __name__=='__main__':
    FS,OUT=sys.argv[1],sys.argv[2]
    log=open(f'{OUT}/extract_log.txt','w')
    # 1. raw PAK dump
    paks={}
    for p in sorted(glob.glob(f'{FS}/**/*.PAK',recursive=True)):
        nm=os.path.basename(p)[:-4]; d=open(p,'rb').read(); out=[]
        os.makedirs(f'{OUT}/raw/{nm}',exist_ok=True)
        for i,o,s,f in pak.entries(d):
            b=nds.maybe(d[o:o+s]); out.append(b)
            open(f'{OUT}/raw/{nm}/{i:04}.{ext(b)}','wb').write(b)
        paks[nm]=out; print(nm,len(out),file=log)
    # 2. SPR_* parallel sets
    S=paks.get('SPR_CHR',[])
    for i in range(len(S)):
        try: do_cells(f'field/{i:04}',nds.ncgr(S[i]),None,paks['SPR_CEL'][i],nds.nclr(paks['SPR_PAL'][i])[0])
        except Exception as ex: print('SPR',i,ex,file=log)
    # 3. sequential groups (BTCHR, MCHR*, others)
    for nm,lst in paks.items():
        if nm.startswith('SPR_') : continue
        g=pal=None; k=0
        for i,b in enumerate(lst):
            try:
                e=ext(b)
                if e=='NCGR': g=nds.ncgr(b)
                elif e=='NCLR': pal=nds.nclr(b)[0]
                elif e=='NCER' and g and pal: do_cells(f'{nm.lower()}/{i:04}',g,None,b,pal)
            except Exception as ex: print(nm,i,ex,file=log)
    # 4. loose NCGR files (backgrounds)
    for p in sorted(glob.glob(f'{FS}/**/*.NCGR',recursive=True)):
        base=p[:-5]; rel=os.path.relpath(base,FS)
        try:
            g=nds.ncgr(nds.maybe(open(p,'rb').read()))
            cl=base+'.NCLR'
            if not os.path.exists(cl): cl=(glob.glob(os.path.dirname(p)+'/*.NCLR') or [None])[0]
            pal=nds.nclr(nds.maybe(open(cl,'rb').read()))[0] if cl else [(i*16,)*3 for i in range(256)]
            scr=nds.maybe(open(base+'.NSCR','rb').read()) if os.path.exists(base+'.NSCR') else None
            os.makedirs(os.path.dirname(f'{OUT}/backgrounds/{rel}'),exist_ok=True)
            render_bg(g,pal,scr).save(f'{OUT}/backgrounds/{rel}.png')
        except Exception as ex: print(p,ex,file=log)
    