import sys,struct,os
def entries(d):
    n=struct.unpack_from('<I',d,0)[0]
    for i in range(n):
        off,sz=struct.unpack_from('<II',d,4+i*8)
        yield i,off,sz&0x7fffffff,sz>>31
if __name__=='__main__':
    d=open(sys.argv[1],'rb').read()
    for i,o,s,f in list(entries(d))[:int(sys.argv[2])]:
        print(i,o,s,f,d[o:o+16].hex())
