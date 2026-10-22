# AGENTS.md

Guidance for AI agents working on this repository. The game design is in `docs/Tram-GDD.md`; controls and layout are in `README.md`.

## Project overview

Tram is an arcade tram-driving game played from the motorman's cab: drive along the rails, stop precisely on the marker at each platform, run the doors, depart. Low-poly 3D, a mobile-first browser game (portrait first, landscape supported). The target host is GitHub Pages. Current state: **M0 prototype** (GDD §15) – one test line, lever, physics, precision stops, doors, basic HUD and sound.

## Technical rules

- **Vanilla JS + ES modules, no bundler and no npm.** Three.js `0.160.0` is loaded from jsDelivr via the `importmap` in `index.html`. Don't add a build step or `package.json` unless explicitly asked.
- **`index.html` must stay in the repo root.** Everything else goes into subfolders. All paths are relative (GitHub Pages serves from a subdirectory).
- **No PWA** (manifest, service worker) until the user asks for it.
- Everything is **in English**: UI text, code comments, docs.
- Code style: 2 spaces, semicolons, single quotes, brief comments only where something isn't obvious. Scratch objects used in hot loops live at module level (no per-frame allocation).
- Gameplay tuning (physics, brakes, stop rating, city) belongs in `js/config.js`, not in scattered numbers. Values must stay consistent with the GDD (§5 table: P4 0→50 km/h ~15 s, B4 stop from 50 km/h ~60 m, EB ~35 m).
- Routes are data: `data/routes/*.json` – track pieces (`straight`, `curve` with radius / angle / dir, optional `grade` in %) and stops by distance `s`.

## Conventions

- Units: meters, seconds, radians. Y is up.
- **The track is the backbone.** Everything is positioned by `s` (distance along the route) and a lateral offset. `Track.at(s, off)` returns position, heading, curvature and grade. Heading 0 = forward along −Z, positive curvature turns right, positive offset = right of the track. An object facing along the track has `rotation.y = −heading`.
- `tram.s` is the position of the **tram front**. The stop marker `stop.s` is where the front should stop; doors are listed as distances behind the front.
- Notches: `EB = -5`, `B4..B1 = -4..-1`, `N = 0`, `P1..P4 = 1..4`.
- `js/core/tram.js`, `js/core/run.js` and `js/world/track.js` don't import Three.js, so they can be tested in Node (`node` with `import()` of the module files).
- The cab is a separate scene rendered after `renderer.clearDepth()`; the driver's eye is at (0,0,0) in cab space. The cab follows the body heading; the view turns slightly into curves (`VIEW.lookAhead`).
- Static city geometry is merged per chunk (`CITY.chunk` m of track), one draw call each, hidden beyond `CITY.drawAhead`.
- Simulation runs at a fixed 60 Hz step; rendering interpolates `s` between steps.

## Mobile view and controls

- `resize()` in `js/main.js` handles both orientations: the optical centre is moved up with `camera.setViewOffset` (35% from the top in portrait), so the street is above and the cab with the thumbs is below.
- The master controller (`js/core/input.js`) uses relative drag with notches and haptic ticks; EB sits below an extra gap (a detent). `input.layout()` must run while the lever is visible (it measures the element).
- Doors are interlocked (GDD §4.1): they open only at standstill and traction is cut while they are open.

## Testing

- Start a server with `python -m http.server 8765`. **Don't use port 8080** (another app's service worker on the user's machine).
- The browser caches modules served by `http.server`: hard-reload (Ctrl+Shift+R) after changes, or use a server that sends `Cache-Control: no-store`.
- `?debug` shows a state readout and exposes `window.tram = { game, tram, run, track, input, sound, camera }`. Measure with console scripts (stopping distances, ratings) instead of judging by eye.
- To check the phone layout, inject a 390×780 (portrait) and an 844×390 (landscape) `<iframe>` into a page from the same server – a page that doesn't run the game itself.
- Test on a real phone early (GDD §15).
- The console must stay clean.
