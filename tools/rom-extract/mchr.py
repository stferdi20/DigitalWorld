import struct,sys,os
from PIL import Image
DIMS={128:(16,16),256:(16,32),512:(32,32),1024:(32,64),2048:(64,64)}
def frames(c,p,dims=None):
    n,fb=struct.unpack_from('<II',c); pal=[]
    for i in range(0,len(p)-1,2):
        v=p[i]|p[i+1]<<8; pal.append(((v&31)*255//31,(v>>5&31)*255//31,(v>>10&31)*255//31,255))
    w,h=dims or DIMS.get(fb,(16,fb//16)); out=[]
    for f in range(n):
        im=Image.new('RGBA',(w,h),(0,0,0,0)); P=im.load(); base=8+f*fb
        for t in range(fb//32):
            tx,ty=t%(w//8),t//(w//8)
            for i in range(32):
                b=c[base+t*32+i]
                for s,v in ((0,b&15),(1,b>>4)):
                    if v: P[tx*8+(i%4)*2+s,ty*8+i//4]=pal[v] if v<len(pal) else (255,0,255,255)
        out.append(im)
    return out
if __name__=='__main__':
    R,O=sys.argv[1],sys.argv[2]
    for f in sorted(os.listdir(f'{R}/MCHR_CHR')):
        k=f[:4]
        try:
            fr=frames(open(f'{R}/MCHR_CHR/{f}','rb').read(),open(f'{R}/MCHR_PAL/{k}.bin','rb').read())
            d=f'{O}/{k}'; os.makedirs(d,exist_ok=True)
            for i,im in enumerate(fr): im.save(f'{d}/frame_{i:02}.png')
            W=fr[0].width; s=Image.new('RGBA',(W*len(fr),fr[0].height))
            for i,im in enumerate(fr): s.paste(im,(i*W,0))
            s.save(f'{d}/_sheet.png')
        except Exception as e: print(k,e)
