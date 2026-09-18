# StreetBrawl co-op Worker

Cloudflare Worker + Durable Object prototype for authoritative online rooms.

- `GET /health`
- `POST /rooms` creates a room code.
- `GET /rooms/:code` returns room state.
- `GET /rooms/:code/ws` upgrades to WebSocket.

Client messages use `src/shared/protocol.ts`. Local verification: `cd worker && npm install && npm run typecheck && npm run dev`.

Current slice does not yet persist reconnect tokens across Durable Object eviction; that is a subsequent PR #3 task.
