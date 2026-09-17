# StreetBrawl — Coop & Six Stage Campaign

## Baseline

Branch: `feature/coop-six-stage-campaign`
Base main: `9515311a6e81ae3bf650b39530b27b80af313cf7`

Source of truth: `StreetBrawl_prompt_coop_6_livelli.md` supplied for this development pass.

## Architecture

StreetBrawl remains TypeScript + Vite + Canvas 2D on the client. Multiplayer uses a server-authoritative Cloudflare Worker + Durable Object room with WebSocket. Shared campaign, protocol and simulation modules own multiplayer gameplay rules; browser APIs remain presentation/input/audio concerns.

The campaign is data-driven: six stages, sequential encounters, reinforcement waves, narrative landmarks and bosses are configuration. The server owns movement, damage, continues, spawns, encounter progression, pause and boss attacks.

## Feature implementation status

- [x] Six-stage campaign structure and long scrolling stages.
- [x] Solo entry point preserved.
- [x] Co-op room create/join/link flow for up to two players.
- [x] Alex, Matt, Elisa and Gaga selection with authoritative reservation/no duplicates.
- [x] Host-configurable individual continues.
- [x] Server-authoritative movement/combat/damage/spawn/progression/pause.
- [x] Sequential encounters, reinforcement waves and fully off-screen enemy entry.
- [x] Cooperative camera and no friendly-fire targeting.
- [x] Bruno, Roxy, Switch, Rivet, Crane and Dock Master campaign boss slots.
- [x] Roxy/Switch/Rivet/Crane signature telegraph/execute/recover behaviour.
- [x] Imported playable/boss sprite atlases and co-op renderer integration.
- [x] Six distinct narrative environments.
- [x] Intro, inter-stage clues and finale for **StreetBrawl — L'ultima partita**.
- [x] Automatic reconnect attempts with persisted reconnect token and 30-second grace contract.
- [x] Protocol migration path for authoritative facing/action-start synchronization.
- [x] Mobile landscape controls, floating joystick, fullscreen/PWA surfaces retained.
- [x] Browser build CI plus authoritative Worker/shared-simulation typecheck added.

`[x]` here means the requested feature has an implementation in the branch. It does **not** mean every item has passed release-candidate consolidation or real-device/network acceptance.

## Six-stage campaign

1. NEON CORNER — IL QUARTIERE — Bruno
2. NIGHT MARKET — IL MERCATO — Roxy
3. LAST TRAIN — LA METROPOLITANA — Switch
4. BLACK CIRCUIT DEPOT — IL DEPOSITO INDUSTRIALE — Rivet
5. HARBOR RUN — IL PORTO — Crane
6. LAST SHIPMENT — LA NAVE CARGO — Dock Master

The Neon Corner historic arcade cabinet is the stolen object. Black Circuit markings, tournament references, shipment clues, Molo 7 and Container 08 carry the story through the backgrounds and short skippable scenes. The finale returns the cabinet and opens the StreetBrawl Tournament.

## Audio mapping

Existing files are preserved:
- `select-your-hero.mp3`: menu/selection.
- `neon-city-dusk.mp3`: Stage 1.
- `three-note-riff.mp3`: Bruno.
- `harbor-arpeggio.mp3`: Harbor/Stage 5 target theme.
- `final-boss-battle.mp3`: Dock Master.

Missing stage/boss themes intentionally use temporary mappings until original tracks are supplied.

## Consolidation backlog — next pass

These are deliberately separated from feature implementation and must be reviewed before the PR is considered release-ready:

- Replace the placeholder/unverified Worker endpoint with the real deployed backend configuration; do not claim public online play before this is tested.
- Exercise create/join/reconnect with two independent devices/sessions under latency, jitter and packet loss.
- Finish local movement prediction/reconciliation and make authoritative `facing` / `actionStartedTick` mandatory after both client and Worker are migrated together.
- Verify late join only at a safe encounter boundary and improve visible reconnect/grace UX.
- Consolidate procedural combat SFX and soundtrack controls behind one mute/volume policy; deduplicate predicted/confirmed effects.
- Add committed lockfiles, switch CI to `npm ci`, deterministic simulation tests and browser smoke coverage.
- Verify continue/get-up/invulnerability, stage healing, boss balance and six-stage end-to-end progression.
- Verify atlas pivots/cropping/facing and replace temporary legacy fallbacks where necessary.
- Run real Android/iPad landscape/fullscreen/safe-area/PWA tests.
- Measure snapshot payloads and move toward compact deltas/events if network profiling shows it is necessary.

## Verification policy

Public online multiplayer remains **unverified** until a deployed backend has been exercised from separate clients. Automated build/typecheck, browser tests, network-emulated tests and real-device tests must be reported separately. PR #3 stays open and unmerged during consolidation.
