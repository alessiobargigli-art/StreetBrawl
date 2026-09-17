# StreetBrawl — Coop & Six Stage Campaign

## Baseline

Branch: `feature/coop-six-stage-campaign`
Base main: `9515311a6e81ae3bf650b39530b27b80af313cf7`

Source of truth: `StreetBrawl_prompt_coop_6_livelli.md` supplied for this development pass.

## Architecture

StreetBrawl remains TypeScript + Vite + Canvas 2D on the client. Multiplayer uses the server-authoritative Cloudflare Worker + Durable Object room scaffold with WebSocket. Browser-only APIs remain presentation/input/audio concerns. Shared deterministic campaign, protocol and simulation modules own multiplayer gameplay rules.

The campaign is data-driven: six stages, sequential encounters, reinforcement waves, narrative landmarks and boss definitions are configuration rather than separate game implementations. The server owns movement, damage, continues, spawns, encounter progression, pause and boss attacks.

## Delivery phases

- [~] A — regression verification, audio/mute consolidation, tests, shared simulation/presentation boundary.
- [~] B — Worker/Durable Object backend, protocol and rooms implemented; deployed two-device verification still required.
- [~] C — Alex/Matt/Elisa/Gaga reservation, individual continues and authoritative host settings implemented; reconnect UX still requires completion.
- [~] D — off-screen enemy entry, sequential encounters, reinforcement waves and cooperative camera implemented; full-level browser verification still required.
- [~] E — six stages configured, imported boss/playable atlases, Roxy/Switch/Rivet/Crane authoritative signature AI and six distinct narrative environments implemented; full campaign verification pending.
- [ ] F — scenes/finale, unified audio polish, balance and final mobile UX.
- [ ] G — complete solo + coop campaign verification and release candidate.

Legend: `[x]` implemented and verified; `[~]` in progress/implemented but not fully verified; `[ ]` not complete.

## Implemented on this branch

- Six long stages: Neon Corner, Night Market, Last Train, Black Circuit Depot, Harbor Run and Last Shipment.
- Four selectable/reserved playable characters: Alex, Matt, Elisa and Gaga.
- Imported transparent PNG sprite atlases + JSON metadata for all four playables and Roxy/Switch/Rivet/Crane.
- Co-op renderer selects character/boss atlas at runtime and preserves animation state between snapshots.
- Server-authoritative individual continues and host lobby settings.
- Server-authoritative pause/start controls and lobby host migration.
- Sequential encounter gating: the next encounter cannot start while the current encounter is active.
- Reinforcement waves are now executed from campaign data.
- Enemy entry is from outside the visible camera and remains in `entering-*` until the enemy crosses the visible boundary.
- Roxy combo, Switch dash, Rivet AOE slam and Crane wide sweep use authoritative telegraph/execute/recover phases.
- Telegraph overlays expose dangerous areas; Crane's sweep includes a clearly marked co-op safe zone.
- Distinct campaign backgrounds carry Black Circuit / Neon Corner clues through Night Market, Last Train, Depot, Harbor and cargo ship environments.

## Six-stage campaign

1. NEON CORNER — IL QUARTIERE — Bruno
2. NIGHT MARKET — IL MERCATO — Roxy
3. LAST TRAIN — LA METROPOLITANA — Switch
4. BLACK CIRCUIT DEPOT — IL DEPOSITO INDUSTRIALE — Rivet
5. HARBOR RUN — IL PORTO — Crane
6. LAST SHIPMENT — LA NAVE CARGO — Dock Master

Story: **StreetBrawl — L'ultima partita**. The Neon Corner historic arcade cabinet is the recurring stolen object; Black Circuit markings, tournament posters, shipment clues, Molo 7 and container 08 carry the story through the environments.

## Audio mapping

Existing files are preserved:
- `select-your-hero.mp3`: menu/selection.
- `neon-city-dusk.mp3`: Stage 1.
- `three-note-riff.mp3`: Bruno.
- `harbor-arpeggio.mp3`: Stage 5 target mapping.
- `final-boss-battle.mp3`: Dock Master.

Missing stage/boss themes use documented temporary mappings until original tracks are supplied. Development does not wait for those tracks.

## Remaining acceptance work

- Replace the placeholder/unverified Worker endpoint with an explicitly configured deployed backend URL before claiming public online play.
- Exercise create/join/reconnect from two independent browser/device sessions under latency/jitter/drop.
- Add local prediction/reconciliation for the controlled player and compact/event-based network payload improvements.
- Complete reconnect UI/grace flow and safe-boundary late join.
- Consolidate procedural combat SFX and soundtrack controls behind one mute/volume policy and prevent duplicate predicted/confirmed SFX.
- Add lockfile + `npm ci`, automated deterministic simulation tests and browser smoke coverage.
- Complete intro/inter-stage/finale presentation, balance and real mobile landscape/safe-area verification.

## Verification policy

Do not mark public online multiplayer as verified until a deployed backend has been exercised from separate clients. Keep automatic tests, emulated-browser tests and real-device tests distinct. The PR remains unmerged until acceptance work is complete or remaining external provisioning blockers are explicitly documented.
