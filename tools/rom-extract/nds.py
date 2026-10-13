import struct
def rle(d):
    t=d[0]; n=d[1]|d[2]<<8|d[3]<<16; i=4; o=bytearray()
    if t==0x30:
        while len(o)<n:
            f=d[i]; i+=1
            if f&0x80: o+=bytes([d[i]])*((f&0x7f)+3); i+=1
            else: o+=d[i:i+(f&0x7f)+1]; i+=(f&0x7f)+1
    elif t==0x10:
        while len(o)<n:
            fl=d[i]; i+=1
            for b in range(8):
                if len(o)>=n: break
                if fl&(0x80>>b):
                    x=d[i]<<8|d[i+1]; i+=2; l=(x>>12)+3; dist=(x&0xfff)+1
                    for _ in range(l): o.append(o[-dist])
                else: o.append(d[i]); i+=1
    elif t==0x11:
        while len(o)<n:
            fl=d[i]; i+=1
            for b in range(8):
                if len(o)>=n: break
                if fl&(0x80>>b):
                    a=d[i]>>4
                    if a==0: l=((d[i]&15)<<4|d[i+1]>>4)+0x11; dist=((d[i+1]&15)<<8|d[i+2])+1; i+=3
                    elif a==1: l=((d[i]&15)<<12|d[i+1]<<4|d[i+2]>>4)+0x111; dist=((d[i+2]&15)<<8|d[i+3])+1; i+=4
                    else: l=a+1; dist=((d[i]&15)<<8|d[i+1])+1; i+=2
                    for _ in range(l): o.append(o[-dist])
                else: o.append(d[i]); i+=1
    else: return None
    return bytes(o[:n])
def maybe(d):
    if len(d)>8 and d[0] in (0x10,0x11,0x30):
        try:
            r=rle(d)
            if r: return r
        except Exception: pass
    return d
def sections(d):
    hs=struct.unpack_from('<H',d,12)[0]; ns=struct.unpack_from('<H',d,14)[0]; o=hs; r={}
    for _ in range(ns):
        m=d[o:o+4][::-1].decode('latin1'); sz=struct.unpack_from('<I',d,o+4)[0]; r[m]=(o,d[o:o+sz]); o+=sz
    return r
def nclr(d):
    _,s=sections(d)['PLTT']; bd,_,ds,off=struct.unpack_from('<IIII',s,8)
    raw=s[8+off:8+off+ds]; cols=[]
    for i in range(0,len(raw)-1,2):
        c=raw[i]|raw[i+1]<<8; cols.append(((c&31)*255//31,(c>>5&31)*255//31,(c>>10&31)*255//31))
    return cols,bd
def ncgr(d):
    _,s=sections(d)['CHAR']; h,w,bd,_,tf,ds,off=struct.unpack_from('<HHIIIII',s,8)
    raw=s[8+off:8+off+ds]
    if bd==3: px=[v for b in raw for v in (b&15,b>>4)]
    else: px=list(raw)
    return dict(h=h,w=w,bd=bd,tiled=(tf&0xff)==0,px=px,mapping=None)
def ncer(d):
    _,s=sections(d)['CEBK']; n,ext,doff=struct.unpack_from('<HHI',s,8)
    mapping=struct.unpack_from('<I',s,16)[0]
    base=8+doff; esz=16 if ext==1 else 8; oambase=base+n*esz; cells=[]
    for i in range(n):
        no,_,oo=struct.unpack_from('<HHI',s,base+i*esz); objs=[]
        for j in range(no):
            a0,a1,a2=struct.unpack_from('<HHH',s,oambase+oo+j*6)
            y=a0&0xff; y=y-256 if y>127 else y
            x=a1&0x1ff; x=x-512 if x>255 else x
            shape=a0>>14; size=a1>>14; hf=a1>>12&1; vf=a1>>13&1; rs=a0>>8&1
            if rs: hf=vf=0
            W,H=[[(8,8),(16,16),(32,32),(64,64)],[(16,8),(32,8),(32,16),(64,32)],[(8,16),(8,32),(16,32),(32,64)],[(8,8)]*4][shape][size]
            objs.append(dict(x=x,y=y,w=W,h=H,tile=a2&0x3ff,pal=a2>>12,hf=hf,vf=vf,bpp8=a0>>13&1))
        cells.append(objs)
    return cells,mapping
