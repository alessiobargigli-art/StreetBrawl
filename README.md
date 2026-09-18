# StreetBrawl

Browser beat 'em up inspired by classic 2.5D arcade brawlers, built as an original game.

## Vertical slice

- TypeScript + Vite + Canvas 2D, fixed-step 60 Hz simulation
- Two scrolling stages, encounter waves and two bosses
- Keyboard and floating mobile joystick controls
- PWA install/fullscreen support
- Version visible in game: `1.2.3-animation-gamefeel`

## Animation / game feel

- Alex, Matt, Elisa and Gaga now use four-frame walk cycles plus a dedicated jump pose from precisely cropped transparent sprite regions.
- Thug, Ripper and Heavy use matching movement art; Heavy no longer borrows the Thug walk silhouette.
- Movement art is loaded as a required versioned atlas before gameplay starts and is validated in CI against the PNG bounds.
- Snapshot interpolation follows the observed authoritative cadence to reduce the visible accelerate/pause sensation under small timing jitter without adding client-side prediction.

## Controls

Desktop: arrows to move, `Z` punch, `X` kick, `Space` jump. Mobile/tablet: floating joystick plus JUMP/PUNCH/KICK.

The startup menu exposes separate music and effects volumes plus global mute. Settings persist in `localStorage`; defaults are music 25% and effects 75%.

## Soundtrack

The audio loader downloads all five tracks before normal menu entry, reports measured byte progress when the server exposes sizes, validates the MP3 metadata, retries failures and offers **RIPROVA** / **CONTINUA SENZA AUDIO**. Audio is unlocked only after the **ENTRA** user gesture.

| Phase | Asset |
| --- | --- |
| Menu | `/assets/audio/music/menu.mp3` |
| Stage 1 — The Streets | `/assets/audio/music/stage-1.mp3` |
| Bruno | `/assets/audio/music/boss-1.mp3` |
| Stage 2 — Harbor Docks | `/assets/audio/music/stage-2.mp3` |
| Dock Master | `/assets/audio/music/boss-2.mp3` |

The service worker uses a StreetBrawl-owned versioned cache, never returns the HTML shell for non-navigation assets, caches successful audio downloads for later/offline sessions and serves cached MP3 byte ranges when requested by the browser audio element. Cache write failure is non-fatal for the current session.

Arcade feedback uses reusable WebAudio synthesis for UI/progression events. The existing combat simulation retains its contact-timed procedural impact sounds; music and progression audio are centralized in `AudioManager`.

## Run locally

```bash
npm ci
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Audio QA

Automated CI verifies the TypeScript/Vite production build. Real-device checks remain separate: first load under throttling, offline reopen after a complete preload, iOS/Android audio unlock, three consecutive musical loops per track, background/resume, portrait/landscape rotation and perceived mix levels.


## Campaign asset loading

Campaign graphics are release-versioned and decoded before gameplay starts. A failed required atlas/image keeps gameplay stopped and exposes retry or exit instead of silently falling back to a partially mixed cache. The co-op Worker endpoint in source is configuration only; public multiplayer is not considered verified without an explicit two-client deployment test.


## Online co-op deployment

StreetBrawl is deployed as a **single Cloudflare Worker origin**. The same published URL serves both the Vite game assets and the authoritative multiplayer backend.

The browser always uses `window.location.origin`: there are no hardcoded Worker URLs, localStorage endpoint overrides or build-time endpoint variables.

- `GET /health` — deployment health
- `POST /rooms` — create a room
- `/rooms/:code/ws` — authoritative multiplayer WebSocket
- every other path — static game assets from `dist`

Build and deploy together with:

```bash
cd worker
npm run deploy
```

The deploy script first builds the browser client and then publishes the Worker with the generated `dist` assets.
