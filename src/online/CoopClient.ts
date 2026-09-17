import {
  PROTOCOL_VERSION,
  RECONNECT_WINDOW_MS,
  type PlayerInput,
  type PlayerSlot,
  type ServerMessage,
  type WorldSnapshot,
} from '../shared/protocol';
import type { CharacterId } from '../shared/campaign';

export interface CoopLobbyPlayer {
  slot: PlayerSlot;
  nickname: string;
  character: CharacterId | null;
  ready: boolean;
  connected: boolean;
}

export interface CoopLobbyState {
  room: string;
  hostSlot: PlayerSlot;
  continuesPerPlayer: number;
  players: CoopLobbyPlayer[];
}

type SavedSession = { room: string; nickname: string; token: string; reconnectUntil?: number };
const SESSION_KEY = 'streetbrawl-coop-session';

export class CoopClient extends EventTarget {
  private socket?: WebSocket;
  private socketGeneration = 0;
  private connecting?: Promise<void>;
  private inputSeq = 0;
  private reconnectTimer?: number;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private nickname = '';
  private reconnectUntil = 0;

  slot?: PlayerSlot;
  room = '';
  reconnectToken = '';
  lobby?: CoopLobbyState;
  snapshot?: WorldSnapshot;
  activeScene?: string;
  resumedSession = false;

  constructor(private readonly endpoint: string) {
    super();
    this.restoreSession();
  }

  get isHost() {
    return this.slot !== undefined && this.lobby?.hostSlot === this.slot;
  }

  get canReconnect() {
    return !!this.room && !!this.reconnectToken && (!this.reconnectUntil || this.reconnectUntil > Date.now());
  }

