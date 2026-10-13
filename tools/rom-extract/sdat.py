import ndspy.soundArchive as SA, os, wave, struct, sys
IDX=[-1,-1,-1,-1,2,4,6,8]*2
STEP=[7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767]
def adpcm(d):
    s,i=struct.unpack_from('<hH',d); i=min(i,88); out=[]
    for b in d[4:]:
        for n in (b&15,b>>4):
            st=STEP[i]; df=st>>3
            if n&1: df+=st>>2
            if n&2: df+=st>>1
            if n&4: df+=st
            s=s-df if n&8 else s+df; s=max(-32768,min(32767,s)); i=max(0,min(88,i+IDX[n])); out.append(s)
    return struct.pack(f'<{len(out)}h',*out)
a=SA.SDAT.fromFile(sys.argv[1]); O=sys.argv[2]; n=0
for kind,ext in [('sequences','sseq'),('sequenceArchives','ssar'),('banks','sbnk'),('waveArchives','swar')]:
    os.makedirs(f'{O}/{kind}',exist_ok=True)
    for name,obj in getattr(a,kind):
        if obj is None: continue
        b=obj.save(); open(f'{O}/{kind}/{name}.{ext}','wb').write(b[0] if isinstance(b,tuple) else b)
for name,w in a.waveArchives:
    if not w: continue
    d=f'{O}/samples_wav/{name}'; os.makedirs(d,exist_ok=True)
    for i,sw in enumerate(w.waves):
        t=int(sw.waveType); raw=sw.data
        pcm=b''.join(struct.pack('<h',(b if b<128 else b-256)*256) for b in raw) if t==0 else raw if t==1 else adpcm(raw)
        with wave.open(f'{d}/{i:03}.wav','wb') as W: W.setnchannels(1);W.setsampwidth(2);W.setframerate(sw.sampleRate);W.writeframes(pcm)
        n+=1
print(n,'wavs')
