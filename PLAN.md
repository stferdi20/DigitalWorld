# DigitalWorld — Digimon Agent Virtual Office (Mockup Plan)

An interactive pixel-art virtual office. Each AI "agent" is shown as a Digimon worker. Workers walk around, sit at desks, show idle and working animations, and display task bubbles. A Digimon evolves as the agent gains seniority. The design is built so that it can later become a **Claude Code mod**, where live agent and hook events drive the office.

## 1. Decisions (from Q&A)

| Topic | Decision |
|---|---|
| Art style | Pixel art from existing resources; no custom art |
| Scope | Interactive prototype covering everything: animations, bubbles, panels, walking |
| Stack | Phaser 3 + Vite + TypeScript, maps built in Tiled |
| Roles | Evolution stage = seniority; Digimon can be picked and assigned freely |
| Favorites | Veemon line, dark Digimon (Lucemon), skull and machine Digimon |
| Future | Can become a Claude Code mod (live agent state) |

## 2. Asset sources (use, don't invent)

Every candidate below needs its license checked before we commit to it. Digimon is Bandai IP, so this is a **personal or fan project and not for commercial use**.

**Digimon sprites (animated)**
- **V-Pet / Pendulum / Digivice sprite rips.** These are 16×16 or 32×32 sheets with idle, walk, happy, angry, eat and attack frames, and they cover almost every Digimon including the evolution lines. Main candidates: community "Digimon V-Pet sprite" archives (Humulos' collections) and The Spriters Resource (Digimon Pendulum, Digimon World DS, Digimon Story).
- Fallback: **Digimon World DS / Dawn & Dusk overworld sprites** (The Spriters Resource). They're larger, with 4-direction walk cycles.
- Static portraits for the UI panel: digi-api.com (`/api/v1/digimon/{name}`) returns images, levels and evolution data. We can also use that API to seed the roster.

**Office environment**
- **LimeZu "Modern Interiors" / "Modern Office"** (itch.io; a free tier exists, and the full pack is cheap). It has desks, PCs, chairs, plants, a kitchen and meeting rooms, in 16×16 or 32×32 to match the V-Pet scale.
- Alternatives: Kenney "Roguelike Indoor" (CC0), or Ninja Adventure (CC0) for extra props.
- To match the Digimon theme, retint floors and walls toward a "Digital World" palette (grid floor, cyan glow) with a Phaser post-FX pipeline, so we don't need new art.

**UI / FX**
- Kenney UI Pack and Emote Pack (CC0) for speech and task bubbles and the `!`, `?`, `…` and `💤` emotes.
- Kenney Particle Pack (CC0) for the evolution flash.
- Pixel font: "Press Start 2P" or "m5x7".

## 3. Office layout (Tiled map)

```
┌──────────────────────────────────────────────┐
│  SERVER ROOM      │   OPEN WORKSPACE (desks) │
│  (machine types   │   ▢▢  ▢▢  ▢▢  ▢▢          │
│   idle here)      │   ▢▢  ▢▢  ▢▢  ▢▢          │
├────────┬──────────┼──────────────────────────┤
│ DARK   │ MEETING  │  BREAK ROOM / DIGI-EGG   │
│ AREA   │ ROOM     │  NURSERY (unassigned     │
│(review)│(planning)│  agents & new spawns)    │
└────────┴──────────┴──────────────────────────┘
```
- Tiled layers: `floor`, `walls`, `furniture`, `furniture_top` (drawn above sprites), `collision`, and an object layer `spots` with desk seats, the coffee machine, meeting chairs and nursery beds.
- Each desk spot has `{id, facing, room}` so an agent can be assigned to a seat.

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
| `idle` | Wander or break room | idle bob | 💤 after 30s |
| `assigned` | Pathfind to desk | walk | 📋 task title |
| `working` | At desk | work loop (V-Pet "eat/attack" frames reused) + typing particles | progress bar |
| `thinking` | At desk | slow idle + `…` | "…" |
| `waiting_input` | Stands, faces camera | happy/jump | ❓ (click to answer) |
| `blocked/error` | At desk | angry/hurt frames | ❗ red |
| `done` | Celebrate, walk to break room | happy | ✅ + XP popup |
| `evolving` | Center stage | white flash + sprite swap (particle FX) | "X digivolved to Y!" |

Pathfinding: EasyStar.js on the Tiled collision grid.

## 6. UI mockup

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

1. **M0 Assets:** collect and verify licenses; slice sprite sheets; write `roster.json` for about 8 lines.
2. **M1 Office:** Vite + Phaser scaffold, Tiled map renders, camera pan/zoom.
3. **M2 Agents:** spawn Digimon, idle/walk, pathfind to desks.
4. **M3 States and bubbles:** full state machine, emotes, progress bars.
5. **M4 UI:** roster drag-to-hire, agent panel, task board, mock source.
6. **M5 Evolution:** XP, evolve FX, dark-evolution toggle, swap Digimon.
7. **M6 Polish:** Digital World tint, sounds (optional), save layout to localStorage.
8. **M7 (later)** Claude hooks bridge to mod.

## 10. Open questions

- Sprite scale: tiny 16×16 V-Pet look (very retro, every Digimon available), or larger DS sprites (nicer walk cycles, fewer Digimon)?
- Are you OK buying the full LimeZu pack (around $10), or should we stick to free/CC0 only?
- Should the office be a single room or multiple floors (e.g. one floor per evolution stage)?
- Should the hosting target be local only, or a deployed page you can share?
