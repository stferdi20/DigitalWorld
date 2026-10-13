# Battle Network 5 DS area maps: st<id>.pib (LZ tiles) + .clb (palettes) + .srb (LZ screen, 2 layers)
import sys,os,glob,struct
sys.path.insert(0,os.path.dirname(__file__)); import nds
from PIL import Image
R,OUT=sys.argv[1],sys.argv[2]; os.makedirs(OUT,exist_ok=True)
def lzblocks(d):
    n=[]
    for o in struct.unpack_from('<5I',d,4):
        if 0<o<len(d) and d[o]==0x10:
            try: n.append(nds.rle(d[o:]))
            except Exception: pass
    return n
def render(tiles,pal,m,w,h,base=0,bpp8=True):
    im=Image.new('RGBA',(w*8,h*8),(0,0,0,0)); P=im.load()
    for n in range(w*h):
        e=m[base+2*n]|m[base+2*n+1]<<8; t=e&0x3ff; hf=e>>10&1; vf=e>>11&1; pl=e>>12
        for i in range(64):
            if bpp8:
                b=t*64+i
                if b>=len(tiles): break
                v=tiles[b]; ci=v
            else:
                b=t*32+i//2
                if b>=len(tiles): break
                v=(tiles[b]>>((i&1)*4))&15; ci=pl*16+v
            if not v: continue
            if ci>=len(pal): continue
            x=i%8; y=i//8
            if hf: x=7-x
            if vf: y=7-y
            P[(n%w)*8+x,(n//w)*8+y]=pal[ci]
    return im
ok=0
for sp in sorted(glob.glob(f'{R}/**/st*.srb',recursive=True)):
    b=sp[:-4]; nm=os.path.basename(b)
    try:
        def find(ext):
            # stages in one area share the tileset/palette of an earlier stage (st8101 -> st8100)
            c=sorted(x for x in glob.glob(os.path.dirname(b)+f'/{nm[:4]}*.{ext}') if os.path.basename(x)[:-len(ext)-1]<=nm)
            return open(c[-1],'rb').read()
        pib=find('pib'); clb=find('clb'); srb=open(sp,'rb').read()
        tiles=b''.join(lzblocks(pib)[:1])
        praw=clb[4:4+struct.unpack_from('<I',clb)[0]]
        pal=[((v&31)*255//31,(v>>5&31)*255//31,(v>>10&31)*255//31,255) for v in (praw[i]|praw[i+1]<<8 for i in range(0,len(praw)-1,2))]
        w,h,nl=srb[0],srb[1],srb[2]+1
        off=struct.unpack_from('<I',srb,4)[0]; m=nds.rle(srb[off:])
        img=Image.new('RGBA',(w*8,h*8),(0,0,0,255))
        layers=min(nl,len(m)//(w*h*2))
        # real-world stages are 8bpp; Cyberworld stages are 4bpp with per-tile palettes
        bpp8=len({(m[2*i+1]>>4) for i in range(w*h*layers)})<=1
        for L in reversed(range(layers)):
            lay=render(tiles,pal,m,w,h,L*w*h*2,bpp8); img.alpha_composite(lay)
        img.save(f'{OUT}/{nm}.png'); ok+=1
    except Exception as ex: print(nm,repr(ex)[:120])
print('maps',ok)
