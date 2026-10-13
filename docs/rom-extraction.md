# ROM resource extraction

Scripts in `tools/rom-extract/` pull sprites, backgrounds, sound and text out of legally owned NDS ROMs.
Outputs are copyrighted and must stay local (see `.gitignore`); only the tools and these notes live in git.
A new session needs the ROM (or the previously delivered zips) uploaded again.

Setup: `pip install ndspy pillow skytemple-files`. Run every script with `python3 -I`.
Common first step for any ROM: `python3 -I tools/rom-extract/unpack.py game.nds fs/`.

## Digimon World Dusk (USA) — `DS2_USA_DUSK`

| Step | Command | Output |
| --- | --- | --- |
| PAKs, UI and battle sprites, backgrounds | `extract.py fs out` | `out/raw`, `out/sprites/{field,btchr}`, `out/backgrounds` |
| Overworld walk sprites (best for the office) | `mchr.py out/raw out/sprites/overworld` | 890 sets, 16x32 / 32x32 frames |
| Text | `msg.py out/raw/MSG out/text` | 138 banks, ~95% decoded |
| Sound | `sdat.py fs/dat/snd/sound_data.sdat out/sound` | 703 WAV samples + raw SSEQ/SBNK/SWAR |

Formats: `.PAK` = `u32 count` + `(u32 offset, u32 size|0x80000000)` entries, each RLE (0x30) compressed Nitro file.
MCHR_CHR = `u32 frames, u32 bytesPerFrame` + 4bpp tiles (128=16x16, 256=16x32, 512=32x32); MCHR_PAL = 16 BGR555 colours.
Battle Digimon (BTCHR) are body-part cells; full poses need NANR composition (not done).
Text: u16 codes, space=0, digits 0x01-0x0A, A-Z 0x20-0x39, a-z 0x3A-0x53, `, . ! ?` = 0x11-0x14, 0xFFFD newline, 0xFFFE new box.

## Pokémon Mystery Dungeon: Explorers of Sky (US) — `POKEDUN SORA`

| Step | Command | Output |
| --- | --- | --- |
| All Pokémon sprites | `pmd.py game.nds out/pokemon` | One folder per sprite (`NNNN_Name`): `AnimData.xml` + `<Anim>-Anim.png` / `-Offsets.png` / `-Shadow.png` for Walk, Idle, Sleep, Sit, Eat, Attack… in 8 directions (PMDCollab SpriteBot format) |
| Text | skytemple `FileType.STR` on `MESSAGE/text_e.str` | 18,451 strings |
| Sound | copy `SOUND/` | raw SWD/SMD (Procyon engine; not converted) |

Uses SkyTemple (`skytemple_files.graphics.chara_wan`): merges `MONSTER/monster.bin`, `m_ground.bin`, `m_attack.bin` per sprite id.
Sheets are directly usable: each row of `Walk-Anim.png` is one direction, frame size is in `AnimData.xml`.

## Mega Man Battle Network 5: Double Team DS (USA) — `MEGAMANBN5DS`

| Step | Command | Output |
| --- | --- | --- |
| Decompress everything, map objects, Nitro BGs, tile sheets | `bn5.py fs/data out` | `out/raw`, `out/sprites/characters`, `out/backgrounds`, `out/tilesheets` |
| Character / navi / enemy / NPC / mugshot sprites | `bnsprite.py out/raw out/sprites/bn` | ~649 archives, one `anim_NN.png` strip per animation |
| Sound | `sdat.py fs/data/rom/ds/*.sdat out/sound` | 493 WAV samples + raw sequences |

Files ending `_lz`/`_LZ` are LZ10; some keep a 4-byte `(size<<8)` header after decompression.
`rom/dc`, `rom/db` hold Nitro NCGR/NCLR/NCER (map objects, backgrounds); `rom/dm`, `rom/dt` are 3D models/textures (BMD0/BTX0).
GBA-style sprite archives (`man*` overworld NPCs, `pl*`/`pshl*` player/navis, `em*` enemies, `face*` mugshots):
header byte 3 = animation count, then `u32` animation offsets (relative to +4); each frame is 20 bytes
(tileset, palette, sub-anim, object list pointers, `u16 delay`, `u16 flags`; flags&0xC0 ends the animation).
Object entries are 5 bytes (tile, x s8, y s8, size|hflip<<6|vflip<<7, shape), terminated by `FF FF FF FF FF`.
Text (`*.msg`) uses the Battle Network custom charset and is not decoded.
