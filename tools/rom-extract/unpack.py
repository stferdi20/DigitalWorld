import sys, os, ndspy.rom
rom = ndspy.rom.NintendoDSRom.fromFile(sys.argv[1]); out=sys.argv[2]
for fid in range(len(rom.files)):
    p = rom.filenames.filenameOf(fid)
    if p is None: continue
    d=os.path.join(out,p); os.makedirs(os.path.dirname(d),exist_ok=True)
    open(d,'wb').write(rom.files[fid])
print(rom.name)
