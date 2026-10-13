# DigitalWorld — Digimon Agent Virtual Office (Mockup Plan)

An interactive pixel-art virtual office. Each AI "agent" is shown as a Digimon worker. Workers walk around, sit at desks, show idle and working animations, and display task bubbles. A Digimon evolves as the agent gains seniority. The design is built so that it can later become a **Claude Code mod**, where live agent and hook events drive the office.

## 1. Decisions (from Q&A)

| Topic | Decision |
|---|---|
| Art style | NDS-era pixel art from existing resources (Digimon World DS / Dawn & Dusk), no custom art |
| Sprite size | DS overworld sprites on a **universal grid**: 16px tiles, sprites in 32×32 or 64×64 frames anchored at the feet, so Mega Man or Pokémon DS-style sprites can be added later |
| World | One Digital World office plus surrounding Digi-Farms, NDS style |
| Hosting | Local only (`npm run dev`) |
| Scope | Interactive prototype covering everything: animations, bubbles, panels, walking |
| Stack | Phaser 3 + Vite + TypeScript, maps built in Tiled |
| Roles | Evolution stage = seniority; Digimon can be picked and assigned freely |
| Favorites | Veemon line, dark Digimon (Lucemon), skull and machine Digimon |
| Future | Can become a Claude Code mod (live agent state) |

## 2. Asset sources (use, don't invent)

Every candidate below needs its license checked before we commit to it. Digimon is Bandai IP, so this is a **personal or fan project and not for commercial use**.

**Digimon sprites (animated)**
- **Main source: Digimon World DS / Dawn & Dusk / Digimon Story overworld and farm sprites** (The Spriters Resource). They have 4-direction walk cycles and idle frames.
- If a favorite Digimon is missing from the DS games, fill the gap with sprites from other DS/GBA-era Digimon games, normalized to the same manifest.
- Static portraits for the UI panel: digi-api.com (`/api/v1/digimon/{name}`) returns images, levels and evolution data. We can also use that API to seed the roster.

**Environment (NDS Digital World, not LimeZu)**
- **Main look: Digimon World Dusk.** Fill gaps from Dawn (same engine and art) and then Digimon World DS.
- Tilesets from **Digimon World DS** and **Digimon World Dawn & Dusk** (The Spriters Resource, plus map rips). The Digimon Center / tamer HQ interiors become the office. The **Digi-Farm** maps (fields, fences, farm terrain types) become the surrounding farms.
- Optional extras: Digimon Story: Lost Evolution and Digimon World DS town/building tiles.
- Rips get re-sliced to a **16px tile grid** and exported as Tiled tilesets.

**UI / FX**
- Kenney UI Pack and Emote Pack (CC0) for speech and task bubbles and the `!`, `?`, `…` and `💤` emotes.
- Kenney Particle Pack (CC0) for the evolution flash.
- Pixel font: "Press Start 2P" or "m5x7".

## 3. World layout (one Tiled map, NDS style)

```
        ┌──────── DIGI-FARM (Server Farm) ────────┐
        │ machine-type terrain, idle machine Digis │
        └────────────────┬────────────────────────┘
 ┌ DIGI-FARM ┐   ┌───────┴─── DIGITAL WORLD OFFICE ───────┐   ┌ DIGI-FARM ┐
 │ (Dark)    │───│ open workspace │ meeting │ review desk │───│ (Nursery) │
 │ dark/skull│   │  desks ▢▢▢▢    │  room   │             │   │ eggs, new │
 │ idle zone │   └───────────────────┬─────────────────────┘   │ / unassigned│
 └───────────┘                       │                         └────────────┘
                     ┌──── DIGI-FARM (Training) ────┐
                     │ agents gain XP / evolve here │
                     └──────────────────────────────┘
```
- The office is where agents work; the farms are where they idle, rest, train and hatch. Idle agents walk out to the farm that matches their type (dark, machine, or nursery).
- Tiled layers: `floor`, `walls`, `furniture`, `furniture_top` (drawn above sprites), `collision`, and an object layer `spots` with desk seats, farm spots, the evolution pad and nursery spots.
- Each spot has `{id, facing, zone}`.
- The camera follows the selected agent or shows the whole world.
- **Sims-style view toggles** (one continuous map, no scene switch):
  - **Roof:** on, off, or auto (the roof fades out when the camera zooms in or hovers over the office).
  - **Walls:** full, cutaway (front-facing walls drop to a short stub so you can see inside), or hidden.
  - **Floors:** if the office grows to several storeys, a floor selector (▲/▼) shows one storey at a time and dims the ones above. It starts with 1–2 storeys.
  - Implementation: separate Tiled layers per storey (`f1_floor`, `f1_walls_back`, `f1_walls_front`, `f1_walls_front_cut`, `f1_roof`, …). Toggles only change layer visibility and alpha with a short tween. Sprites on hidden storeys are hidden too.
  - Hotkeys: `R` roof, `W` walls cycle, `PgUp/PgDn` storey.

