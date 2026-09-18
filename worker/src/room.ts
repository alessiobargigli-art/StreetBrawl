import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  RECONNECT_WINDOW_MS,
  SIMULATION_HZ,
  SNAPSHOT_HZ,
  type ClientMessage,
  type PlayerInput,
  type PlayerSlot,
  type ServerMessage,
} from '../../src/shared/protocol';
import {
  MAX_CONTINUES_PER_PLAYER,
  MIN_CONTINUES_PER_PLAYER,
  DEFAULT_CONTINUES_PER_PLAYER,
} from '../../src/shared/campaign';
import { AuthoritativeSimulation } from '../../src/shared/simulation';

interface Env {}
interface Session { socket: WebSocket; slot: PlayerSlot; token: string; nickname: string }
interface ReconnectRecord { slot: PlayerSlot; token: string; nickname: string; expiresAt: number }

const CHARACTER_IDS = new Set(['alex', 'matt', 'elisa', 'gaga']);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isAxis = (value: unknown): value is -1 | 0 | 1 => value === -1 || value === 0 || value === 1;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isInput = (value: unknown): value is PlayerInput => {
  if (!isObject(value)) return false;
  return Number.isInteger(value.seq) && isFiniteNumber(value.seq) &&
    isFiniteNumber(value.clientTime) && isAxis(value.moveX) && isAxis(value.moveY) &&
    typeof value.punch === 'boolean' && typeof value.kick === 'boolean' && typeof value.jump === 'boolean' &&
    (value.continueRequestId === undefined || typeof value.continueRequestId === 'string');
};

function parseMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isObject(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'hello':
      return isFiniteNumber(value.protocol) && typeof value.nickname === 'string' &&
        (value.reconnectToken === undefined || typeof value.reconnectToken === 'string')
        ? value as unknown as ClientMessage : null;
    case 'reserve-character':
      return typeof value.character === 'string' && CHARACTER_IDS.has(value.character)
        ? value as unknown as ClientMessage : null;
    case 'ready':
      return typeof value.ready === 'boolean' ? value as unknown as ClientMessage : null;
    case 'settings':
      return isFiniteNumber(value.continuesPerPlayer) && Number.isInteger(value.continuesPerPlayer)
        ? value as unknown as ClientMessage : null;
    case 'input':
      return Array.isArray(value.inputs) && value.inputs.length > 0 && value.inputs.length <= 16 && value.inputs.every(isInput)
        ? value as unknown as ClientMessage : null;
    case 'pause':
      return typeof value.paused === 'boolean' ? value as unknown as ClientMessage : null;
    case 'scene-enter':
    case 'scene-ready':
      return typeof value.sceneId === 'string' && value.sceneId.length > 0 && value.sceneId.length <= 80
        ? value as unknown as ClientMessage : null;
    case 'start':
      return value as unknown as ClientMessage;
    default:
      return null;
  }
}

