# Tram

Drive a tram from the motorman's cab, stop on the mark, keep the passengers happy.
Low-poly 3D, a mobile-first browser game. Design: [docs/Tram-GDD.md](docs/Tram-GDD.md).

**Play: https://thesigns.github.io/Tram/**

Status: **M0 prototype** – one test line with 4 stops, notched controller, tram physics,
precision stopping with ratings and combos, interlocked doors, boarding, synthesized sound.

## Running locally

ES modules need an HTTP server (it won't work from `file://`):

```
python -m http.server 8765
```

then open `http://localhost:8765/`. Add `?debug` to the URL for a state readout.

On a phone in the same network, open `http://<computer-IP>:8765/`, or use GitHub Pages.

## Controls

| Touch | Keyboard | |
|---|---|---|
| lever under the right thumb: up | W / ↑ | power (P1–P4) |
| lever: down | S / ↓ | brake (B1–B4) |
| lever: all the way down, past the gap | Space | emergency brake |
| DOORS (left thumb) | E | open / close the doors (only at standstill) |
| BELL | B | bell |
| II | P / Esc | pause |

Stop the tram front on the **H** marker, open the doors, wait for boarding, close the doors and depart.
The closer to the marker, the better the rating (PERFECT ≤ 0.5 m, GREAT ≤ 1.5 m, GOOD ≤ 3 m);
consecutive PERFECT/GREAT stops build a combo.

## Layout

```
index.html            game page (Three.js from a CDN via importmap, no bundler)
css/style.css
data/routes/          routes as JSON: track pieces and stops
docs/                 game design document
js/main.js            game loop, camera, menus
js/config.js          tuning: physics, brakes, stop rating, city
js/core/              tram physics, run logic (stops, score), controls, utilities
js/world/             track geometry, placeholder city, sky
js/models/            procedural low-poly models (cab), mesh builder
js/entities/          passengers
js/audio/             sound synthesized with Web Audio
js/ui/                HUD
assets/models/        place for GLB models from Blender
```

## GitHub Pages

All paths are relative – just enable Pages for the branch that has `index.html` in the root.

## License

[MIT](LICENSE) © 2026 Jakub W. Adamczyk
