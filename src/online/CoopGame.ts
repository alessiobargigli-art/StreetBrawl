import type { EnemySnapshot, PlayerInput, PlayerSnapshot, WorldSnapshot } from '../shared/protocol';
import { SIMULATION_HZ } from '../shared/protocol';
import { CHARACTERS, STAGES, type CharacterId, type MusicId } from '../shared/campaign';
import type { CoopClient } from './CoopClient';

type Axis = -1 | 0 | 1;
type Frame = {
  index: number;
  rect: { x: number; y: number; w: number; h: number };
  sourceSize?: { w: number; h: number };
  trimOffset?: { x: number; y: number };
  pivot: { x: number; y: number };
};
type Anim = { frames: number[]; durationsMs: number[]; loop: boolean };
type Atlas = { character: string; frames: Frame[]; animations: Record<string, Anim> };
type AtlasKey = CharacterId | 'roxy' | 'switch' | 'rivet' | 'crane';
type GameClient = Pick<CoopClient, 'slot' | 'sendInput' | 'addEventListener' | 'removeEventListener'> & { snapshot?: WorldSnapshot };

export type CoopAudioEvent = {
  sfx?: 'punch' | 'kick' | 'playerHit' | 'enemyKo' | 'bossWarning' | 'stageClear' | 'victory' | 'gameOver';
  music?: MusicId;
  stopMusic?: boolean;
};

export class CoopGame extends EventTarget {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private stopped = false;
  private latest?: WorldSnapshot;
  private previous?: WorldSnapshot;
  private latestAt = 0;
  private keys = new Set<string>();
  private virtual = new Set<string>();
  private lastSent = '';
  private lastInputAt = 0;
  private images = new Map<string, HTMLImageElement>();
  private atlases = new Map<string, Atlas>();
  private lastStage = 0;
  private lastPhase = '';

