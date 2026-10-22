# Tram – Game Design Document

*Working title. Version 0.2 – 2026-10-22 (consistency pass: braking, keyboard, doors, timetable).*

## 1. Overview

**Tram** is an arcade tram-driving game played from the motorman's cab. The player drives a tram through fictional low-poly cities, stops precisely at platforms, keeps to the timetable, gives passengers a smooth ride and deals with city traffic. It is a mobile-first browser game, played primarily in portrait with one thumb on the controller lever.

| | |
|---|---|
| Genre | Arcade driving / light simulation |
| Platform | Web browser, phones first (Android Chrome, iOS Safari), desktop as a bonus |
| Orientation | Portrait first, landscape supported |
| Session | A single run takes 3–6 minutes |
| Visual style | Low-poly, flat-shaded 3D, cab view |
| Tech | Vanilla JS + Three.js, no build step, hosted on GitHub Pages |

### Elevator pitch

*Hold the lever, read the street, stop on the mark.* Every stop is a small skill test: brake too late and you overshoot the platform, brake too hard and the passengers fall over, linger too long and you are behind schedule. Between stops, the city happens: cars cut across the tracks, pedestrians step out, lights turn red and the next curve has a speed limit.

### Why a tram

The predecessor prototype (*Jasta 11*, a WWI dogfight game) showed that free 3D flight with a two-axis stick is hard to control on a phone. A tram is the opposite: the vehicle steers itself along the rails, so the player controls **a single axis** (power / brake). The challenge comes from decisions and timing, not finger dexterity.

## 2. Design pillars

1. **One thumb, one lever.** The core driving needs only the master controller. Everything else (doors, bell, junctions) is a tap.
2. **Every stop is a skill shot.** Precision stopping is the heartbeat of the game and must feel great: clear marker, readable distance, satisfying rating.
3. **A living street.** The city reacts and gets in the way: traffic, pedestrians, signals. Reading the street ahead is the real skill.
4. **Smooth is fast.** Gentle acceleration and braking are rewarded; jerky driving costs score. Good players drive like real motormen.
5. **Short and replayable.** Runs are short, scored with stars, and invite "one more try".

## 3. Core loop

```
Choose a line/run → Depart → Drive (limits, signals, hazards) → Approach stop → Stop on the mark
      ↑                                                                              ↓
 Unlocks ← Results (stars, score) ← Terminus ← … next stop ← Depart on time ← Doors open / passengers board / doors close
```

**Within a run:** depart → accelerate → cruise and react → brake into the stop → doors → depart. There are 6–10 stops per run.

**Across runs:** stars unlock new lines, cities, trams, weather and night shifts.

## 4. Controls

### 4.1 Touch (portrait, primary)

```
┌─────────────────────────┐
│ HUD: next stop, clock,  │
│ speed, limit            │
│                         │
│      CAB VIEW (3D)      │
│                         │
│                         │
├─────────────────────────┤
│ [DOORS]       ┃ P4 ┃    │
│ [BELL]        ┃ …  ┃    │
│ [◄ ▲ ►]       ┃ N  ┃ ←lever
│ junction      ┃ B… ┃    │
│               ┃ EB ┃    │
└─────────────────────────┘
  left thumb    right thumb
```

- **Master controller (right thumb):** a vertical lever. Push up = power, centre = neutral (detent), pull down = brake. Proposed notches: `P1–P4` power, `N`, `B1–B4` service brake, `EB` emergency brake at the bottom (needs a deliberate pull past a detent). The lever stays where it is released, like a real controller. Haptic tick on each notch (`navigator.vibrate`, where supported).
- **Doors (left thumb):** one button toggles open/close. The doors always open on the platform side, so there is no side to pick. They are interlocked like on a real tram: they open only at standstill, and traction is cut while any door is open (dashboard light plus a beep if the lever is in power), so the tram cannot depart until the doors are closed. Opening them away from a platform (at a red light, in traffic) is a penalty.
- **Bell:** warns pedestrians and cars. It makes some hazards clear the track sooner, but spamming it costs passenger mood.
- **Junction selector:** before a switch, arrows appear (◄ ▲ ►). The player sets the route, as real drivers do with a switch controller. A wrong choice causes a short detour and a time loss.

### 4.2 Landscape and desktop

- **Landscape:** the lever on the right edge, buttons on the left edge, a wider cab view.
- **Keyboard:** W/S or ↑/↓ move the lever one notch, Space for emergency brake, A/D or ←/→ step the junction selection one position left or right (◄ ▲ ►), E for doors, B for the bell.

### 4.3 Accessibility options

- Lever mode: *notched* (default) or *continuous*.
- Assist level: braking-point guide line on the track, automatic doors, automatic switches (for casual play).
- Left-handed layout (mirrored).

