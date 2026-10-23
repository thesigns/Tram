# Tram

Drive a tram from the motorman's cab, stop on the mark, keep the passengers happy.
Low-poly 3D, a mobile-first browser game. Design: [docs/Tram-GDD.md](docs/Tram-GDD.md).

**Play: https://thesigns.github.io/Tram/**

Status: **M1 vertical slice** – Altstadt Line 1 (8 stops through the old town: hills, a market square,
the city gate, the cathedral square) and a training line; stars and saved progress; notched controller,
tram physics, precision stopping with ratings and combos, interlocked doors, boarding, speed limits
and curves (take one too fast and you derail), passenger comfort, a timetable, tram signals,
street hazards (turning cars, pedestrians, a double-parked van, a cyclist), the bell, request stops,
synthesized sound.

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

Keep to the speed limits (the sign next to the speed; a lower limit ahead is announced) – overspeed
costs points every second, and a curve taken far too fast derails the tram. Depart on time: leaving
early costs more than leaving late. Drive smoothly: jumping notches, stopping on a hard brake
(ease off to B1 just before the tram stops), the emergency brake and fast curves upset the passengers.
The game clock runs 4× faster than real time.

Read the street. Tram signals show a horizontal bar (stop), a dot (about to change) or a vertical
bar (go); a punctual tram rides a green wave. Cars turn across the tracks, people step off the kerb,
vans park too close to the rails and cyclists ride between them – the HUD marks hazards worth
watching. Ring the bell to warn them (not too often). Hitting a person, or a car at speed, ends the run.
At a request stop, stop only if the STOP lamp is lit or people are waiting; otherwise pass through.

Each line gives up to three stars by score, and a perfect-run badge (no penalties, every stop GREAT or
better, always on time). After a crash you may continue from the last stop you served, for 1000 points.

## Layout

```
index.html            game page (Three.js from a CDN via importmap, no bundler)
css/style.css
data/routes/          lines: index.json, and per line the track, stops, signals, hazards, landmarks
docs/                 game design document
js/main.js            game loop, loading lines, camera, menus
js/config.js          tuning: physics, brakes, stop rating, city
js/core/              tram physics, run (stops, score), street (signals, hazards), timetable, comfort,
                      progress, controls, utilities
js/world/             track geometry, speed limits and signs, city, landmarks, sky
js/models/            procedural low-poly models (cab), mesh builder
js/entities/          passengers, traffic
js/audio/             sound synthesized with Web Audio
js/ui/                HUD
assets/models/        place for GLB models from Blender
```

## GitHub Pages

All paths are relative – just enable Pages for the branch that has `index.html` in the root.

## License

[MIT](LICENSE) © 2026 Jakub W. Adamczyk
