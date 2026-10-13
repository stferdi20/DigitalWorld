import struct,os,sys,collections
R,O=sys.argv[1],sys.argv[2]; os.makedirs(O,exist_ok=True); unk=collections.Counter()
def ch(c):
    if c==0: return ' '
    if 0x20<=c<0x3a: return chr(c-0x20+65)
    if 0x3a<=c<0x54: return chr(c-0x3a+97)
    P={0x11:',',0x12:'.',0x13:'!',0x14:'?',0x0e:"'",0x15:'(',0x16:')',0x0f:'-',0x18:'-'}
    if c in P: return P[c]
    if 1<=c<=10: return str(c-1)
    if c==0xfffd: return '\n'
    if c==0xfffe: return '\n----\n'
    unk[c]+=1; return '{%02x}'%c
for f in sorted(os.listdir(R)):
    d=open(f'{R}/{f}','rb').read(); first=struct.unpack_from('<I',d,0)[0]
    offs=[struct.unpack_from('<I',d,i)[0] for i in range(0,first,4)]+[len(d)]; out=[]
    for k in range(len(offs)-1):
        s=d[offs[k]:offs[k+1]]; t=''.join(ch(struct.unpack_from('<H',s,i)[0]) for i in range(0,len(s)-1,2))
        out.append(f'[{k}]\n{t}\n')
    open(f'{O}/{f[:4]}.txt','w').write('\n'.join(out))
print(unk.most_common(25))