## 3b. Universal sprite format (for future Mega Man / Pokémon packs)

Each sprite pack ships with a manifest, so the engine doesn't care which game a sprite came from:
```json
{ "id": "veemon", "pack": "digimon-ds", "sheet": "veemon.png",
  "frame": [32, 32], "anchor": [0.5, 1.0], "scale": 1,
  "anims": { "idle_down": [0,1], "walk_down": [2,3,4,5], "walk_left": [...],
             "work": [...], "happy": [...], "hurt": [...] } }
```
- Rules: 16px world tiles, feet-anchored sprites, 4-direction walk, and a standard set of animation names. A missing animation falls back to `idle`.
- Adding Mega Man or Pokémon later means dropping in a pack folder and a manifest.

## 4. Roster and evolution = seniority

| Stage | Seniority | Meaning |
|---|---|---|
| Fresh / In-Training | Intern | New agent, small tasks |
| Rookie | Junior | Default |
| Champion | Mid | After N completed tasks |
| Ultimate | Senior | |
| Mega | Lead / Orchestrator | Can "own" sub-agents |

Starter lines (all data-driven in `roster.json`):
- **Veemon** → ExVeemon → Paildramon → Imperialdramon
- **Lucemon** → Lucemon Falldown Mode → Lucemon Satan Mode
- **Impmon** → Beelzemon (dark)
- **Agumon** → Greymon → **SkullGreymon** (dark path) → BlackWarGreymon
- **Hagurumon** → Guardromon → Andromon → HiAndromon (machine)
- **Candlemon** → Wizardmon → **SkullSatamon** → (Mega: e.g. Piedmon)
- **BlackAgumon** → DarkTyrannomon → MetalTyrannomon → **Machinedramon**
- Extras: Datamon, Kokuwamon, Myotismon, Skullmeramon

**Pick and assign:**
- Roster sidebar: drag a Digimon onto a desk to hire it as an agent.
- Each agent can be given a role (coder, reviewer, researcher, planner) and a Digimon independent of that role, and its evolution line can be swapped.
- Evolution can be manual (button) or automatic (XP from completed tasks). There's also a toggle for "dark evolution" (e.g. Greymon → SkullGreymon) when an agent errors too often. 😈

## 5. Agent state machine → animations

| Agent state | Behavior | Animation | Bubble |
|---|---|---|---|
| `idle` | Wander the farms | idle, wander the farm | 💤 after 30s |
| `assigned` | Pathfind to desk | walk | 📋 task title |
| `working` | At desk | work loop (DS battle/attack frames reused) + typing particles | progress bar |
| `thinking` | At desk | slow idle + `…` | "…" |
| `waiting_input` | Stands, faces camera | happy/jump | ❓ (click to answer) |
| `blocked/error` | At desk | angry/hurt frames | ❗ red |
| `done` | Celebrate, walk to a farm | happy | ✅ + XP popup |
| `evolving` | Center stage | white flash + sprite swap (particle FX) | "X digivolved to Y!" |

Pathfinding: EasyStar.js on the Tiled collision grid.

## 6. UI mockup

