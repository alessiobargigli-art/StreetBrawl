import { GameRoom } from './room';
export { GameRoom };

interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const json = (value: unknown, status = 200) => Response.json(value, { status });

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') return json({ ok: true, service: 'streetbrawl' });

    if (url.pathname === '/rooms' && request.method === 'POST') {
      const code = roomCode();
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      await stub.fetch(new Request(`https://room/init?code=${code}`, { method: 'POST' }));
      return json({ room: code, joinUrl: `${url.origin}/?room=${code}` }, 201);
    }

    const room = url.pathname.match(/^\/rooms\/([A-Z2-9]{6})(\/ws)?$/);
    if (room) return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);

    return env.ASSETS.fetch(request);
  }
};
