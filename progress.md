Original prompt: CREA UN GIOCO WEB FPS ZOMBIE E NON TI DEVI FEMARE FINO A CHE NON HAI CREATO MERAVIGLIA

## Progress

- 2026-03-24: Audited the original prototype. Current project is a static Three.js FPS arena with basic zombies, UI, and restart flow.
- 2026-03-24: Confirmed the browser version runs but Playwright cannot use Pointer Lock in automation, so the implementation will include a debug input adapter plus `window.advanceTime` and `window.render_game_to_text`.
- 2026-03-24: Implementation in progress for the vertical-slice overhaul: modular runtime, authored quarantine yard, enemy archetypes, wave director, stronger HUD, and procedural audio.
- 2026-03-24: Rebuilt the project into a modular vertical slice. Added authored world geometry, wave system, three enemy archetypes, pickup drops, explosive barrels, stronger HUD/overlays, procedural audio, and debug automation hooks.
- 2026-03-24: Verified the new build in browser at `?debug=1&autostart=1&seed=7`, exercised sprint/reload/fire via automation, and ran the `develop-web-game` Playwright client after installing its missing runtime dependencies in the skill environment.
- 2026-03-24: Updated README with run instructions, controls, and debug query params.

## TODO

- Future polish: tune enemy balance and increase visual differentiation between Wave 4 and Wave 5.
- Future polish: add more authored set dressing / decals if the yard needs extra density.
- Future polish: expand debug hooks only if deeper automated combat scenarios are needed later.