- **Main view:** NDS-style world with the office and farms; zoom 2–3× for crisp pixels.
- **Top bar:** office name, agent count, tasks done today, speed control (simulate 1×/4×).
- **Left sidebar:** roster/Digidex (search, filter by stage or type: Vaccine/Data/Virus, dark, machine), drag to hire.
- **Click an agent:** right panel with portrait, name, stage, XP bar, role, current task, log tail, and buttons to *Assign task*, *Evolve*, *Change Digimon*, *Send to break*.
- **Bottom:** task board (To do / Doing / Done). Dragging a card onto a Digimon assigns it.
- **Fake task generator** for the prototype, which feeds random tasks so the office feels alive.

## 7. Architecture

```
src/
  main.ts                 Phaser config, scenes
  scenes/OfficeScene.ts   map, sprites, camera, input
  scenes/UIScene.ts       overlay HUD (or DOM/Preact overlay)
  agents/Agent.ts         state machine + sprite controller
  agents/AgentStore.ts    single source of truth (events in, state out)
  sources/MockSource.ts   fake task/event generator      ← prototype
  sources/ClaudeSource.ts live events (later, mod phase)  ← future
  data/roster.json        digimon lines, sprite keys, frame ranges
public/assets/            tilesets, sprite sheets, ui
```
Key idea: the office only reacts to **events** (`agent.spawn`, `task.assigned`, `agent.state`, `task.done`, `agent.evolve`). The mock source and a future Claude source emit the same events, so turning this into a mod means writing a new source and leaving the scene untouched.

## 8. Path to a Claude Code mod (later)

- Claude Code hooks (`PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`, `Notification`) post events to a small local WebSocket bridge, which feeds `ClaudeSource`.
- Each subagent or session becomes a Digimon. Tool calls map to `working`, a permission prompt or notification maps to `waiting_input`, and errors map to `blocked`.
- Package it as a Claude Code plugin/mod (a live pane that opens the office), with the bridge started by the plugin.

## 9. Milestones

1. **M0 Assets:** collect DS Digimon sprites and DS Digital World / Digi-Farm tiles; write the manifest format and slicer script; `roster.json` for about 8 lines.
2. **M1 World:** Vite + Phaser scaffold, office and farm Tiled map, camera pan/zoom.
3. **M2 Agents:** spawn Digimon, idle/walk, pathfind to desks.
4. **M3 States and bubbles:** full state machine, emotes, progress bars.
5. **M4 UI:** roster drag-to-hire, agent panel, task board, mock source.
6. **M5 Evolution:** XP, evolve FX, dark-evolution toggle, swap Digimon.
7. **M6 Polish:** Digital World tint, sounds (optional), save layout to localStorage.
8. **M7 (later)** Claude hooks bridge to mod.

## Progress

- ✅ M0 pipeline: sprite manifest format, `slice`/`pack` tools, roster for 9 lines (sprites themselves still to be downloaded, since The Spriters Resource is blocked from the cloud sandbox)
- ✅ M1–M5 prototype on placeholders: world with 4 farms, roof/wall toggles, agents + pathfinding, state bubbles, hire/assign/fire UI, task board, evolution + dark evolution, mock source
- ✅ Real Dusk overworld sprites: 423 sets imported locally (gitignored), mirrored walk cycles, Digidex picker + export, hire-from-Digidex
- ✅ Real Dusk maps: DigiLab office (main + executive floor) and 4 Digi-Farm islands exported from the ROM, walk grids from the game's floor masks, DS-style warps between maps (replaces the code-drawn map; roof/wall toggles dropped since Dusk interiors are already cutaway)
- ⏭ Next: finish the form→sprite mapping (Lucemon line, skull/machine megas), Dusk tilesets in Tiled (replacing `src/world/map.ts`), multi-storey selector

## 10. Open questions

- None blocking. Next step: M0 (assets and sprite manifest).

## 11. Merging Dusk, Pokémon (PMD Sky) and Mega Man (BN5) sprites

