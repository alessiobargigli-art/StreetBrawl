import { CHARACTERS, type CharacterId } from '../shared/campaign';
import type { ServerMessage } from '../shared/protocol';
import { CoopClient } from './CoopClient';

export interface CoopLobbyOptions { endpoint: string; onBack: () => void; onStarted: (client: CoopClient) => void }

export class CoopLobby {
  private readonly client: CoopClient;
  private room = '';
  private nickname = localStorage.getItem('streetbrawl-nickname') || 'PLAYER';
  private selected?: CharacterId;
  private ready = false;

  constructor(private readonly host: HTMLElement, private readonly options: CoopLobbyOptions) {
    this.client = new CoopClient(options.endpoint);
    this.client.addEventListener('message', (event) => this.onMessage((event as CustomEvent<ServerMessage>).detail));
  }

  showHome(prefillRoom = ''): void {
    this.host.hidden = false;
    this.host.innerHTML = `<div class="panel coop-panel"><h2>CO-OP ONLINE</h2><p>Combatti insieme. Massimo 2 giocatori.</p><label>NOME <input id="coop-name" maxlength="20" value="${this.escape(this.nickname)}"></label><div class="coop-actions"><button id="coop-create" class="primary">CREA STANZA</button><button id="coop-join">ENTRA</button><button id="coop-back">INDIETRO</button></div><label>CODICE STANZA <input id="coop-code" maxlength="6" value="${this.escape(prefillRoom)}" placeholder="ABC234"></label><p id="coop-error" class="coop-error"></p></div>`;
    this.bindIdentity();
    this.host.querySelector('#coop-back')?.addEventListener('click', this.options.onBack);
    this.host.querySelector('#coop-create')?.addEventListener('click', () => void this.create());
    this.host.querySelector('#coop-join')?.addEventListener('click', () => void this.join((this.host.querySelector<HTMLInputElement>('#coop-code')?.value || '')));
  }

  private bindIdentity(): void { this.host.querySelector<HTMLInputElement>('#coop-name')?.addEventListener('input', (e) => { this.nickname = (e.target as HTMLInputElement).value.trim() || 'PLAYER'; localStorage.setItem('streetbrawl-nickname', this.nickname); }); }
  private async create(): Promise<void> { try { this.error(''); const room = await this.client.createRoom(); await this.join(room); } catch (e) { this.error(this.message(e)); } }
  private async join(room: string): Promise<void> { room = room.trim().toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(room)) { this.error('Inserisci un codice stanza di 6 caratteri.'); return; } try { this.error(''); await this.client.connect(room, this.nickname); this.room = room; this.renderLobby(); history.replaceState(null, '', `?room=${room}`); } catch (e) { this.error(this.message(e)); } }

  private renderLobby(): void {
    const state = this.client.lobby;
    const cards = Object.values(CHARACTERS).map((c) => `<button class="character-card${this.selected === c.id ? ' selected' : ''}" data-character="${c.id}"><strong>${c.name}</strong><span>${c.description}</span><small>VEL ${c.speed} · POT ${c.power} · RES ${c.endurance}</small></button>`).join('');
    this.host.innerHTML = `<div class="panel coop-panel lobby-panel"><div class="room-line"><div><small>STANZA</small><strong>${this.room}</strong></div><button id="copy-room">COPIA LINK</button></div><div id="players" class="players"></div><h3>SCEGLI PERSONAGGIO</h3><div class="characters">${cards}</div><div class="coop-actions"><button id="ready" class="primary">${this.ready ? 'NON PRONTO' : 'PRONTO'}</button><button id="start" ${this.client.slot === 0 ? '' : 'hidden'}>START</button><button id="leave">ESCI</button></div><p id="coop-error" class="coop-error"></p></div>`;
    this.host.querySelectorAll<HTMLButtonElement>('[data-character]').forEach((button) => button.onclick = () => { this.selected = button.dataset.character as CharacterId; this.client.reserveCharacter(this.selected); this.renderLobby(); });
    this.host.querySelector('#ready')?.addEventListener('click', () => { if (!this.selected) { this.error('Scegli prima un personaggio.'); return; } this.ready = !this.ready; this.client.setReady(this.ready); this.renderLobby(); });
    this.host.querySelector('#start')?.addEventListener('click', () => { try { this.client.start(); } catch (e) { this.error(this.message(e)); } });
    this.host.querySelector('#leave')?.addEventListener('click', () => { this.client.close(); history.replaceState(null, '', location.pathname); this.options.onBack(); });
    this.host.querySelector('#copy-room')?.addEventListener('click', () => void navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${this.room}`));
    this.updatePlayers(state);
  }

  private updatePlayers(state = this.client.lobby): void { const el = this.host.querySelector<HTMLElement>('#players'); if (!el) return; const bySlot = new Map(state?.players.map((p) => [p.slot, p])); el.innerHTML = [0, 1].map((slot) => { const p = bySlot.get(slot as 0|1); return `<div class="player-slot ${p?.ready ? 'ready' : ''}"><strong>P${slot + 1}</strong><span>${p ? this.escape(p.nickname) : 'IN ATTESA…'}</span><small>${p?.character ? CHARACTERS[p.character].name : 'nessun personaggio'}${p?.ready ? ' · READY' : ''}</small></div>`; }).join(''); }
  private onMessage(message: ServerMessage): void { if (message.type === 'lobby') { if (this.host.querySelector('#players')) this.updatePlayers(message); else this.renderLobby(); } if (message.type === 'snapshot' && message.phase === 'playing') { this.host.hidden = true; this.options.onStarted(this.client); } if (message.type === 'error') this.error(message.message); }
  private error(text: string): void { const el = this.host.querySelector<HTMLElement>('#coop-error'); if (el) el.textContent = text; }
  private message(e: unknown): string { return e instanceof Error ? e.message : 'Errore multiplayer'; }
  private escape(value: string): string { return value.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
}