  private readonly onClientMessage = (event: Event) => {
    const message = (event as CustomEvent).detail;
    if (message?.type !== 'snapshot') return;
    this.previous = this.latest;
    this.latest = message as WorldSnapshot;
    this.latestAt = performance.now();
    this.observeSnapshot(this.latest, this.previous);
  };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly client: GameClient) {
    super();
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D non disponibile');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    this.latest = client.snapshot;
    this.latestAt = performance.now();
    void this.loadArt();
    client.addEventListener('message', this.onClientMessage);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  start() {
    if (this.running || this.stopped) return;
    if (this.latest && !this.lastStage) this.observeSnapshot(this.latest, undefined);
    this.running = true;
    this.loop();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.keys.clear();
    this.virtual.clear();
    this.client.removeEventListener('message', this.onClientMessage);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  setVirtualKey(code: string, down: boolean) {
    down ? this.virtual.add(code) : this.virtual.delete(code);
  }

  resetInput() {
    this.keys.clear();
    this.virtual.clear();
    this.lastSent = '';
  }

  get snapshot() { return this.latest; }

  private observeSnapshot(current: WorldSnapshot, previous?: WorldSnapshot) {
    if (!this.lastStage) {
      this.lastStage = current.stage;
      this.lastPhase = current.phase;
      const bossPresent = current.enemies.some(enemy => enemy.kind.startsWith('boss:'));
      this.emitAudio({ music: bossPresent ? STAGES[current.stage - 1].bossMusic : STAGES[current.stage - 1].music });
      if (current.phase === 'victory') {
        this.dispatchEvent(new CustomEvent('story', { detail: { kind: 'finale', stage: current.stage } }));
        this.emitAudio({ sfx: 'victory', stopMusic: true });
      } else if (current.phase === 'game-over') {
        this.emitAudio({ sfx: 'gameOver', stopMusic: true });
      } else if (!this.client.activeScene) {
        this.dispatchEvent(new CustomEvent('story', { detail: { kind: 'stage-intro', stage: current.stage } }));
      }
    } else if (current.stage !== this.lastStage) {
      const old = this.lastStage;
      this.lastStage = current.stage;
      this.dispatchEvent(new CustomEvent('story', { detail: { kind: 'stage-transition', from: old, stage: current.stage } }));
      this.emitAudio({ sfx: 'stageClear', music: STAGES[current.stage - 1].music });
    }

    if (current.phase !== this.lastPhase) {
      if (current.phase === 'victory') {
        this.dispatchEvent(new CustomEvent('story', { detail: { kind: 'finale', stage: current.stage } }));
        this.emitAudio({ sfx: 'victory', stopMusic: true });
      } else if (current.phase === 'game-over') {
        this.emitAudio({ sfx: 'gameOver', stopMusic: true });
      }
      this.lastPhase = current.phase;
    }

    if (!previous) return;
    const previousEnemies = new Map(previous.enemies.map(enemy => [enemy.id, enemy]));
    const currentEnemies = new Map(current.enemies.map(enemy => [enemy.id, enemy]));
    const previousPlayers = new Map(previous.players.map(player => [player.slot, player]));

    for (const enemy of current.enemies) {
      const old = previousEnemies.get(enemy.id);
      if (!old && enemy.kind.startsWith('boss:')) {
        this.emitAudio({ sfx: 'bossWarning', music: STAGES[current.stage - 1].bossMusic });
      } else if (old && enemy.health < old.health) {
        this.emitAudio({ sfx: 'punch' });
      }
    }

    for (const enemy of previous.enemies) {
      if (!currentEnemies.has(enemy.id) && enemy.health > 0) this.emitAudio({ sfx: 'enemyKo' });
    }

    for (const player of current.players) {
      const old = previousPlayers.get(player.slot);
      if (old && player.health < old.health) this.emitAudio({ sfx: 'playerHit' });
      if (old && player.actionStartedTick !== old.actionStartedTick && (player.action === 'punch' || player.action === 'kick')) {
        this.emitAudio({ sfx: player.action });
      }
    }
  }

  private emitAudio(detail: CoopAudioEvent) {
    this.dispatchEvent(new CustomEvent<CoopAudioEvent>('audio', { detail }));
  }

  private async loadArt() {
    const legacy = {
      alex: '/assets/fighters/alex.svg',
      thug: '/assets/fighters/thug.svg',
      ripper: '/assets/fighters/ripper.svg',
      bruno: '/assets/fighters/bruno.svg',
      'dock-master': '/assets/fighters/dock-master.svg',
      stage1: '/assets/stages/stage1-street.svg',
      stage2: '/assets/stages/coop-stage2-market.svg',
      stage3: '/assets/stages/coop-stage3-train.svg',
      stage4: '/assets/stages/coop-stage4-depot.svg',
      stage5: '/assets/stages/coop-stage5-harbor.svg',
      stage6: '/assets/stages/coop-stage6-cargo.svg',
    };
    for (const [key, url] of Object.entries(legacy)) this.loadImage(key, url);

    const keys: AtlasKey[] = ['alex', 'matt', 'elisa', 'gaga', 'roxy', 'switch', 'rivet', 'crane'];
    await Promise.all(keys.map(async key => {
      const dir = ['roxy', 'switch', 'rivet', 'crane'].includes(key) ? 'bosses' : 'coop';
      try {
        const atlas = await fetch(`/assets/fighters/${dir}/${key}.json`).then(response => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json() as Promise<Atlas>;
        });
        this.atlases.set(key, atlas);
        this.loadImage(key, `/assets/fighters/${dir}/${key}.png`);
      } catch (error) {
        console.warn(`Atlas ${key} non disponibile`, error);
      }
    }));
  }

  private loadImage(key: string, url: string) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    this.images.set(key, image);
    void image.decode().catch(() => {});
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyZ', 'KeyX'].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private down(code: string) { return this.keys.has(code) || this.virtual.has(code); }
  private axis(positive: string, negative: string): Axis {
    return this.down(positive) ? (this.down(negative) ? 0 : 1) : (this.down(negative) ? -1 : 0);
  }

  private input(): Omit<PlayerInput, 'seq' | 'clientTime'> {
    return {
      moveX: this.axis('ArrowRight', 'ArrowLeft'),
      moveY: this.axis('ArrowDown', 'ArrowUp'),
      punch: this.down('KeyZ'),
      kick: this.down('KeyX'),
      jump: this.down('Space'),
    };
  }

  private loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const input = this.input();
    const signature = JSON.stringify(input);
    if (signature !== this.lastSent || now - this.lastInputAt >= 100) {
      try { this.client.sendInput(input); } catch {}
      this.lastSent = signature;
      this.lastInputAt = now;
    }
    this.render(now);
    this.raf = requestAnimationFrame(this.loop);
  };

  private render(now: number) {
    const { ctx, canvas } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const snapshot = this.latest;
    if (!snapshot) {
      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('SINCRONIZZAZIONE...', canvas.width / 2, canvas.height / 2);
      return;
    }

    const alpha = Math.min(1, (now - this.latestAt) / (1000 / 15));
    const previousPlayers = new Map(this.previous?.players.map(player => [player.slot, player]));
    const previousEnemies = new Map(this.previous?.enemies.map(enemy => [enemy.id, enemy]));
    const camera = this.previous
      ? this.previous.cameraX + (snapshot.cameraX - this.previous.cameraX) * alpha
      : snapshot.cameraX;

    this.drawBackground(snapshot.stage, camera);
    this.drawTelegraphs(snapshot, camera, now);
    this.drawHud(snapshot);

    const actors = [
      ...snapshot.players.map(player => ({ y: player.y, type: 'player' as const, data: player })),
      ...snapshot.enemies.map(enemy => ({ y: enemy.y, type: 'enemy' as const, data: enemy })),
    ].sort((a, b) => a.y - b.y);

    for (const actor of actors) {
      if (actor.type === 'player') {
        this.drawPlayer(actor.data, previousPlayers.get(actor.data.slot), alpha, camera, now, snapshot);
      } else {
        this.drawEnemy(actor.data, previousEnemies.get(actor.data.id), alpha, camera, now, snapshot);
      }
    }

    if (snapshot.phase === 'paused') this.overlay('PAUSA');
    else if (snapshot.phase === 'victory') this.overlay('NEON CORNER È SALVA!');
    else if (snapshot.phase === 'game-over') this.overlay('GAME OVER');
  }

  private drawBackground(stage: number, camera: number) {
    const { ctx, canvas } = this;
    const image = this.images.get(`stage${stage}`);
    if (image?.complete && image.naturalWidth) {
      const scale = canvas.height / image.naturalHeight;
      const width = image.naturalWidth * scale;
      for (let x = -(camera * 0.35 % width); x < canvas.width; x += width) ctx.drawImage(image, x, 0, width, canvas.height);
      ctx.fillStyle = 'rgba(5,8,18,.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const colors = ['#11172a', '#24131d', '#101827', '#241b18', '#071820', '#09121b'];
    ctx.fillStyle = colors[stage - 1] || '#101820';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#202b38';
    ctx.fillRect(0, 430, canvas.width, 290);
  }

  private drawTelegraphs(snapshot: WorldSnapshot, camera: number, now: number) {
    const ctx = this.ctx;
    const pulse = 0.38 + 0.22 * Math.sin(now / 80);
    for (const enemy of snapshot.enemies) {
      if (!enemy.state.startsWith('telegraph-')) continue;
      const x = enemy.x - camera;
      const y = enemy.y;
      const move = enemy.state.slice(10);
      ctx.save();
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeStyle = `rgba(255,215,55,${0.7 + pulse})`;
      ctx.fillStyle = `rgba(255,70,55,${0.12 + pulse * 0.12})`;
      if (move === 'slam') {
        ctx.beginPath(); ctx.ellipse(x, y, 155, 105, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        this.warning('SLAM!', x, y - 125);
      } else if (move === 'sweep') {
        ctx.fillRect(x - 230, y - 78, 460, 156); ctx.strokeRect(x - 230, y - 78, 460, 156);
        ctx.fillStyle = 'rgba(70,230,150,.25)'; ctx.fillRect(x - 58, y - 78, 116, 156);
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(120,255,190,.9)'; ctx.strokeRect(x - 58, y - 78, 116, 156);
        this.warning('SWEEP!  ZONA VERDE = SICURA', x, y - 105);
      } else if (move === 'dash') {
        ctx.beginPath(); ctx.moveTo(x - 190, y); ctx.lineTo(x + 190, y); ctx.stroke(); this.warning('DASH!', x, y - 100);
      } else if (move === 'combo') {
        ctx.beginPath(); ctx.arc(x, y, 100, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); this.warning('COMBO!', x, y - 115);
      }
      ctx.restore();
    }
  }

  private warning(text: string, x: number, y: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#111';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#ffe55c';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawHud(snapshot: WorldSnapshot) {
    const { ctx, canvas } = this;
    const stage = STAGES[snapshot.stage - 1];
    ctx.fillStyle = 'rgba(4,7,12,.78)'; ctx.fillRect(0, 0, canvas.width, 82);
    ctx.fillStyle = '#7ed8ff'; ctx.font = 'bold 21px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${stage.title} — ${stage.subtitle}`, canvas.width / 2, 28);
    ctx.fillStyle = '#b8c7dc'; ctx.font = '13px system-ui';
    ctx.fillText(`STAGE ${snapshot.stage} · ${stage.boss.toUpperCase()} · TICK ${snapshot.tick}`, canvas.width / 2, 49);
    snapshot.players.filter(player => player.connected).forEach((player, index) => {
      const left = index === 0 ? 20 : canvas.width - 300;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'left';
      ctx.fillText(`P${player.slot + 1} ${player.character ? CHARACTERS[player.character].name : player.nickname}  C:${player.continues}`, left, 24);
      ctx.fillStyle = '#111'; ctx.fillRect(left, 36, 280, 14);
      ctx.fillStyle = player.slot === this.client.slot ? '#ffd83d' : '#55d68b';
      ctx.fillRect(left + 2, 38, 276 * Math.max(0, player.health / player.maxHealth), 10);
    });
    const boss = snapshot.enemies.find(enemy => enemy.kind.startsWith('boss:'));
    if (boss) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(boss.kind.slice(5).toUpperCase(), canvas.width / 2, 67);
      ctx.fillStyle = '#111'; ctx.fillRect(canvas.width / 2 - 170, 72, 340, 8);
      ctx.fillStyle = '#d23a49'; ctx.fillRect(canvas.width / 2 - 168, 74, 336 * (boss.health / boss.maxHealth), 4);
    }
  }

  private drawPlayer(player: PlayerSnapshot, previous: PlayerSnapshot | undefined, alpha: number, camera: number, now: number, snapshot: WorldSnapshot) {
    const xw = previous ? previous.x + (player.x - previous.x) * alpha : player.x;
    const y = previous ? previous.y + (player.y - previous.y) * alpha : player.y;
    const z = previous ? previous.z + (player.z - previous.z) * alpha : player.z;
    const x = xw - camera;
    const own = player.slot === this.client.slot;
    const key = player.character ?? 'alex';
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y - z * 58);
    this.shadow();
    ctx.save();
    ctx.scale(player.facing, 1);
    if (!this.drawAtlas(key, player.state, player.action, player.actionStartedTick, now, 1.35, snapshot)) {
      this.drawLegacy('alex', player.state, player.action, player.actionStartedTick, now, snapshot);
    }
    ctx.restore();
    ctx.strokeStyle = own ? '#fff3a0' : '#b7ffd0'; ctx.lineWidth = own ? 3 : 2;
    ctx.beginPath(); ctx.ellipse(0, 4, 42, 12, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${own ? '▶ ' : ''}${CHARACTERS[key].name}`, 0, -168);
    ctx.restore();
  }

  private drawEnemy(enemy: EnemySnapshot, previous: EnemySnapshot | undefined, alpha: number, camera: number, now: number, snapshot: WorldSnapshot) {
    const xw = previous ? previous.x + (enemy.x - previous.x) * alpha : enemy.x;
    const y = previous ? previous.y + (enemy.y - previous.y) * alpha : enemy.y;
    const x = xw - camera;
    const bossName = enemy.kind.startsWith('boss:') ? enemy.kind.slice(5).toLowerCase().replace(/\s+/g, '-') : '';
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    this.shadow();
    ctx.save();
    ctx.scale(enemy.facing, 1);
    const imported = (['roxy', 'switch', 'rivet', 'crane'] as string[]).includes(bossName) &&
      this.drawAtlas(bossName, enemy.state, enemy.action, enemy.actionStartedTick, now, 1.4, snapshot);
    if (!imported) {
      const key = enemy.kind.startsWith('boss:') ? (bossName === 'dock-master' ? 'dock-master' : 'bruno') : enemy.kind === 'ripper' ? 'ripper' : 'thug';
      this.drawLegacy(key, enemy.state, enemy.action, enemy.actionStartedTick, now, snapshot);
    }
    ctx.restore();
    ctx.fillStyle = '#111'; ctx.fillRect(-35, -166, 70, 7);
    ctx.fillStyle = enemy.kind.startsWith('boss:') ? '#e33' : '#f07878';
    ctx.fillRect(-34, -165, 68 * Math.max(0, enemy.health / enemy.maxHealth), 5);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(enemy.kind.startsWith('boss:') ? enemy.kind.slice(5).toUpperCase() : enemy.kind.toUpperCase(), 0, -174);
    ctx.restore();
  }

  private shadow() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.beginPath(); ctx.ellipse(0, 8, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
  }

  private drawLegacy(key: string, state: string, action: string, actionStartedTick: number, now: number, snapshot: WorldSnapshot) {
    const image = this.images.get(key);
    if (!image?.complete || !image.naturalWidth) return false;
    const frameWidth = image.naturalWidth >= 1024 ? image.naturalWidth / 8 : 128;
    const frameHeight = image.naturalHeight || 128;
    const tickElapsed = Math.max(0, snapshot.tick - actionStartedTick) * (1000 / SIMULATION_HZ);
    const interpolationElapsed = snapshot.phase === 'paused' ? 0 : Math.max(0, now - this.latestAt);
    const elapsed = tickElapsed + interpolationElapsed;
    const frame = this.legacyFrame(state, action, elapsed);
    this.ctx.drawImage(image, frame * frameWidth, 0, frameWidth, frameHeight, -64, -154, 128, 160);
    return true;
  }

  private legacyFrame(state: string, action: string, elapsed: number) {
    if (state === 'ko' || state === 'down') return 6;
    if (state === 'getup') return 7;
    if (state === 'hurt' || state === 'recover') return 5;
    if (state.startsWith('telegraph-')) return 4;
    if (state.startsWith('special-')) return Math.floor(elapsed / 90) % 2 ? 3 : 2;
    if (action === 'kick') return 4;
    if (action === 'punch' || state === 'attack') return elapsed < 90 ? 2 : 3;
    if (state === 'walk' || state.startsWith('entering')) return Math.floor(elapsed / 130) % 2;
    return 0;
  }

  private drawAtlas(key: string, state: string, action: string, actionStartedTick: number, now: number, scale: number, snapshot: WorldSnapshot) {
    const atlas = this.atlases.get(key);
    const image = this.images.get(key);
    if (!atlas || !image?.complete || !image.naturalWidth) return false;
    const animationName = this.animFor(state, action, atlas);
    const animation = atlas.animations[animationName] ?? atlas.animations.idle;
    const tickElapsed = Math.max(0, snapshot.tick - actionStartedTick) * (1000 / SIMULATION_HZ);
    const interpolationElapsed = snapshot.phase === 'paused' ? 0 : Math.max(0, now - this.latestAt);
    const rawElapsed = tickElapsed + interpolationElapsed;
    const total = animation.durationsMs.reduce((sum, value) => sum + value, 0) || 1;
    const elapsed = animation.loop ? rawElapsed % total : Math.min(rawElapsed, total - 1);
    let accumulator = 0;
    let frameIndex = animation.frames[animation.frames.length - 1] ?? 0;
    for (let index = 0; index < animation.frames.length; index++) {
      accumulator += animation.durationsMs[index] ?? 100;
      if (elapsed < accumulator) {
        frameIndex = animation.frames[index];
        break;
      }
    }

    const frame = atlas.frames[frameIndex] ?? atlas.frames[0];
    const width = frame.rect.w * scale;
    const height = frame.rect.h * scale;
    const source = frame.sourceSize;
    const pivotX = source ? this.clamp01((frame.pivot.x * source.w - frame.rect.x) / frame.rect.w) : 0.5;
    const pivotY = source ? this.clamp01((frame.pivot.y * source.h - frame.rect.y) / frame.rect.h) : 1;
    this.ctx.drawImage(
      image,
      frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h,
      -width * pivotX, -height * pivotY, width, height,
    );
    return true;
  }

  private animFor(state: string, action: string, atlas: Atlas) {
    if (state.startsWith('telegraph-')) return atlas.animations.specialTell ? 'specialTell' : 'idle';
    if (state.startsWith('special-')) return atlas.animations.punch ? 'punch' : 'idle';
    if (state === 'recover') return atlas.animations.hurt ? 'hurt' : 'idle';
    if (action === 'kick') return atlas.animations.kick ? 'kick' : 'punch';
    if (action === 'punch' || state === 'attack') return 'punch';
    if (state === 'walk' || state.startsWith('entering')) return 'walk';
    if (state === 'hurt') return 'hurt';
    if (state === 'ko' || state === 'down') return 'ko';
    if (state === 'getup') return atlas.animations.getup ? 'getup' : 'idle';
    return 'idle';
  }

  private clamp01(value: number) { return Math.max(0, Math.min(1, value)); }

  private overlay(text: string) {
    const { ctx, canvas } = this;
    ctx.fillStyle = 'rgba(0,0,0,.68)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 46px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
}
