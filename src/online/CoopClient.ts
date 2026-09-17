import { PROTOCOL_VERSION, type PlayerInput, type PlayerSlot, type ServerMessage, type WorldSnapshot } from '../shared/protocol';
import type { CharacterId } from '../shared/campaign';

export interface CoopLobbyPlayer { slot: PlayerSlot; nickname: string; character: CharacterId | null; ready: boolean; connected: boolean }
export interface CoopLobbyState { room: string; hostSlot: PlayerSlot; continuesPerPlayer: number; players: CoopLobbyPlayer[] }

export class CoopClient extends EventTarget {
  private socket?: WebSocket;
  private inputSeq = 0;
  slot?: PlayerSlot;
  room = '';
  reconnectToken = '';
  lobby?: CoopLobbyState;
  snapshot?: WorldSnapshot;

  constructor(private readonly endpoint: string) { super(); }

  async createRoom(): Promise<string> {
    const response = await fetch(`${this.endpoint}/rooms`, { method: 'POST' });
    if (!response.ok) throw new Error(`Creazione stanza fallita (${response.status})`);
    const data = await response.json() as { room: string };
    return data.room;
  }

  connect(room: string, nickname: string): Promise<void> {
    this.close(false);
    this.room = room.trim().toUpperCase();
    const base = new URL(this.endpoint);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${base.host}/rooms/${encodeURIComponent(this.room)}/ws`);
    this.socket = ws;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.close();
        reject(new Error('Timeout connessione stanza'));
      }, 10000);
      ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, nickname, reconnectToken: this.reconnectToken || undefined })));
      ws.addEventListener('message', (event) => {
        let message: ServerMessage;
        try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
        if (message.type === 'welcome') {
          this.slot = message.slot;
          this.reconnectToken = message.reconnectToken;
          this.inputSeq = 0;
          if (!settled) { settled = true; clearTimeout(timer); resolve(); }
        }
        if (message.type === 'lobby') this.lobby = message;
        if (message.type === 'snapshot') this.snapshot = message;
        if (message.type === 'error' && !settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(message.message));
        }
        this.dispatchEvent(new CustomEvent<ServerMessage>('message', { detail: message }));
      });
      ws.addEventListener('error', () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Connessione multiplayer non disponibile')); }
      });
      ws.addEventListener('close', () => { clearTimeout(timer); this.dispatchEvent(new Event('close')); });
    });
  }

  reserveCharacter(character: CharacterId): void { this.send({ type: 'reserve-character', character }); }
  setReady(ready: boolean): void { this.send({ type: 'ready', ready }); }
  start(): void { this.send({ type: 'start' }); }
  setPaused(paused: boolean): void { this.send({ type: 'pause', paused }); }
  sceneReady(sceneId: string): void { this.send({ type: 'scene-ready', sceneId }); }

  sendInput(input: Omit<PlayerInput, 'seq' | 'clientTime'>): number {
    const seq = ++this.inputSeq;
    this.send({ type: 'input', inputs: [{ ...input, seq, clientTime: Date.now() }] });
    return seq;
  }

  close(forgetSession = true): void {
    this.socket?.close();
    this.socket = undefined;
    if (forgetSession) {
      this.slot = undefined;
      this.reconnectToken = '';
      this.snapshot = undefined;
      this.lobby = undefined;
      this.inputSeq = 0;
    }
  }

  private send(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Stanza non connessa');
    this.socket.send(JSON.stringify(message));
  }
}
