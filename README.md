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

## Digimon World Dusk sprites

The Dusk overworld sprites (extracted from your own ROM, see the extraction runbook) are imported locally. They are **gitignored** and never committed, because the art is © Bandai Namco.

```bash
npm run import-dusk -- path/to/out/sprites/overworld   # → public/assets/packs/dusk (~420 sets)
```

- Sheet layout: frames 0–2 back (idle + walk), 3–5 side facing left (idle + walk), 6 front, 7 crouch, 8 cheer. Right-facing is the left side mirrored. The big 64×64 sets only have frames 0–5.
- **Which set is which Digimon:** `src/data/dusk-map.json` holds the ones identified so far. For the rest, click an agent, choose **Pick … sprite (Digidex)**, and click a sprite. Picks are saved in your browser. **Export picks** downloads them as `dusk-map.json`; drop that file into `src/data/` to make them the defaults.
- **Hire from Digidex…** hires any sprite straight away as a one-form agent.

## Other sprite packs (Mega Man, Pokémon…)

1. Put a sheet in `assets-raw/`, then run `npm run slice -- assets-raw/foo.png --id foo --pack megaman`.
2. Map frame numbers to anims in `public/assets/packs/megaman/foo.json`.
3. Run `npm run pack -- megaman`.

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
