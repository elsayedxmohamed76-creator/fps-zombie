# FPS Zombie: Meraviglia

Arcade-first zombie FPS built with plain `HTML/CSS/JS` and `Three.js`, set inside a quarantined industrial yard at sunset. The current build is a vertical slice with authored combat space, five escalating waves, procedural audio, pickup drops, explosive barrels, and a debug harness for browser automation.

## Controls

- `W A S D` or arrow keys: move
- `Mouse`: look
- `Left Click`: automatic rifle
- `R`: reload
- `Shift`: sprint
- `F`: melee shove
- `Esc`: unlock cursor / pause in normal mode

## Run Locally

Open the project with any static file server. One simple option:

```powershell
python -m http.server 4173
```

Then visit:

- Normal game: `http://127.0.0.1:4173/`
- Debug / automation mode: `http://127.0.0.1:4173/?debug=1&autostart=1&seed=7`

## Debug APIs

The game exposes lightweight browser hooks for testing and automation:

- `window.render_game_to_text()`
- `window.advanceTime(ms)`
- `window.__fpsZombieDebug.reset(seed?)`
- `window.__fpsZombieDebug.setInput({ forward, backward, left, right, sprint, fire, reload, melee, lookX, lookY })`

`debug=1` disables the pointer-lock requirement and is intended for deterministic stepping / automation. `autostart=1` skips the intro overlay, and `seed=<number>` fixes spawn order for repeatable runs.

## Current Slice Features

- Authored quarantine-yard arena with cover, vehicles, floodlight towers, dust, and readable combat lanes
- Three enemy archetypes: `Shambler`, `Runner`, and final-wave `Brute`
- Rifle combat with recoil, tracer fire, hit feedback, reload timing, sprint stamina, and melee shove
- Explosive barrels, pickup drops, inter-wave resupply moments, score/combo tracking, and victory/game-over overlays
- Procedural WebAudio stingers for weapon fire, impacts, pickups, explosions, wave starts, victory, and failure

## Notes

- The project is desktop-first and tuned for keyboard + mouse.
- Mobile support, persistent progression, and external asset packs are intentionally out of scope for this slice.
