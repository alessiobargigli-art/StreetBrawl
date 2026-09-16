# StreetBrawl

Browser beat 'em up inspired by classic 2.5D arcade brawlers, built as an original game.

## Current vertical slice

- TypeScript + Vite + Canvas 2D
- Fixed-step 60 Hz game loop
- 2.5D movement with Y-depth rendering
- Player movement via arrows
- Punch (`Z`) and kick (`X`)
- Basic enemy AI, damage, knockback and health bars
- Landscape-first responsive layout
- Touch controls for mobile/tablet
- Initial PWA manifest

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Roadmap

1. Fighter state machine and proper animation system
2. Combo chain: punch -> punch -> kick
3. Hit stun, knockdown, get-up and invulnerability frames
4. Multiple enemies and encounter waves
5. Scrolling stage and camera
6. Sprite/audio asset pipeline
7. Second local player and gamepad support
8. Full PWA installation/offline support
