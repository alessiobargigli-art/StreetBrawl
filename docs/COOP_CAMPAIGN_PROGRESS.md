# StreetBrawl — Coop & Six Stage Campaign

## Baseline

Branch: `feature/coop-six-stage-campaign`
Base main: `9515311a6e81ae3bf650b39530b27b80af313cf7`

Source of truth: `StreetBrawl_prompt_coop_6_livelli.md` supplied for this development pass.

## Architecture

StreetBrawl remains TypeScript + Vite + Canvas 2D on the client. The multiplayer target is a server-authoritative Cloudflare Worker + Durable Object per room using WebSocket. Browser-only APIs remain presentation/input/audio concerns. Shared deterministic data/protocol modules will contain character, stage, encounter and network contracts.

The campaign is data-driven: six stages, encounter queues, safe join boundaries, narrative checkpoints, boss definitions and temporary music mappings are configuration rather than hard-coded stage switches.

Network target: fixed simulation tick, sequenced input batches, compact snapshots/deltas, event IDs for one-shot audiovisual events, client interpolation plus limited local-player prediction/reconciliation. No client is authoritative for damage, health, continues, spawns or progression.

## Delivery phases

- [~] A — regression verification, audio/mute consolidation, tests, shared simulation/presentation boundary.
- [ ] B — Worker/Durable Object backend, protocol, rooms and two-client verification scenario.
- [ ] C — Alex/Matt/Elisa/Gaga selection, individual continues, reconnect, authoritative pause.
- [ ] D — encounter entry lanes, cooperative camera, data-driven level structure; validate one full level.
- [ ] E — all six stages, bosses and environmental narrative.
- [ ] F — scenes/finale, audio polish, balance, mobile UX.
- [ ] G — complete solo + coop campaign verification and release candidate.

Legend: `[x]` implemented and verified; `[~]` in progress/implemented but not fully verified; `[ ]` not complete.

## Current verification

### Implemented before this branch
- Two-stage Canvas beat-em-up vertical slice.
- Existing mobile floating joystick/actions and PWA shell.
- Five uploaded soundtrack files and corrected runtime paths.
- Existing procedural combat/progression SFX.

### Known gaps confirmed at branch start
- `package.json` is still version `0.1.0` while UI reports `1.0.0-audio`.
- CI uses `npm install` and only runs build; no automated tests/smoke.
- Audio is split: progression SFX use `AudioManager`, while existing `Game` combat synthesis is not yet guaranteed to obey the same global SFX volume/mute control.
- Scene audio polling currently reads private Game runtime state through an unsafe cast; replace with a public typed presentation snapshot/event boundary.
- No authoritative multiplayer backend yet.
- Campaign is not yet six data-driven stages.

## Six-stage campaign target

1. NEON CORNER — IL QUARTIERE — Bruno
2. NIGHT MARKET — IL MERCATO — Roxy
3. LAST TRAIN — LA METROPOLITANA — Switch
4. BLACK CIRCUIT DEPOT — IL DEPOSITO INDUSTRIALE — Rivet
5. HARBOR RUN — IL PORTO — Crane
6. LAST SHIPMENT — LA NAVE CARGO — Dock Master

Story: **StreetBrawl — L'ultima partita**. The Neon Corner historic arcade cabinet is the recurring stolen object; Black Circuit markings, tournament posters, shipment clues, Molo 7 and container 08 must carry the story through the environments.

## Character target

- Alex (uomo): balanced.
- Matt: agile, lower endurance.
- Elisa: durable/heavy, slower recovery.
- Gaga (uomo): kick specialist, slightly longer reach.

Character reservation is authoritative in online rooms; duplicates are not allowed within the same room.

## Audio mapping

Existing files are preserved:
- `select-your-hero.mp3`: menu/selection.
- `neon-city-dusk.mp3`: Stage 1.
- `three-note-riff.mp3`: Bruno.
- `harbor-arpeggio.mp3`: Stage 5.
- `final-boss-battle.mp3`: Dock Master.

Missing stage/boss themes will use documented temporary mappings until original tracks are supplied. Development must not wait for those tracks.

## Verification policy

Do not mark public online multiplayer as verified until a deployed backend has been exercised from separate clients. Keep automatic tests, emulated-browser tests and real-device tests distinct. The PR must remain unmerged until the requested acceptance work is complete or remaining external provisioning blockers are explicitly documented.
