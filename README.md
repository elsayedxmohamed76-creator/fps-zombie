# Zombi Craft — by DIEGO.F

Open-world zombie survival FPS built with plain `HTML/CSS/JS` and `Three.js`, set in a vast procedurally-generated landscape with terrain, vegetation, houses, and roads. Explore, survive five escalating waves, and stay alive. — Created by DIEGO.F

## Controls

### Desktop
- `W A S D` or arrow keys: move
- `Mouse`: look
- `Left Click`: automatic rifle
- `R`: reload
- `Shift`: sprint
- `F`: melee shove
- `Esc`: unlock cursor / pause in normal mode

### Mobile (Touch)
- `Left Joystick`: move
- `Swipe (Right side of screen)`: look
- `FIRE Button`: automatic rifle
- `R Button`: reload
- `RUN Toggle`: sprint
- `SHOVE Button`: melee shove
- **Portrait Mode Notice:** The game requires Landscape orientation on mobile devices to play.

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

- **Mobile First Optimization:** Responsive layout, touch controller interface, and orientation management.
- **Atmospheric Open World:** Procedurally-generated terrain, 150+ trees, 60+ bushes, 12 houses, 2 large buildings, roads, streetlights, and the quarantine yard.
- **Enemy Variety:** Three enemy archetypes: `Shambler`, `Runner`, and final-wave `Brute`.
- **Combat Mechanics:** Rifle combat with recoil, tracer fire, hit feedback, reload timing, sprint stamina, and melee shove.
- **Interactables:** Explosive barrels, pickup drops, score/combo tracking, and dynamic UI banners.
- **Audio System:** Procedural WebAudio stingers for weapon fire, impacts, pickups, explosions, wave starts, victory, and failure.

## Technical Notes

- Built with **Vanilla JavaScript** and **Three.js** (No heavy frameworks).
- **GLSL Shaders** used for low-health vignette, damage pulse, and film grain effects.
- **State Management:** Decoupled game loop with scaled delta-time for smooth performance even on low-end devices.

---

*Survival is the only metric of success.*
