import { PROTOCOL_VERSION, type PlayerSlot, type ServerMessage } from '../shared/protocol';
import type { CharacterId } from '../shared/campaign';

export interface CoopLobbyPlayer { slot: PlayerSlot; nickname: string; character: CharacterId | null; ready: boolean; connected: boolean }
export interface CoopLobbyState { room: string; hostSlot: PlayerSlot; continuesPerPlayer: number; players: CoopLobbyPlayer[] }

export class CoopClient extends EventTarget {
  private socket?: WebSocket;
  slot?: PlayerSlot;
  room = '';
  reconnectToken = '';
  lobby?: CoopLobbyState;

  constructor(private readonly endpoint: string) { super(); }

  async createRoom(): Promise<string> {
    const response = await fetch(`${this.endpoint}/rooms`, { method: 'POST' });
    if (!response.ok) throw new Error(`Creazione stanza fallita (${response.status})`);
    const data = await response.json() as { room: string };
    return data.room;
  }

  connect(room: string, nickname: string): Promise<void> {
    this.close();
    this.room = room.trim().toUpperCase();
    const base = new URL(this.endpoint);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${base.host}/rooms/${encodeURIComponent(this.room)}/ws`);
    this.socket = ws;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Timeout connessione stanza')), 10000);
      ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, nickname, reconnectToken: this.reconnectToken || undefined })));
      ws.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'welcome') { this.slot = message.slot; this.reconnectToken = message.reconnectToken; clearTimeout(timer); resolve(); }
        if (message.type === 'lobby') this.lobby = message;
        this.dispatchEvent(new CustomEvent<ServerMessage>('message', { detail: message }));
      });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Connessione multiplayer non disponibile')); });
      ws.addEventListener('close', () => this.dispatchEvent(new Event('close')));
    });
  }

  reserveCharacter(character: CharacterId): void { this.send({ type: 'reserve-character', character }); }
  setReady(ready: boolean): void { this.send({ type: 'ready', ready }); }
  start(): void { this.send({ type: 'start' }); }
  close(): void { this.socket?.close(); this.socket = undefined; }

  private send(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Stanza non connessa');
    this.socket.send(JSON.stringify(message));
  }
}
