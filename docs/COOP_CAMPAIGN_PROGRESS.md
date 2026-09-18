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
- [x] Solo and co-op now share the six-stage authoritative campaign simulation.
- [x] Solo character selection for Alex, Matt, Elisa and Gaga.
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

## Independent blocker remediation

The independent release-readiness review identified four blockers. The branch now contains targeted fixes for each:

- **B01 repeated co-op game construction:** lobby-to-game transition is idempotent and `CoopGame.stop()` detaches its client listener.
- **B02 paused room after host loss:** the original host keeps authority during reconnect grace; after grace expires, the remaining connected player becomes host and can resume.
- **B03 protocol/phase validation:** Worker messages are runtime-validated, lobby-only commands are phase-gated, gameplay input is accepted only while playing, and the shared simulation now enforces the same core invariants.
- **B04 solo campaign mismatch:** `GIOCA SOLO` now selects one of the four protagonists and runs the same six-stage `AuthoritativeSimulation` locally through `LocalCampaignClient` and the shared campaign renderer.

The simulation hardening pass also removes the right-edge clamp that could spawn reinforcements inside the viewport and uses the shared protocol version constant in snapshots.

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

## Second-review regression remediation

- Lobby snapshots no longer start gameplay; only non-lobby authoritative phases can cross the lobby/game boundary.
- Connection attempts now settle on pre-welcome close, timeout, cancellation and socket replacement.
- Hurt/down/get-up/KO transitions invalidate active and queued attacks.
- Online story order is room-authoritative: opening starts server-side with gameplay paused, consecutive scenes are queued by the room, reconnect receives the active scene, and scene completion waits for reconnect-grace participants until they return or expire.
- Manual pause and narrative pause are derived from active causes in both online and local campaign paths.
- Initial renderer/audio state is derived from the received snapshot instead of forcing Stage 1 music.
- CI now executes deterministic shared-simulation regression tests in addition to browser build and Worker/shared typecheck.

Automated coverage is still incomplete for the requested full browser/room matrix. In particular, two-browser lobby→READY→START→scene→reconnect→finale remains **NON VERIFICATO END-TO-END** and must not be represented as release acceptance.

## Third-review remediation

- Narrative reconnect now receives an explicit, revisioned authoritative scene state even when no scene is active; stale scene messages are ignored and the client tracks whether its slot already confirmed the active scene.
- Replaced WebSocket sessions stop automatic reconnect without deleting the shared persisted token used by the newer tab/device.
- Story overlays and narrative waits are cancellable on menu exit, replacement and reconnect expiry.
- Campaign art preload is awaited before renderer start, validates atlas JSON and image decoding, reports progress, supports retry/exit, and uses release-versioned asset URLs.
- Service Worker cache generation rotated for the 1.2.2 art bundle; non-navigation assets still have no HTML-shell fallback.
- Explicit MENU and NUOVA PARTITA controls clean up the active renderer/session and route back through the appropriate solo/co-op selection.
- Added deterministic client reconnect and room narrative/grace regression tests in CI.

Two independent real browsers and the public Worker endpoint remain outside automated acceptance: **NON VERIFICATO END-TO-END**.

## Animation / game-feel pass — 1.2.3

- Added precisely cropped movement art for Alex, Matt, Elisa and Gaga: four walk poses plus one dedicated jump pose each.
- Added matching movement art for Thug, Ripper and Heavy; Heavy now has its own walk silhouette instead of falling back to Thug art.
- Kept existing combat/hurt/KO art for states not covered by the approved movement sheets, avoiding character morphs from inconsistent generated attack/hit rows.
- Movement sheet bounds and animation cardinality are checked in CI against the real PNG dimensions.
- Renderer interpolation now derives its window from the observed authoritative snapshot interval, reducing the visible accelerate/pause effect caused by timing jitter without introducing prediction.
- Asset and Service Worker generations rotated to 1.2.3.

## Consolidation backlog — next pass

These are deliberately separated from feature implementation and must be reviewed before the PR is considered release-ready:

- Replace the placeholder/unverified Worker endpoint with the real deployed backend configuration; do not claim public online play before this is tested.
- Exercise create/join/reconnect with two independent devices/sessions under latency, jitter and packet loss.
- Finish local movement prediction/reconciliation and make authoritative `facing` / `actionStartedTick` mandatory after both client and Worker are migrated together.
- Verify late join only at a safe encounter boundary and improve visible reconnect/grace UX.
- Consolidate procedural combat SFX and soundtrack controls behind one mute/volume policy; deduplicate predicted/confirmed effects.
- Add committed lockfiles, switch CI to `npm ci`, and complete room/browser smoke coverage (simulation regression tests are now present).
- Verify continue/get-up/invulnerability, stage healing, boss balance and six-stage end-to-end progression.
- Continue replacing temporary combat/hurt/KO legacy fallbacks as approved matching art becomes available; movement pivots/cropping are now regression-tested.
- Run real Android/iPad landscape/fullscreen/safe-area/PWA tests.
- Measure snapshot payloads and move toward compact deltas/events if network profiling shows it is necessary.

## Verification policy

Public online multiplayer remains **unverified** until a deployed backend has been exercised from separate clients. Automated build/typecheck, browser tests, network-emulated tests and real-device tests must be reported separately. PR #3 was merged after green browser/Worker CI; deployed public Worker + separate physical-device acceptance remains **NON VERIFICATO END-TO-END**.
