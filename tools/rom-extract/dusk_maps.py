# Digimon World Dusk field maps: <id>a/<id>b layers, each .c (4bpp tiles) .p (palettes) .s (screen)
import sys,os,glob,struct
sys.path.insert(0,os.path.dirname(__file__)); import nds
from PIL import Image
D,OUT=sys.argv[1],sys.argv[2]; os.makedirs(OUT,exist_ok=True)
def load(p): return nds.rle(open(p,'rb').read())
def layer(base):
    c=load(base+'.c'); p=load(base+'.p'); s=load(base+'.s')
    tiles=c[4:4+struct.unpack_from('<I',c)[0]]
    praw=p[4:4+struct.unpack_from('<I',p)[0]]
    pal=[((v&31)*255//31,(v>>5&31)*255//31,(v>>10&31)*255//31,255) for v in (praw[i]|praw[i+1]<<8 for i in range(0,len(praw)-1,2))]
    w,h=struct.unpack_from('<HH',s); m=s[4:]; tw=w//8
    im=Image.new('RGBA',(w,h),(0,0,0,0)); P=im.load()
    for n in range(min(len(m)//2,tw*(h//8))):
        e=m[2*n]|m[2*n+1]<<8; t=e&0x3ff; hf=e>>10&1; vf=e>>11&1; pl=e>>12
        for i in range(64):
            b=t*32+i//2
            if b>=len(tiles): break
            v=(tiles[b]>>((i&1)*4))&15
            if not v: continue
            ci=pl*16+v
            if ci>=len(pal): continue
            x=i%8; y=i//8
            if hf: x=7-x
            if vf: y=7-y
            P[(n%tw)*8+x,(n//tw)*8+y]=pal[ci]
    return im
ok=0
for sp in sorted(glob.glob(f'{D}/*a.s')):
    mid=os.path.basename(sp)[:-3]
    try:
        im=layer(f'{D}/{mid}a')
        lb=f'{D}/{mid}b'
        if os.path.exists(lb+'.s'):
            top=layer(lb); im.alpha_composite(top) if top.size==im.size else None
            top.save(f'{OUT}/{mid}_layerB.png')
        bg=Image.new('RGBA',im.size,(0,0,0,255)); bg.alpha_composite(im); bg.save(f'{OUT}/{mid}.png'); ok+=1
    except Exception as ex: print(mid,repr(ex)[:120])
print('maps',ok)
