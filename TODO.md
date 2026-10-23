# TODO

What is left to do, in rough order. Tick items off (`[x]`) as they are done; add new ones where they
belong. The design is in `docs/Tram-GDD.md` (milestones in §15), the working rules in `AGENTS.md`.

State (October 2026): M1 done, M2 mostly done – four lines (Training, Altstadt 1, Hafenberg 4,
Neustadt 9), passengers with destinations whose mood is the score, no derailment, an accident ends the
run, points, a single-track section, a lifting bridge, tunnels, wet rails.

## Feedback from playtests (check first)

- [ ] Ask the user for their latest playtest notes and fix those before anything else.
- [ ] Overspeed tuning: speeding hurts steeply between +10% and +30% over the limit (bot: +20% for a
      whole line ≈ 68% satisfaction on Hafenberg). Confirm it feels right on a phone.
- [ ] Emergency brake anger (`PASSENGERS.emergency`, `COMFORT.emergencyKmh`): confirm it is felt but
      not excessive.
- [ ] Neustadt on a phone: are the points (buttons, indicator, HUD prompt) readable? Is the wait at the
      single-track signal (≈ 5 s on average, up to 15 s) too long?
- [ ] Not yet seen on a real phone: Hafenberg (tunnel darkness, bridge signal, "WET RAILS"), the
      passenger bar, the bigger DOORS/BELL buttons, the shorter lever.
- [ ] Landscape: the BELL button (and the points buttons) overlap the bottom of the street view.

## Passengers – polish

- [ ] People getting off walk out of the doors onto the platform (now they just vanish when the doors
      open).
- [ ] Mood visible on the platform: annoyed people shuffle or look at their watch, furious ones wave.
- [ ] A short summary after each stop, e.g. "3 off · 1 annoyed".
- [ ] Check the per-stop "On / off" column and the anger breakdown on the results screen with real runs.

## Lines and tuning

- [ ] Altstadt Line 1 takes ≈ 6.6 min for a careful bot – above the GDD's 3–6 min. Shorten a stretch or
      drop a stop.
- [ ] Altstadt per GDD §8: a narrow single-track section with a passing loop (the mechanics exist –
      `single` in the route data) and a loop terminus at the cathedral square (needs a loop track).
- [ ] Star thresholds are global (`PASSENGERS.stars` 60 / 75 / 90 %) – confirm they suit every line.
- [x] No unlocking: every line is open from the start; stars are a rating per line.
- [ ] More lines per city (GDD: 2–4).

## M2 – remaining

- [ ] Tram types (GDD §9): *Articulated* (1990s, longer, heavier) and *Low-floor* (30+ m, smooth and
      powerful, hard to fit on short platforms). Different mass, length, doors, eye position, cab model;
      `TRAMS` in `js/config.js`. A way to choose them; liveries per city.
- [ ] Variants per line (GDD §8): night (street lamps, lit windows, headlight, darker sky and fog), rain
      (wet rails on the whole line, wipers, droplets), rush hour (more passengers, longer boarding, more
      traffic). Stars per variant?

## M3 – polish (GDD §15)

- [ ] Blender models (GLB) for the trams and landmarks (nose along +Y in Blender → −Z in the game).
- [ ] Stop announcements, mirrors (doors view).
- [ ] Accessibility options (GDD §4.3): continuous lever, assists (braking guide, automatic doors,
      automatic points), left-handed layout.
- [ ] PWA with offline play – only when the user asks for it (see `AGENTS.md`).
- [ ] Daily challenge with a fixed seed; challenges like "no brakes below B2".
- [ ] A sand button for wet rails (GDD §5).

## Tech

- [ ] Put the test bots into the repo (e.g. `tools/bot.mjs`: a scripted driver for any route, with
      variants – careful, no bell, speeder, sloppy stops, leaving early, reckless, late points). So far
      they lived in a session scratchpad and are gone; `AGENTS.md` expects tuning to be checked with bots.
- [ ] Not checked in the browser: the boat passing under the raised bridge leaves; a latecomer walking
      onto a platform during a real run.

## Open questions (GDD §17)

- [ ] Final name (Tram, Ding Ding, Motorman, Next Stop, Last Tram?).
- [ ] Notched lever only, or a continuous mode from the start?
- [ ] Depot pull-out or reversing moves (stub termini), or forward-only?
- [ ] Monetisation: none, or an optional "support" link?
