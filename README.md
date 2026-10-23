# Tram

Drive a tram from the motorman's cab, stop on the mark, keep the passengers happy.
Low-poly 3D, a mobile-first browser game. Design: [docs/Tram-GDD.md](docs/Tram-GDD.md).

**Play: https://thesigns.github.io/Tram/**

Status: **M1 vertical slice, M2 in progress** – Altstadt Line 1 (8 stops through the old town: hills,
a market square, the city gate, the cathedral square), Hafenberg Line 4 (6 stops from the harbour: the
quay with cranes and ships, wet rails at the fish market, a lifting bridge, a steep climb, a tunnel under
the hill and down to the lighthouse), Neustadt Line 9 (6 stops along a boulevard on a reserved double
track: points to set, a single-track section under a roundabout on a flyover) and a training line;
stars and saved progress; notched controller,
tram physics, precision stopping with ratings, interlocked doors, boarding, speed limits
and curves, ride comfort, passengers who each travel somewhere (their mood is the score), a timetable,
tram signals,
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
| ◄ ▲ ► (before points) | A / ← and D / → | set the points |
| II | P / Esc | pause |

Every passenger travels from one stop to another, and their mood is your score – the bar at the top
right has one segment per passenger on the line: green (calm), yellow (annoyed), red (furious); the
ones aboard are bright. The score is only shown at the end of the line.

Stop the tram front on the **H** marker, open the doors, wait for boarding, close the doors and depart.
The closer to the marker (PERFECT ≤ 0.5 m, GREAT ≤ 1.5 m, GOOD ≤ 3 m), the less the people getting on
and off have to walk. Drive smoothly: jumping notches, stopping on a hard brake (ease off to B1 just
before the tram stops), the emergency brake, curves taken too fast and driving over the limit (the sign
next to the speed; a lower limit ahead is announced) shake the tram – the comfort bar falls, and the
riders get angry while it is low. Be on time: a late tram angers the people waiting for it and the ones
riding to their stop; leave early and somebody running for the tram is left behind (open the doors again
if you see them coming). The game clock runs 4× faster than real time.

Read the street. Tram signals show a horizontal bar (stop), a dot (about to change) or a vertical
bar (go); a punctual tram rides a green wave. Cars turn across the tracks, people step off the kerb,
vans park too close to the rails and cyclists ride between them – the HUD marks hazards worth
watching. Ring the bell to warn them (not too often). Hitting a person, or a car at speed, ends the run.
At a request stop, stop only if the STOP lamp is lit or people are waiting; otherwise pass through –
whoever you carry past their stop is not amused.

On wet rails the wheels slide under B3/B4 and slip under full power from a standstill (orange lamp):
brake earlier with B1–B2 – the emergency brake still bites. Downhill the brakes give less, so start
braking sooner. At the lifting bridge, a blinking dot on the bridge signal means it is about to lift:
cross before the bar comes up, or stop and watch the boat go through – the timetable waits with you.

Each line gives up to three stars by the passengers' average satisfaction (60% / 75% / 90%), and a
perfect-run badge (everybody delivered and calm). Hafenberg opens with 4 stars (`?debug` opens every
line), Neustadt with 7. An accident ends the run – try again from the start.

The emergency brake throws the riders forward: the faster you pull it, the angrier they get – it is
for hazards, never needed if you read the street. Before points, ◄ ▲ ► appear: lit is where the points
lie, the green edge is your line's way. Set them in time – points set wrong trip the emergency brake
just before them. On a single-track section wait at its signal for the tram the other way; drive in on
the stop aspect and you meet it head on.

## Layout

```
index.html            game page (Three.js from a CDN via importmap, no bundler)
css/style.css
data/routes/          lines: index.json, and per line the track, stops, signals, hazards, landmarks
docs/                 game design document
js/main.js            game loop, loading lines, camera, menus
js/config.js          tuning: physics, brakes, stop rating, city
js/core/              tram physics, run (stops, doors), crowd (passengers, score), street (signals,
                      hazards), timetable, comfort,
                      progress, controls, utilities
js/world/             track geometry, speed limits and signs, city, landmarks, tunnels and the
                      lifting bridge (structures), sky
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
