# Battle Network (GBA-style) sprite archive -> per-animation frame sheets
import struct,sys,os,glob
from PIL import Image
SZ=[[(8,8),(16,16),(32,32),(64,64)],[(16,8),(32,8),(32,16),(64,32)],[(8,16),(8,32),(16,32),(32,64)]]
def pal555(b): return [((v&31)*255//31,(v>>5&31)*255//31,(v>>10&31)*255//31,255) for v in (b[i]|b[i+1]<<8 for i in range(0,len(b)-1,2))]
def parse(d):
    if len(d)>8 and d[0]==0 and (struct.unpack_from('<I',d)[0]>>8)==len(d)-4: d=d[4:]
    n=d[3]; B=4
    if n==0 or n>200: raise ValueError('count')
    anims=[]
    for a in range(n):
        o=B+struct.unpack_from('<I',d,B+a*4)[0]; frames=[]
        while True:
            t,p,m,ob,dl,fl=struct.unpack_from('<IIIIHH',d,o)
            for x in (t,p,ob):
                if B+x>=len(d): raise ValueError('ptr')
            ts=struct.unpack_from('<I',d,B+t)[0]; tiles=d[B+t+4:B+t+4+ts]
            ps=struct.unpack_from('<I',d,B+p)[0]; pal=pal555(d[B+p+4:B+p+4+max(ps,32)])
            oo=B+ob+struct.unpack_from('<I',d,B+ob)[0]; objs=[]
            while d[oo:oo+5]!=b'\xff'*5 and len(objs)<64 and oo+5<=len(d):
                ti,x,y,f,s=struct.unpack_from('<BbbBB',d,oo); objs.append((ti,x,y,f,s)); oo+=5
            frames.append(dict(tiles=tiles,pal=pal,objs=objs,delay=dl)); o+=20
            if fl&0xc0 or len(frames)>128: break
        anims.append(frames)
    return anims
def draw(fr,box):
    x0,y0,x1,y1=box; im=Image.new('RGBA',(x1-x0,y1-y0),(0,0,0,0)); P=im.load(); T=fr['tiles']; pal=fr['pal']
    for ti,x,y,f,s in reversed(fr['objs']):
        w,h=SZ[(s&3) if (s&3)<3 else 0][f&3]; hf=f>>6&1; vf=f>>7&1; tw=w//8
        for k in range(tw*(h//8)):
            base=(ti+k)*32
            for i in range(64):
                bi=base+i//2
                if bi>=len(T): continue
                v=(T[bi]>>((i&1)*4))&15
                if not v or v>=len(pal): continue
                X=(k%tw)*8+i%8; Y=(k//tw)*8+i//8
                if hf: X=w-1-X
                if vf: Y=h-1-Y
                P[x+X-x0,y+Y-y0]=pal[v]
    return im
def bounds(anims):
    xs=[];ys=[]
    for fs in anims:
        for fr in fs:
            for ti,x,y,f,s in fr['objs']:
                w,h=SZ[(s&3) if (s&3)<3 else 0][f&3]; xs+=[x,x+w]; ys+=[y,y+h]
    return (min(xs),min(ys),max(xs),max(ys)) if xs else None
def export(path,out):
    anims=parse(open(path,'rb').read()); box=bounds(anims)
    if not box: return 0
    os.makedirs(out,exist_ok=True); rows=[]
    for a,fs in enumerate(anims):
        ims=[draw(fr,box) for fr in fs]; w,h=ims[0].size
        s=Image.new('RGBA',(w*len(ims),h))
        for i,im in enumerate(ims): s.paste(im,(i*w,0))
        s.save(f'{out}/anim_{a:02}.png'); rows.append(s)
    W=max(r.width for r in rows); s=Image.new('RGBA',(W,sum(r.height for r in rows))); y=0
    for r in rows: s.paste(r,(0,y)); y+=r.height
    s.save(f'{out}/_sheet.png'); return len(anims)
if __name__=='__main__':
    R,O=sys.argv[1],sys.argv[2]; ok=0
    for p in sorted(glob.glob(f'{R}/**/*.bin',recursive=True)):
        try:
            if export(p,f'{O}/'+os.path.relpath(p,R).replace('.bin','')): ok+=1
        except Exception: pass
    print('sprite archives:',ok)
