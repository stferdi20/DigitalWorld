import sys,os,glob
import ndspy.rom
from skytemple_files.common.types.file_types import FileType
rom=ndspy.rom.NintendoDSRom.fromFile(sys.argv[1]); OUT=sys.argv[2]; os.makedirs(OUT,exist_ok=True)
bl=FileType.BG_LIST_DAT.deserialize(rom.getFileByName('MAP_BG/bg_list.dat')); ok=0
for i,l in enumerate(bl.level):
    try:
        bma=l.get_bma(rom); bpc=l.get_bpc(rom); bpl=l.get_bpl(rom); bpas=l.get_bpas(rom)
        ims=bma.to_pil(bpc,bpl,bpas,False,False)
        ims[0].save(f'{OUT}/{i:03}_{l.bma_name}.png'); ok+=1
        if len(ims)>1: ims[0].save(f'{OUT}/{i:03}_{l.bma_name}_anim.gif',save_all=True,append_images=ims[1:],duration=100,loop=0)
    except Exception as ex: print(i,getattr(l,'bma_name','?'),repr(ex)[:120])
print('maps',ok,'of',len(bl.level))