export class GameRoom {
  private code = '';
  private simulation = new AuthoritativeSimulation('pending');
  private sessions = new Map<WebSocket, Session>();
  private reconnects = new Map<string, ReconnectRecord>();
  private tickTimer?: ReturnType<typeof setInterval>;
  private snapshotCounter = 0;
  private hostSlot: PlayerSlot = 0;
  private continuesPerPlayer = DEFAULT_CONTINUES_PER_PLAYER;
  private manualPaused = false;
  private activeScene?: string;
  private sceneReady = new Set<PlayerSlot>();
  private sceneResumePlaying = false;
  private pendingScenes: string[] = [];
  private observedStage = 1;
  private sceneRevision = 0;

  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {
    void this.ctx;
    void this.env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      this.code = url.searchParams.get('code') ?? this.code;
      this.simulation = new AuthoritativeSimulation(this.code, this.continuesPerPlayer);
      return Response.json({ ok: true });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ room: this.code, players: this.simulation.state.players.length, phase: this.simulation.state.phase });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    server.addEventListener('message', event => this.onMessage(server, String(event.data)));
    server.addEventListener('close', () => this.onClose(server));
    server.addEventListener('error', () => this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(socket: WebSocket, raw: string) {
    const message = parseMessage(raw);
    if (!message) {
      this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Messaggio non valido' });
      return;
    }

    const existing = this.sessions.get(socket);
    if (message.type === 'hello') {
      this.handleHello(socket, message);
      return;
    }

    if (!existing) {
      this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Invia hello prima dei comandi' });
      return;
    }

    switch (message.type) {
      case 'reserve-character':
        if (this.simulation.state.phase !== 'lobby') {
          this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Personaggio selezionabile solo in lobby' });
          break;
        }
        if (!this.simulation.reserveCharacter(existing.slot, message.character)) {
          this.send(socket, { type: 'error', code: 'CHARACTER_TAKEN', message: 'Personaggio già selezionato' });
        }
        this.broadcastLobby();
        break;
      case 'ready':
        if (this.simulation.state.phase !== 'lobby') {
          this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Ready modificabile solo in lobby' });
          break;
        }
        this.simulation.setReady(existing.slot, message.ready);
        this.broadcastLobby();
        break;
      case 'settings':
        if (existing.slot !== this.hostSlot) {
          this.send(socket, { type: 'error', code: 'NOT_HOST', message: 'Solo host può cambiare le impostazioni' });
          break;
        }
        if (this.simulation.state.phase !== 'lobby') {
          this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Impostazioni modificabili solo in lobby' });
          break;
        }
        if (message.continuesPerPlayer < MIN_CONTINUES_PER_PLAYER || message.continuesPerPlayer > MAX_CONTINUES_PER_PLAYER) {
          this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Numero continue non valido' });
          break;
        }
        this.continuesPerPlayer = message.continuesPerPlayer;
        this.simulation.setDefaultContinues(this.continuesPerPlayer);
        this.broadcastLobby();
        break;
      case 'start':
        if (existing.slot !== this.hostSlot) {
          this.send(socket, { type: 'error', code: 'NOT_HOST', message: 'Solo host può avviare' });
          break;
        }
        if (this.simulation.state.phase !== 'lobby') {
          this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Partita già avviata' });
          break;
        }
        if (!this.simulation.start()) {
          this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Tutti i giocatori devono essere pronti' });
          break;
        }
        this.observedStage = this.simulation.state.stage;
        this.activateScene('opening', true);
        this.pendingScenes.push('stage-intro-1');
        this.broadcast(this.simulation.snapshot());
        break;
      case 'input':
        if (this.simulation.state.phase !== 'playing') break;
        for (const input of message.inputs.slice(-4)) this.simulation.applyInput(existing.slot, input);
        break;
      case 'pause':
        if (existing.slot !== this.hostSlot) {
          this.send(socket, { type: 'error', code: 'NOT_HOST', message: 'Solo host può mettere in pausa' });
          break;
        }
        this.manualPaused = message.paused;
        this.applyPauseState();
        break;
      case 'scene-enter':
        if (message.sceneId !== this.activeScene) this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Scena non attiva sul server' });
        break;
      case 'scene-ready':
        this.markSceneReady(existing.slot, message.sceneId);
        break;
    }
  }

  private handleHello(socket: WebSocket, message: Extract<ClientMessage, { type: 'hello' }>) {
    if (message.protocol !== PROTOCOL_VERSION) {
      this.send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Versione protocollo non compatibile' });
      socket.close(4002, 'BAD_PROTOCOL');
      return;
    }
    if (this.sessions.has(socket)) return;

    this.pruneReconnects();
    const nickname = message.nickname.slice(0, 20).trim() || 'Player';
    let slot: PlayerSlot | undefined;
    let token = '';

    if (message.reconnectToken) {
      const active = [...this.sessions.values()].find(session => session.token === message.reconnectToken);
      if (active) {
        slot = active.slot;
        token = active.token;
        this.sessions.delete(active.socket);
        try { active.socket.close(4000, 'REPLACED'); } catch {}
      } else {
        const record = this.reconnects.get(message.reconnectToken);
        if (!record || this.isSlotActive(record.slot)) {
          this.send(socket, { type: 'error', code: 'ROOM_EXPIRED', message: 'Sessione di rientro non valida o scaduta' });
          socket.close(4003, 'ROOM_EXPIRED');
          return;
        }
        slot = record.slot;
        token = record.token;
        this.reconnects.delete(record.token);
      }
    } else {
      if (this.simulation.state.phase !== 'lobby') {
        this.send(socket, { type: 'error', code: 'GAME_FINISHED', message: 'Partita già avviata: è consentito solo il rientro della sessione esistente' });
        socket.close(4004, 'GAME_STARTED');
        return;
      }
      const reserved = new Set([...this.reconnects.values()].map(record => record.slot));
      const used = new Set([...this.sessions.values()].map(session => session.slot));
      slot = ([0, 1] as PlayerSlot[]).find(candidate => !used.has(candidate) && !reserved.has(candidate));
      if (slot === undefined || this.sessions.size >= MAX_PLAYERS) {
        this.send(socket, { type: 'error', code: 'ROOM_FULL', message: 'Stanza piena' });
        socket.close(4001, 'ROOM_FULL');
        return;
      }
      token = crypto.randomUUID();
    }

    this.sessions.set(socket, { socket, slot, token, nickname });
    this.simulation.addPlayer(slot, nickname);
    if (this.sessions.size === 1 && this.simulation.state.phase === 'lobby') this.hostSlot = slot;
    this.send(socket, { type: 'welcome', protocol: PROTOCOL_VERSION, room: this.code, slot, reconnectToken: token });
    this.broadcastLobby();
    if (this.simulation.state.phase !== 'lobby') this.send(socket, this.simulation.snapshot());
    this.send(socket, this.sceneMessage(!!this.activeScene));
    this.ensureTicking();
  }

  private activateScene(sceneId: string, resumePlaying = false) {
    if (this.activeScene) {
      if (this.activeScene !== sceneId && !this.pendingScenes.includes(sceneId)) this.pendingScenes.push(sceneId);
      return;
    }
    this.activeScene = sceneId;
    this.sceneRevision++;
    this.sceneReady.clear();
    this.sceneResumePlaying = resumePlaying || this.simulation.state.phase === 'playing';
    this.applyPauseState();
    this.broadcast(this.sceneMessage(true));
  }

  private markSceneReady(slot: PlayerSlot, sceneId: string) {
    if (!this.activeScene || sceneId !== this.activeScene) return;
    this.sceneReady.add(slot);
    this.broadcast(this.sceneMessage(true));
    this.finishSceneIfReady();
  }

  private finishSceneIfReady() {
    if (!this.activeScene) return;
    const requiredSlots = new Set<PlayerSlot>([...this.sessions.values()].map(session => session.slot));
    for (const record of this.reconnects.values()) requiredSlots.add(record.slot);
    if (!requiredSlots.size || ![...requiredSlots].every(slot => this.sceneReady.has(slot))) return;
    const sceneId = this.activeScene;
    this.activeScene = undefined;
    this.sceneReady.clear();
    const resume = this.sceneResumePlaying;
    this.sceneResumePlaying = false;
    this.sceneRevision++;
    this.broadcast({ type: 'scene', sceneId, active: false, readySlots: [], revision: this.sceneRevision });
    const next = this.pendingScenes.shift();
    if (next) this.activateScene(next, resume);
    else {
      if (resume && !this.manualPaused) this.simulation.state.phase = 'playing';
      this.applyPauseState();
      this.broadcast(this.simulation.snapshot());
    }
  }

  private sceneMessage(active: boolean): ServerMessage {
    return { type: 'scene', sceneId: this.activeScene ?? '', active, readySlots: [...this.sceneReady], revision: this.sceneRevision };
  }

  private applyPauseState() {
    if (this.simulation.state.phase !== 'playing' && this.simulation.state.phase !== 'paused') return;
    this.simulation.state.phase = this.manualPaused || !!this.activeScene ? 'paused' : 'playing';
    this.broadcast(this.simulation.snapshot());
  }

  private ensureTicking() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      this.pruneReconnects();
      const beforeStage = this.simulation.state.stage;
      const beforePhase = this.simulation.state.phase;
      this.simulation.tick();
      if (this.simulation.state.stage !== beforeStage) {
        this.observedStage = this.simulation.state.stage;
        this.activateScene(`stage-outro-${beforeStage}`, true);
        this.pendingScenes.push(`stage-intro-${this.simulation.state.stage}`);
      } else if (beforePhase !== 'victory' && this.simulation.state.phase === 'victory') {
        this.activateScene('finale', false);
      }
      if (++this.snapshotCounter >= SIMULATION_HZ / SNAPSHOT_HZ) {
        this.snapshotCounter = 0;
        this.broadcast(this.simulation.snapshot());
      }
    }, 1000 / SIMULATION_HZ);
  }

  private onClose(socket: WebSocket) {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.simulation.removePlayer(session.slot);
    this.sessions.delete(socket);
    this.reconnects.set(session.token, {
      slot: session.slot,
      token: session.token,
      nickname: session.nickname,
      expiresAt: Date.now() + RECONNECT_WINDOW_MS,
    });
    if (this.simulation.state.phase === 'lobby' && session.slot === this.hostSlot) this.maybeMigrateHost(true);
    this.broadcastLobby();
    if (!this.sessions.size && this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
  }

  private pruneReconnects() {
    const now = Date.now();
    let expired = false;
    for (const [token, record] of this.reconnects) {
      if (record.expiresAt > now) continue;
      this.reconnects.delete(token);
      if (!this.isSlotActive(record.slot)) this.simulation.dropPlayer(record.slot);
      this.sceneReady.delete(record.slot);
      expired = true;
    }
    if (expired) {
      this.maybeMigrateHost(true);
      this.finishSceneIfReady();
      this.broadcastLobby();
    }
  }

  private maybeMigrateHost(broadcast = false) {
    if (this.isSlotActive(this.hostSlot)) return;
    if ([...this.reconnects.values()].some(record => record.slot === this.hostSlot)) return;
    const next = [...this.sessions.values()].sort((a, b) => a.slot - b.slot)[0];
    if (!next) return;
    const changed = this.hostSlot !== next.slot;
    this.hostSlot = next.slot;
    if (changed && broadcast) this.broadcastLobby();
  }

  private isSlotActive(slot: PlayerSlot) {
    return [...this.sessions.values()].some(session => session.slot === slot);
  }

  private broadcastLobby() {
    const players = this.simulation.state.players.map(({ slot, nickname, character, ready, connected }) => ({ slot, nickname, character, ready, connected }));
    this.broadcast({ type: 'lobby', room: this.code, hostSlot: this.hostSlot, continuesPerPlayer: this.continuesPerPlayer, players });
  }

  private broadcast(message: ServerMessage) {
    const data = JSON.stringify(message);
    for (const socket of this.sessions.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(data);
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}