  get savedSession(): SavedSession | undefined {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as SavedSession | null ?? undefined;
    } catch {
      return undefined;
    }
  }

  async createRoom() {
    if (!this.endpoint) throw new Error('Backend co-op non configurato');
    const response = await fetch(`${this.endpoint}/rooms`, { method: 'POST' });
    if (!response.ok) throw new Error(`Creazione stanza fallita (${response.status})`);
    return ((await response.json()) as { room: string }).room;
  }

  connect(room: string, nickname: string): Promise<void> {
    if (!this.endpoint) return Promise.reject(new Error('Backend co-op non configurato'));
    const normalized = room.trim().toUpperCase();
    this.nickname = nickname;

    if (this.reconnectToken && this.room === normalized) {
      return this.openSocket(true);
    }

    this.cancelReconnect();
    this.intentionalClose = true;
    const old = this.socket;
    this.socket = undefined;
    this.socketGeneration++;
    try { old?.close(4000, 'NEW_JOIN'); } catch {}
    this.intentionalClose = false;

    this.room = normalized;
    this.reconnectToken = '';
    this.reconnectUntil = 0;
    this.inputSeq = 0;
    this.slot = undefined;
    this.snapshot = undefined;
    this.lobby = undefined;
    this.activeScene = undefined;
    this.resumedSession = false;
    localStorage.removeItem(SESSION_KEY);
    return this.openSocket(false);
  }

  reconnect(): Promise<void> {
    if (!this.canReconnect) return Promise.reject(new Error('Sessione non riconnettibile'));
    return this.openSocket(true);
  }

  private openSocket(isReconnect: boolean): Promise<void> {
    if (this.connecting) return this.connecting;
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();

    const generation = ++this.socketGeneration;
    const base = new URL(this.endpoint);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${base.host}/rooms/${encodeURIComponent(this.room)}/ws`);
    this.socket = ws;
    this.intentionalClose = false;

    const connection = new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (this.connecting === connection) this.connecting = undefined;
        error ? reject(error) : resolve();
      };
      const timer = window.setTimeout(() => {
        if (generation !== this.socketGeneration) return;
        try { ws.close(); } catch {}
        finish(new Error('Timeout connessione stanza'));
      }, 10_000);

      ws.addEventListener('open', () => {
        if (generation !== this.socketGeneration) return;
        ws.send(JSON.stringify({
          type: 'hello',
          protocol: PROTOCOL_VERSION,
          nickname: this.nickname || 'PLAYER',
          reconnectToken: isReconnect ? this.reconnectToken || undefined : undefined,
        }));
      });

      ws.addEventListener('message', event => {
        if (generation !== this.socketGeneration) return;
        let message: ServerMessage;
        try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }

        if (message.type === 'welcome') {
          this.slot = message.slot;
          this.reconnectToken = message.reconnectToken;
          this.reconnectUntil = 0;
          this.reconnectAttempt = 0;
          this.resumedSession = isReconnect;
          this.persistSession();
          finish();
          if (isReconnect) this.dispatchEvent(new Event('reconnected'));
        }

        if (message.type === 'lobby') this.lobby = message;
        if (message.type === 'scene') {
          if (message.active) this.activeScene = message.sceneId;
          else if (this.activeScene === message.sceneId) this.activeScene = undefined;
        }
        if (message.type === 'snapshot') {
          this.snapshot = message;
          const own = this.slot === undefined ? undefined : message.players.find(p => p.slot === this.slot);
          if (own) this.inputSeq = Math.max(this.inputSeq, own.lastProcessedInputSeq);
        }

        if (message.type === 'error') {
          if (message.code === 'ROOM_EXPIRED' && isReconnect) {
            this.reconnectToken = '';
            this.reconnectUntil = 0;
            this.activeScene = undefined;
            this.resumedSession = false;
            localStorage.removeItem(SESSION_KEY);
            this.dispatchEvent(new Event('reconnect-expired'));
          }
          finish(new Error(message.message));
        }

        this.dispatchEvent(new CustomEvent<ServerMessage>('message', { detail: message }));
      });

      ws.addEventListener('error', () => {
        if (generation !== this.socketGeneration) return;
        finish(new Error('Connessione multiplayer non disponibile'));
      });

      ws.addEventListener('close', () => {
        window.clearTimeout(timer);
        if (generation !== this.socketGeneration) return;
        if (this.socket === ws) this.socket = undefined;
        if (this.connecting === connection) this.connecting = undefined;
        this.dispatchEvent(new Event('close'));
        if (this.intentionalClose || !this.room || !this.reconnectToken) return;
        if (!this.reconnectUntil) this.reconnectUntil = Date.now() + RECONNECT_WINDOW_MS;
        this.persistSession();
        this.scheduleReconnect();
      });
    });

    this.connecting = connection;
    return connection;
  }

  reserveCharacter(character: CharacterId) { this.send({ type: 'reserve-character', character }); }
  setReady(ready: boolean) { this.send({ type: 'ready', ready }); }
  setContinues(continuesPerPlayer: number) { this.send({ type: 'settings', continuesPerPlayer }); }
  start() { this.send({ type: 'start' }); }
  setPaused(paused: boolean) { this.send({ type: 'pause', paused }); }
  sceneEnter(sceneId: string) { this.send({ type: 'scene-enter', sceneId }); }
  sceneReady(sceneId: string) { this.send({ type: 'scene-ready', sceneId }); }

  sendInput(input: Omit<PlayerInput, 'seq' | 'clientTime'>) {
    const seq = ++this.inputSeq;
    this.send({ type: 'input', inputs: [{ ...input, seq, clientTime: Date.now() }] });
    return seq;
  }

  close(forgetSession = true) {
    this.intentionalClose = true;
    this.cancelReconnect();
    this.socketGeneration++;
    try { this.socket?.close(); } catch {}
    this.socket = undefined;
    this.connecting = undefined;
    if (forgetSession) {
      this.slot = undefined;
      this.reconnectToken = '';
      this.snapshot = undefined;
      this.lobby = undefined;
      this.inputSeq = 0;
      this.room = '';
      this.reconnectUntil = 0;
      this.activeScene = undefined;
      this.resumedSession = false;
      localStorage.removeItem(SESSION_KEY);
    }
  }

  private send(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Stanza non connessa');
    this.socket.send(JSON.stringify(message));
  }

  private scheduleReconnect() {
    this.cancelReconnect();
    if (!this.canReconnect) {
      this.dispatchEvent(new Event('reconnect-expired'));
      return;
    }
    const delay = Math.min(5000, 500 * Math.pow(1.65, this.reconnectAttempt++));
    if (this.reconnectUntil && Date.now() + delay >= this.reconnectUntil) {
      this.dispatchEvent(new Event('reconnect-expired'));
      return;
    }
    this.dispatchEvent(new CustomEvent('reconnecting', { detail: { attempt: this.reconnectAttempt, delay } }));
    this.reconnectTimer = window.setTimeout(() => {
      void this.reconnect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private cancelReconnect() {
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private persistSession() {
    if (!this.reconnectToken) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      room: this.room,
      nickname: this.nickname,
      token: this.reconnectToken,
      reconnectUntil: this.reconnectUntil || undefined,
    } satisfies SavedSession));
  }

  private restoreSession() {
    const saved = this.savedSession;
    if (!saved) return;
    if (saved.reconnectUntil && saved.reconnectUntil <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    this.room = saved.room;
    this.nickname = saved.nickname;
    this.reconnectToken = saved.token;
    this.reconnectUntil = saved.reconnectUntil ?? 0;
  }
}
