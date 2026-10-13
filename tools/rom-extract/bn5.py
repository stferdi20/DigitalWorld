import sys,os,glob,re
sys.path.insert(0,os.path.dirname(__file__)); import nds, extract
from PIL import Image
FS,OUT=sys.argv[1],sys.argv[2]; extract.OUT=OUT
log=open(f'{OUT}/bn5_log.txt','w')
def load(p): return nds.maybe(open(p,'rb').read())
# 1. decompress every file; Nitro magic -> proper extension
for p in glob.glob(f'{FS}/**/*',recursive=True):
    if not os.path.isfile(p): continue
    b=load(p); rel=os.path.relpath(p,FS); e=extract.EXT.get(b[:4]) or {b'BMD0':'nsbmd',b'BTX0':'nsbtx',b'BCA0':'nsbca'}.get(b[:4],None)
    dst=f'{OUT}/raw/{rel}'+('.'+e if e else '')
    os.makedirs(os.path.dirname(dst),exist_ok=True); open(dst,'wb').write(b)
# 2. character sets in dc/: <name>a/c/g/p
for g in sorted(glob.glob(f'{OUT}/raw/**/dc/*g_lz.bin.NCGR',recursive=True)):
    base=g[:-len('g_lz.bin.NCGR')]; nm=os.path.basename(base)
    try:
        G=nds.ncgr(open(g,'rb').read()); P=nds.nclr(open(base+'p_lz.bin.NCLR','rb').read())[0]
        extract.do_cells(f'characters/{nm}',G,None,open(base+'c_lz.bin.NCER','rb').read(),P)
    except Exception as ex: print(nm,ex,file=log)
# 3. Nitro backgrounds in db/: <name>_ch/_pl/_sc
for g in sorted(glob.glob(f'{OUT}/raw/**/db/*_ch_lz.bin.NCGR',recursive=True)):
    base=g[:-len('_ch_lz.bin.NCGR')]; rel=os.path.relpath(base,f'{OUT}/raw')
    try:
        G=nds.ncgr(open(g,'rb').read()); P=nds.nclr(open(base+'_pl_lz.bin.NCLR','rb').read())[0]
        sc=base+'_sc_lz.bin.NSCR'; scr=open(sc,'rb').read() if os.path.exists(sc) else None
        d=f'{OUT}/backgrounds/{rel}.png'; os.makedirs(os.path.dirname(d),exist_ok=True)
        extract.render_bg(G,P,scr).save(d)
    except Exception as ex: print(base,ex,file=log)
# 4. raw GBA-style .pix (4bpp tiles) + .clt (BGR555 palette): render tile sheets
def pal555(b): return [((v&31)*255//31,(v>>5&31)*255//31,(v>>10&31)*255//31) for v in (b[i]|b[i+1]<<8 for i in range(0,len(b)-1,2))]
for p in sorted(glob.glob(f'{OUT}/raw/**/*.pix',recursive=True)):
    base=p[:-4]; cl=(glob.glob(base+'*.clt') or glob.glob(os.path.dirname(p)+'/*.clt') or [None])[0]
    try:
        b=open(p,'rb').read(); pal=pal555(open(cl,'rb').read()) if cl else [(i*17,)*3 for i in range(16)]
        G=dict(bd=3,w=16,h=0,px=[v for x in b for v in (x&15,x>>4)])
        d=f'{OUT}/tilesheets/'+os.path.relpath(base,f'{OUT}/raw')+'.png'; os.makedirs(os.path.dirname(d),exist_ok=True)
        extract.render_bg(G,pal[:16]).save(d)
    except Exception as ex: print(p,ex,file=log)
