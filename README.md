# DigitalWorld

A virtual office where AI agents are Digimon. They work at desks, hang out on Digi-Farms, and digivolve as they get more senior. See [PLAN.md](PLAN.md) for the full design.

## Run (local)

```bash
npm install
npm run dev        # http://localhost:5173
```

**Controls**
- Drag to pan, scroll wheel to zoom.
- Click a Digimon (or a name in the list) to open its panel.
- `R` / **Roof** cycles on → off → auto. Auto hides the roof when you hover over the office or zoom in.
- `W` / **Walls** cycles full → cutaway → hidden (Sims style).
- **Speed** sets 1× / 2× / 4×. **Dark digivolution** lets agents that fail often take the dark branch, e.g. Greymon → SkullGreymon.

Until real sprites are added, every Digimon is drawn as a coloured placeholder, and the world is a placeholder map built in code (`src/world/map.ts`).

## Adding real sprites (Digimon World Dusk / Dawn / DS)

1. Download sprite sheets from The Spriters Resource (DS → Digimon World Dusk / Dawn / Digimon World DS) and put them in `assets-raw/`.
   If a sheet has many Digimon on it, crop one Digimon per file first.
2. Normalize each sheet into the universal format (uniform frames, feet anchored):
   ```bash
   npm run slice -- assets-raw/veemon.png --id veemon            # frame size auto (multiple of 16)
   npm run slice -- assets-raw/veemon.png --id veemon --frame 32 --bg "#00ff00"
   ```
   This prints each detected frame with its index.
3. Open `public/assets/packs/digimon-dusk/veemon.json` and map frame indices to animations:
   `idle_down/left/right/up`, `walk_down/left/right/up`, `work`, `happy`, `hurt`. Missing ones fall back to idle.
4. Register the pack: `npm run pack -- digimon-dusk`
5. Reload. The `id` must match a form id in `src/data/roster.json`.

Other games (Mega Man, Pokémon…) work the same way. Use `--pack megaman`, and the engine doesn't care which game a sprite came from.

## Layout

```
src/data/        roster.json (evolution lines), types
src/world/       map (placeholder world + pathfinding), sprites (packs + placeholders)
src/agents/      Agent: state machine, movement, bubbles, digivolution
src/sources/     events.ts (the event contract), MockSource (fake activity)
src/scenes/      OfficeScene: world, camera, roof/wall toggles
src/ui.ts        HUD: hire, agent panel, task board
tools/           slice.mjs, pack.mjs
```

Digimon is © Bandai / Toei. This is a personal, non-commercial fan project.