**Where things are now**
- This branch has the Dusk sprites (`import-dusk`) and maps (`tools/dusk/export_maps.py`).
- `claude/inspiring-ride-uu4m98` has the extraction tools for all three ROMs in `tools/rom-extract/` and `docs/rom-extraction.md`. Its outputs only exist as local files or zips.
- Engine side, the universal pack format (`SpriteManifest`: frame size, feet anchor, standard anim names, mirror) and multi-pack loading (`packs/index.json`) already exist. The Digidex already lists every loaded sprite.

**What each source gives**

| Source | Output | Directions | Frame size | Names |
|---|---|---|---|---|
| Digimon World Dusk | `overworld/NNNN/_sheet.png`, 9 or 6 frames | back, side (mirror for the other side), front | 32×32 / 32×64 / 64×64 | none (Digidex picks) |
| PMD: Explorers of Sky | `NNNN_Name/<Anim>-Anim.png` + `AnimData.xml` (PMDCollab format) | 8 directions, one row each | per anim, in AnimData.xml (≈24–64px) | yes, from the ROM |
| MMBN5 DS | `sprites/bn/<archive>/anim_NN.png` strips | unknown per archive: anim index → meaning needs a lookup | per archive | file names (`man*`, `pl*`, `em*`) |

**Steps**
1. **Bring the tools together.** Merge `inspiring-ride-uu4m98` into this branch, move `tools/dusk/export_maps.py` into `tools/rom-extract/`, and keep one `.gitignore` covering ROMs, `out*/` and `public/assets/packs/*`.
2. **One importer per source, all writing the same pack format**, under `public/assets/packs/<pack>/` (gitignored):
   - `import-dusk` (done) → pack `dusk`, ids `dusk_NNNN`.
   - `import-pmd` → pack `pmd`, ids `pmd_<name>`. It reads `AnimData.xml` and builds one atlas per Pokémon at a uniform frame size, with the feet aligned using the Offsets/Shadow data. It then maps:
     - Walk/Idle rows: down=0, right=2, up=4, left=6
     - `work` ← Attack or Eat
     - `happy` ← Pose or Hop
     - `hurt` ← Hurt
     - `sleep` ← Sleep, used for the 💤 idle state
   - `import-bn5` → pack `bn5`, ids `bn5_<archive>`. It lays out each archive's `anim_NN` strips into one atlas. Because the anim meaning varies by archive type, a small `bn5-anims.json` lookup maps anim index → our anim names for each archive type. It gets filled in by looking at a few sheets for each of the `man*`, `pl*` and `em*` types.
3. **Manifest additions**
   - an optional 8-direction set, where `walk_down_left` etc. fall back to the 4 directions
   - `name` per sprite
   - `scale` per pack, so PMD and BN sprites sit at Dusk's size
4. **Digidex:** pack tabs (Digimon · Pokémon · Mega Man), search by name, and the same pick/hire/export flow. Rename "Digimon line" to "Character line": a line's forms can come from any pack.
5. **Rosters:**
   - Pokémon evolution lines fit seniority directly (e.g. Charmander → Charmeleon → Charizard, Gastly → Haunter → Gengar).
   - Mega Man navis become single-form lines, or "style changes" as their evolution.
   - Mixed teams are allowed.
6. **Later (optional):** a home area per franchise:
   - a PMD Treasure Town / dungeon map
   - a BN5 net area from the decoded backgrounds and tilesheets

   Each would join the world as another area, connected by warps, the same way the Digi-Farms are.

**Status:** steps 1, 2, 4 and 5 are done (tools merged; `import_pmd.py` / `import_bn5.py`; Digidex tabs + name search; Pokémon lines + MegaMan.EXE in the roster). Step 6 done too: Treasure Town and a BN5 net area are home areas for Pokémon and Mega Man, with colour-derived walk grids. Step 3 done too: 8-direction walking (PMD's 8 rows and BN5's native diagonals; Dusk falls back to its side/back poses), and sprite sheets now load on demand (startup ~12s → ~4.5s).

**Originally needed to start:** the extracted Pokémon and Mega Man outputs (zipped, each under 30 MB), or the two ROMs to extract here.
