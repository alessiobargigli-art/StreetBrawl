import { MAX_PLAYERS, PROTOCOL_VERSION, RECONNECT_WINDOW_MS, SIMULATION_HZ, SNAPSHOT_HZ, type ClientMessage, type PlayerSlot, type ServerMessage } from '../../src/shared/protocol';
import { AuthoritativeSimulation } from '../../src/shared/simulation';

interface Env {}
interface Session { socket: WebSocket; slot: PlayerSlot; token: string; nickname: string }
interface ReconnectRecord { slot: PlayerSlot; token: string; nickname: string; expiresAt: number }

export class GameRoom extends DurableObject<Env> {
  private code = '';
  private simulation = new AuthoritativeSimulation('pending');
  private sessions = new Map<WebSocket, Session>();
  private reconnects = new Map<string, ReconnectRecord>();
  private tickTimer?: ReturnType<typeof setInterval>;
  private snapshotCounter = 0;

  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      this.code = url.searchParams.get('code') ?? this.code;
      this.simulation = new AuthoritativeSimulation(this.code);
      return Response.json({ ok: true });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ room: this.code, players: this.simulation.state.players.length, phase: this.simulation.state.phase });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    server.addEventListener('message', (event) => this.onMessage(server, String(event.data)));
    server.addEventListener('close', () => this.onClose(server));
    server.addEventListener('error', () => this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(socket: WebSocket, raw: string): void {
    let message: ClientMessage;
    try { message = JSON.parse(raw) as ClientMessage; }
    catch { this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'JSON non valido' }); return; }

    const session = this.sessions.get(socket);
    if (message.type === 'hello') {
      if (message.protocol !== PROTOCOL_VERSION) {
        this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Versione protocollo non compatibile' });
        return;
      }
      if (session) return;
      this.pruneReconnects();

      let slot: PlayerSlot | undefined;
      let token = '';
      let nickname = message.nickname.slice(0, 20) || 'Player';
      const reconnect = message.reconnectToken ? this.reconnects.get(message.reconnectToken) : undefined;
      if (reconnect && !this.isSlotActive(reconnect.slot)) {
        slot = reconnect.slot;
        token = reconnect.token;
        nickname = message.nickname.slice(0, 20) || reconnect.nickname;
        this.reconnects.delete(reconnect.token);
      } else {
        const reserved = new Set([...this.reconnects.values()].map((record) => record.slot));
        const used = new Set([...this.sessions.values()].map((active) => active.slot));
        slot = ([0, 1] as PlayerSlot[]).find((candidate) => !used.has(candidate) && !reserved.has(candidate));
        if (slot === undefined || this.sessions.size >= MAX_PLAYERS) {
          this.send(socket, { type: 'error', code: 'ROOM_FULL', message: 'Stanza piena' });
          socket.close(4001, 'ROOM_FULL');
          return;
        }
        token = crypto.randomUUID();
      }

      this.sessions.set(socket, { socket, slot, token, nickname });
      this.simulation.addPlayer(slot, nickname);
      this.send(socket, { type: 'welcome', protocol: PROTOCOL_VERSION, room: this.code, slot, reconnectToken: token });
      this.broadcastLobby();
      if (this.simulation.state.phase !== 'lobby') this.send(socket, this.simulation.snapshot());
      this.ensureTicking();
      return;
    }

    if (!session) {
      this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Invia hello prima dei comandi' });
      return;
    }

    switch (message.type) {
      case 'reserve-character':
        if (!this.simulation.reserveCharacter(session.slot, message.character)) this.send(socket, { type: 'error', code: 'CHARACTER_TAKEN', message: 'Personaggio già selezionato' });
        this.broadcastLobby();
        break;
      case 'ready':
        this.simulation.setReady(session.slot, message.ready);
        this.broadcastLobby();
        break;
      case 'start':
        if (session.slot !== 0) { this.send(socket, { type: 'error', code: 'NOT_HOST', message: 'Solo il giocatore 1 può avviare' }); break; }
        if (!this.simulation.start()) { this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Tutti i giocatori devono essere pronti' }); break; }
        this.broadcast(this.simulation.snapshot());
        break;
      case 'input':
        for (const input of message.inputs.slice(-4)) this.simulation.applyInput(session.slot, input);
        break;
      case 'pause':
        if (session.slot !== 0) { this.send(socket, { type: 'error', code: 'NOT_HOST', message: 'Solo il giocatore 1 può mettere in pausa' }); break; }
        if (this.simulation.state.phase === 'playing' || this.simulation.state.phase === 'paused') this.simulation.state.phase = message.paused ? 'paused' : 'playing';
        break;
      case 'scene-ready':
        break;
    }
  }

  private ensureTicking(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      this.pruneReconnects();
      this.simulation.tick();
      if (++this.snapshotCounter >= SIMULATION_HZ / SNAPSHOT_HZ) {
        this.snapshotCounter = 0;
        this.broadcast(this.simulation.snapshot());
      }
    }, 1000 / SIMULATION_HZ);
  }

  private onClose(socket: WebSocket): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.simulation.removePlayer(session.slot);
    this.sessions.delete(socket);
    this.reconnects.set(session.token, { slot: session.slot, token: session.token, nickname: session.nickname, expiresAt: Date.now() + RECONNECT_WINDOW_MS });
    this.broadcastLobby();
    if (!this.sessions.size && this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = undefined; }
  }

  private pruneReconnects(): void {
    const now = Date.now();
    for (const [token, record] of this.reconnects) if (record.expiresAt <= now) this.reconnects.delete(token);
  }

  private isSlotActive(slot: PlayerSlot): boolean {
    return [...this.sessions.values()].some((session) => session.slot === slot);
  }

  private broadcastLobby(): void {
    const players = this.simulation.state.players.map(({ slot, nickname, character, ready, connected }) => ({ slot, nickname, character, ready, connected }));
    this.broadcast({ type: 'lobby', room: this.code, hostSlot: 0, continuesPerPlayer: this.simulation.state.players[0]?.continues ?? 3, players });
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const socket of this.sessions.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(data);
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}
