import sys,os,glob,re,traceback
import ndspy.rom
from PIL import Image
from skytemple_files.common.util import get_ppmdu_config_for_rom
from skytemple_files.common.types.file_types import FileType
from skytemple_files.graphics.chara_wan.handler import CharaWanHandler
from skytemple_files.graphics.chara_wan.split_merge import MergeWan
rom=ndspy.rom.NintendoDSRom.fromFile(sys.argv[1]); OUT=sys.argv[2]; LIMIT=int(sys.argv[3]) if len(sys.argv)>3 else 99999
cfg=get_ppmdu_config_for_rom(rom)
def pack(n): return FileType.BIN_PACK.deserialize(rom.getFileByName(f'MONSTER/{n}.bin'))
def raw(b):
    b=bytes(b)
    if b[:5] in (b'PKDPX',b'AT4PX'): b=FileType.COMMON_AT.deserialize(b).decompress()
    return b
# names: sprite id -> pokemon name
names={}
try:
    md=FileType.MD.deserialize(rom.getFileByName('BALANCE/monster.md'))
    st=FileType.STR.deserialize(rom.getFileByName('MESSAGE/text_e.str'),string_encoding=cfg.string_encoding)
    blk=cfg.string_index_data.string_blocks['Pokemon Names']
    for i,e in enumerate(md.entries):
        nm=st.strings[blk.begin+e.md_index_base] if e.md_index_base+blk.begin<blk.end else ''
        names.setdefault(e.sprite_index,re.sub(r'[^A-Za-z0-9]','',nm) or 'unk')
except Exception as ex: print('names',ex)
G,M,A=pack('m_ground'),pack('monster'),pack('m_attack')
for i in range(min(len(G),LIMIT)):
    try:
        b=raw(G[i])
        if len(b)<16: continue
        wans=[FileType.WAN.CHARA.deserialize(raw(M[i])) if False else None]
        parts=[]
        for P in (M,G,A):
            if i<len(P):
                r=raw(P[i])
                if len(r)>16: parts.append(CharaWanHandler.deserialize(r))
            else: parts.append(None)
        # MergeWan expects [monster, ground, attack]
        if any(p is None for p in parts): wan=CharaWanHandler.deserialize(b)
        else: wan=MergeWan(parts)
        sd=cfg.animation_names.get(i, cfg.animation_names[0]) if isinstance(cfg.animation_names,dict) else None
        d=f'{OUT}/{i:04}_{names.get(i,"unk")}'
        CharaWanHandler.export_sheets(d,wan,cfg.animation_names[0])
    except Exception as ex: print(i,repr(ex)[:150])