## 5. Driving model

The tram runs along a track centreline, so its position is a single number `s`, the distance along the route.

- **Traction:** force from the power notch; it is constant up to a base speed and then falls off, like a real traction motor.
- **Resistance:** rolling and aero drag, plus the gradient component (`g · sin θ`). Hills matter.
- **Brakes:** service brake B1–B4 ≈ 0.4 / 0.8 / 1.2 / 1.6 m/s² (B4 is a little above a real tram's ~1.3 m/s², for arcade pacing); emergency brake ~2.8 m/s² (magnetic track brake), with an extra comfort and score penalty.
- **Adhesion:** a wet or leafy rail lowers the available grip. Too much power or brake causes wheel slip or slide (warning light plus sound). A **sand** button could be added later.
- **Mass:** each tram type has a different mass, so different inertia and braking distances. That is the main "feel" difference between vehicles.
- **Jerk:** the rate of change of acceleration drives the **comfort meter**. Moving smoothly through the notches keeps passengers happy.
- **Curves:** each curve has a safe speed. Over it, there is wheel squeal and a comfort penalty; far over it (arcade threshold, e.g. +40%), the tram **derails** and the run fails.

Target feel: close to a real tram, compressed slightly for arcade pacing (the numbers below already include that):

| Manoeuvre | Rate | Distance | Time |
|---|---|---|---|
| Accelerate 0→50 km/h (P4) | ~0.9 m/s² average | ~105 m | ~15 s |
| Full service stop from 50 km/h (B4) | 1.6 m/s² | ~60 m | ~9 s |
| Emergency stop from 50 km/h (EB) | 2.8 m/s² | ~35 m | ~5 s |

A normal stop is a long, readable approach, which is what makes precision stopping a skill. The emergency brake is for hazards, not for platforms.

## 6. Stops and scoring

### 6.1 Precision stopping

- Each platform has a **stop marker** for the front door (or cab).
- On approach, the HUD shows the distance to the marker in metres, switching to a precision bar for the last 20 m.
- Rating by the final error:

| Error | Rating | Points |
|---|---|---|
| ≤ 0.5 m | PERFECT | 1000 |
| ≤ 1.5 m | GREAT | 700 |
| ≤ 3 m | GOOD | 400 |
| doors still on the platform | OK | 150 |
| doors off the platform | MISSED | 0, and the tram must reposition (time loss) |

- A **combo** for consecutive PERFECT/GREAT stops multiplies the score.
- **Request stops:** at some stops nobody is waiting and nobody pressed the stop button, so the player may pass through. That is a time bonus, but only if they read the cues correctly (stop light on the dashboard, people on the platform). Skipping a stop someone requested is a penalty.

### 6.2 Timetable

- Each stop has a scheduled departure time. Game time runs faster than real time (≈ ×4), so a 2:00 timetable segment takes ~30 s of play. The timetable, the HUD clock and the schedule delta are all in **game time**, and so are the tolerances below (real-time equivalents in brackets).
- The tram **departs** when it starts moving after the doors have closed.
- **Punctuality:** departing between 0:05 early and 0:30 late (≈ 1 s early to 8 s late in real time) counts as on time and scores full points. Departing later is a penalty that grows with the delay. **Departing early** (more than 0:05) is a bigger penalty, because passengers get left behind. The window is asymmetric on purpose: waiting for the departure time is always in the player's hands, while recovering a delay often is not.
- The HUD shows the delta to schedule (`+0:12`, `−0:05`) and, while the tram is at a stop, a countdown to departure.

### 6.3 Passengers and comfort

- A comfort meter (0–100) falls with jerk, emergency braking, curve overspeed and hard door closing.
- Boarding is a short animation (simple low-poly people). Closing the doors too early, while people are still boarding, costs points.
- End of run: **passenger rating** from average comfort plus incidents.

### 6.4 Penalties and fails

| Event | Result |
|---|---|
| Overspeed vs. limit | Penalty per second over |
| Running a red tram signal | Large penalty |
| Collision with a car | Large penalty; above a speed threshold, run failed |
| Hitting a pedestrian | **Run failed.** The game avoids gore: the screen fades and a "Run ended" card appears. |
| Derailment | Run failed |
| Doors opened away from a platform | Penalty |

### 6.5 Stars

Each run gives 1–3 stars from total score thresholds, plus a "perfect run" badge (no penalties, all stops GREAT or better).

## 7. The street: traffic and hazards

Hazards are scripted per route (placed at points along the track) with some randomness, so runs feel alive but stay fair and learnable.

- **Traffic lights / tram signals** at intersections, with a simple tram-signal aspect (stop / go / about to change).
- **Cars:** turning left across the tracks, pulling out of side streets, double-parked too close to the rail (wait or ring the bell).
- **Pedestrians:** jaywalkers stepping out, crowds at crossings, someone running for the tram (wait for them? a small bonus).
- **Cyclists** riding in the track zone.
- **Other trams:** a tram ahead at a busy stop or a single-track section with a **passing loop** where you must wait for the oncoming tram (a signal controls it).
- **Special events:** a delivery truck blocking the track (stop and wait), a broken-down car, a parade or market day (slow zone).

Telegraphing rule: every hazard must be **visible early** (people looking at the road, a car's indicator blinking, brake lights), so a good player can anticipate it rather than react to surprises. In numbers: a hazard's cue must be readable at least one full service stop plus ~2 s ahead at the current limit (~90 m at 50 km/h), so it can always be handled without the emergency brake. Fog and draw distance must never hide that zone.

## 8. Cities and routes

Fictional cities give freedom to design routes as levels, each with a strong identity and a mix of challenges. Ideas for the first cities:

1. **Altstadt (old town)**, the tutorial city. Cobbled streets, narrow single-track section with a passing loop, tourists, slow limits, a cathedral square loop terminus. Teaches the lever, stops and the bell.
2. **Hafenberg (port and hills).** Steep gradients (power management uphill, braking downhill), hairpin curves with tight limits, a **lifting bridge** over the harbour (it opens: wait or race the warning lights), rain-slick rails near the sea.
3. **Neustadt (new town).** Fast reserved track along a boulevard, long straights, high limits, traffic-light timing ("green wave" bonus), a tunnel under a roundabout, an articulated low-floor tram that is long and hard to fit on short platforms.
4. Later ideas: a **river city** with bridges and an island, a **winter city** (snow, low adhesion), an **interurban line** leaving the city through fields to a lakeside resort (high speed, then village street-running).

Each city has 2–4 **lines**, and each line has variants: **day / night / rain / rush hour**. Rush hour means more passengers, longer boarding and more traffic.

Route features to mix in: loop termini, stub termini (with a double-ended tram, so the player switches cabs), junctions, depot exit/entry runs, gradients, tunnels, bridges, single-track sections, mixed traffic vs. reserved track, stops on islands vs. kerbside stops (passengers crossing the road).

## 9. Progression and content

- **Career:** cities unlock in sequence by total stars; lines within a city unlock one after another.
- **Trams** (fictional, inspired by real types):
  - *Classic* (1960s high-floor, inspired by Konstal 13N / 105N): light, lively, harsh brakes, short.
  - *Articulated* (1990s): longer and heavier.
  - *Low-floor* (modern, 30+ m): smooth and powerful, but very long, which makes precise stopping harder.
  - Liveries per city.
- **Challenges:** "no brakes below B2", "perfect comfort", "night run with a failed headlight"… Optional daily challenge with a fixed seed (later).

## 10. Camera and presentation

- **Cab view**, the motorman's seat. The windshield frame and dashboard form the lower part of the screen in portrait, so the HUD and thumbs live there naturally.
- In portrait, the optical centre sits in the upper ~35% of the screen, so more street is visible ahead (technique proven in *Jasta*: `camera.setViewOffset`).
- The camera **looks slightly into curves** and leans subtly with acceleration and braking for physical feel.
- **Dashboard (3D):** speedometer, notch indicator, clock, door status, stop-request light, slip warning.
- **Mirrors:** a small rear-view viewport for doors and boarding (later, nice to have).
- Optional **replay / outside camera** at the end of a run (later).

## 11. HUD

Kept minimal and diegetic where possible.

- Top: **next stop name**, distance to the marker, schedule delta (a departure countdown while at a stop), clock.
- Speed and current **speed limit** (also as a lineside sign in the world).
- Comfort meter and score / combo.
- Contextual prompts: junction arrows, "Doors", stop rating popups (PERFECT!), hazard warning icon when something is about to enter the track.

## 12. Audio

Synthesised with Web Audio where possible (the *Jasta* approach, no audio files to start with), with samples later if needed.

- **Traction motor** whine that rises in pitch with speed, plus a power/brake transition sound.
- Rail joints clickety-clack, curve **wheel squeal**, brake hiss and air compressor.
- **Bell** (ding ding), door chime and door motor, passenger murmur.
- City ambience: traffic, horns, birds in parks, rain.
- **Stop announcements:** chime + on-screen name, optionally spoken via the Web Speech API (fun with fictional names).

## 13. Visual style

- Low-poly, flat-shaded, a limited palette per city (warm old town, grey-blue port, bright new town).
- Fog for draw distance and mood. Time-of-day lighting (day / dusk / night with street lamps and lit windows).
- City blocks generated along the track from a seed (facades, shops, trees), with hand-placed **landmarks** (cathedral, bridge, port cranes) for identity.
- Trams and landmarks modelled in **Blender** and exported as GLB (nose along +Y in Blender becomes −Z in game). Procedural placeholders first.

## 14. Technical design

### 14.1 Stack

- Vanilla JS, ES modules, Three.js via `importmap` from a CDN. No bundler and no npm (same as *Jasta*).
- `index.html` in the repo root; everything else in folders. Relative paths for GitHub Pages.
- English everywhere: UI, code, comments, docs.

### 14.2 Track and route data

- A route is authored as **data (JSON)**: a "turtle" list of track pieces (`straight 120 m`, `curve R25 left 90°`, `grade +4% 200 m`), plus objects placed by distance `s`: stops, signals, limits, junctions, hazards, landmarks.
- At load, pieces are converted to a centreline with an **arc-length table**, so `s → position, tangent, curvature, grade` is a fast lookup.
- Junctions form a **graph** of track segments; the route's planned path is a sequence of segments.
- City geometry is generated in **chunks** along the track and streamed in and out by distance. Buildings are instanced or merged per chunk to keep draw calls low.

### 14.3 Simulation

- A fixed-step simulation (e.g. 60 Hz) for the tram: notch → force → acceleration → `v`, `s`. Track jerk for comfort.
- Hazards and traffic are simple agents on lanes or paths with scripted triggers (activate when the tram is N metres away) and state machines.
- A `?debug` URL flag exposes state for measuring and tuning (proven useful in *Jasta*).

### 14.4 Performance targets

- 60 fps on a mid-range Android phone; adaptive pixel ratio.
- < 150 draw calls; aggressive fog, chunk culling and instancing.
- First load < 3 MB.

### 14.5 Saving

- Progress (stars, unlocks, options) in `localStorage`, wrapped in try/catch. No accounts.

## 15. Scope and milestones

### M0 – Prototype (prove the fun)

- One straight-ish test route with 4 stops, flat ground, placeholder city boxes.
- Lever (notched), physics, stop marker plus precision rating, doors.
- Cab view in portrait and landscape, basic HUD, motor sound.
- **Test on a real phone in week one** (lesson from *Jasta*).
- **Success criterion:** stopping on the mark feels satisfying and is learnable in 2–3 tries.

### M1 – Vertical slice

- Altstadt line 1 (8 stops), curves with limits, gradients, timetable, comfort.
- Traffic lights, 3–4 hazard types, bell, request stops.
- Results screen with stars, local save.

### M2 – Content and depth

- Hafenberg and Neustadt, junctions, passing loop, lifting bridge, tunnel.
- Second and third tram types, night and rain variants.

### M3 – Polish

- Blender models, announcements, mirrors, accessibility options, PWA (offline play), daily challenge.

## 16. Risks

| Risk | Mitigation |
|---|---|
| Driving feels boring between stops | Dense stop spacing, hazards, speed-limit play, green-wave bonuses; tune the timetable to be tight |
| Precision stopping too hard or too easy | Tune braking curves and rating windows; assist guide line; playtest on phones early |
| City generation too costly in time or performance | Simple facade kit, chunk streaming, fog; hand-place only landmarks |
| Hazards feel unfair | Strict telegraphing rule; scripted placement plus small randomness |
| Long trams don't fit the portrait view | Mirror viewport or end-of-platform indicator on the HUD |

## 17. Open questions

1. Final name? (Candidates: *Tram*, *Ding Ding*, *Motorman*, *Next Stop*, *Last Tram*.)
2. Notched lever only, or offer the continuous mode from the start?
3. How punishing are fails? Restart the run, or restart from the last stop?
4. Should the player ever drive the depot pull-out or a reversing move (stub terminus), or keep everything forward-only?
5. Passengers as a resource (capacity, crowding) or purely cosmetic plus rating?
6. Stylised fictional country (consistent signage language and names) – e.g. Central European flavour?
7. Monetisation: none (hobby project), or an optional "support" link?

## Appendix A: Carry-over from *Jasta 11*

Reusable ideas and code (repo: `thesigns/Jasta`):

- Renderer setup, fog, sky dome, adaptive pixel ratio, separate cockpit scene rendered after `clearDepth()`.
- `MeshBuilder` (merge primitives into one vertex-coloured geometry, one draw call per model).
- Portrait/landscape camera with `setViewOffset`; touch slider and Pointer Events input; HUD canvas.
- Web Audio synthesis patterns (engine drone, noise bursts).
- Practical lessons: device-orientation sensors need HTTPS; Chrome caches modules served by `http.server` (hard-reload); avoid `localhost:8080` (another app's service worker on the dev machine); tune gameplay with measurements via `?debug`, not by eye.
