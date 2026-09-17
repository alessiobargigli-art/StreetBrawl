import type { PlayerInput, WorldSnapshot } from '../shared/protocol';
import { CHARACTERS } from '../shared/campaign';
import { CoopClient } from './CoopClient';

export class CoopGame {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private latest?: WorldSnapshot;
  private previous?: WorldSnapshot;
  private latestAt = 0;
  private keys = new Set<string>();
  private virtual = new Set<string>();
  private lastSent = '';
  private lastInputAt = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly client: CoopClient) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D non disponibile');
    this.ctx = ctx;
    client.addEventListener('message', (event) => {
      const message = (event as CustomEvent).detail;
      if (message?.type === 'snapshot') {
        this.previous = this.latest;
        this.latest = message as WorldSnapshot;
        this.latestAt = performance.now();
      }
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.keys.clear();
    this.virtual.clear();
  }

  setVirtualKey(code: string, down: boolean): void {
    if (down) this.virtual.add(code); else this.virtual.delete(code);
  }

  resetInput(): void { this.keys.clear(); this.virtual.clear(); this.lastSent = ''; }

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyZ','KeyX'].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private down(code: string): boolean { return this.keys.has(code) || this.virtual.has(code); }

  private input(): Omit<PlayerInput, 'seq' | 'clientTime'> {
    return {
      moveX: (this.down('ArrowRight') ? 1 : 0) - (this.down('ArrowLeft') ? 1 : 0),
      moveY: (this.down('ArrowDown') ? 1 : 0) - (this.down('ArrowUp') ? 1 : 0),
      punch: this.down('KeyZ'), kick: this.down('KeyX'), jump: this.down('Space'),
    };
  }

  private loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const input = this.input();
    const signature = JSON.stringify(input);
    if (signature !== this.lastSent || now - this.lastInputAt >= 100) {
      try { this.client.sendInput(input); } catch { /* reconnect layer owns transport errors */ }
      this.lastSent = signature;
      this.lastInputAt = now;
    }
    this.render(now);
    this.raf = requestAnimationFrame(this.loop);
  };

  private render(now: number): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const snapshot = this.latest;
    if (!snapshot) {
      ctx.fillStyle = '#05070a'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('SINCRONIZZAZIONE...', canvas.width / 2, canvas.height / 2);
      return;
    }
    const alpha = Math.min(1, (now - this.latestAt) / (1000 / 15));
    const prevPlayers = new Map(this.previous?.players.map((p) => [p.slot, p]));
    const camera = this.previous ? this.previous.cameraX + (snapshot.cameraX - this.previous.cameraX) * alpha : snapshot.cameraX;
    const sky = snapshot.stage <= 2 ? '#10182b' : snapshot.stage <= 4 ? '#171522' : '#08141b';
    ctx.fillStyle = sky; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#182231'; ctx.fillRect(0,430,canvas.width,290);
    ctx.strokeStyle = '#31445b'; ctx.lineWidth = 2;
    for (let x = -(camera % 160); x < canvas.width; x += 160) { ctx.beginPath(); ctx.moveTo(x,430); ctx.lineTo(x-100,720); ctx.stroke(); }
    ctx.fillStyle = '#7ed8ff'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(`STAGE ${snapshot.stage} · ${snapshot.room}`, 24, 36);
    ctx.fillStyle = '#b8c7dc'; ctx.font = '14px system-ui'; ctx.fillText(`SERVER TICK ${snapshot.tick}`,24,58);

    for (const player of snapshot.players) {
      const prev = prevPlayers.get(player.slot);
      const xWorld = prev ? prev.x + (player.x - prev.x) * alpha : player.x;
      const y = prev ? prev.y + (player.y - prev.y) * alpha : player.y;
      const x = xWorld - camera;
      const own = player.slot === this.client.slot;
      ctx.save();
      ctx.translate(x, y - player.z * 54);
      ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(0,12,34,11,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = own ? '#ffd83d' : '#55d68b'; ctx.fillRect(-24,-82,48,78);
      ctx.fillStyle = '#f0c7a0'; ctx.beginPath(); ctx.arc(0,-96,18,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = own ? '#fff3a0' : '#b7ffd0'; ctx.lineWidth = 4; ctx.strokeRect(-27,-85,54,84);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui'; ctx.textAlign='center';
      const name = player.character ? CHARACTERS[player.character].name : player.nickname;
      ctx.fillText(`${own?'▶ ':''}${name}`,0,-124);
      ctx.fillStyle='#000'; ctx.fillRect(-32,-116,64,7); ctx.fillStyle='#e44'; ctx.fillRect(-32,-116,64*(player.health/player.maxHealth),7);
      ctx.restore();
    }

    for (const enemy of snapshot.enemies) {
      const x = enemy.x - camera;
      ctx.fillStyle='#c43b4b'; ctx.fillRect(x-22,enemy.y-72,44,70);
      ctx.fillStyle='#fff'; ctx.font='12px system-ui'; ctx.textAlign='center'; ctx.fillText(enemy.kind,x,enemy.y-82);
    }

    if (snapshot.phase === 'paused') {
      ctx.fillStyle='rgba(0,0,0,.65)'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#fff'; ctx.font='bold 46px system-ui'; ctx.textAlign='center'; ctx.fillText('PAUSA',canvas.width/2,canvas.height/2);
    }
  }
}
