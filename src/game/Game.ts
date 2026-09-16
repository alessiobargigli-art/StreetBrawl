type FighterKind = 'player' | 'enemy';

type Fighter = {
  kind: FighterKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  facing: 1 | -1;
  attackCooldown: number;
  hitFlash: number;
};

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly keys = new Set<string>();
  private readonly virtualKeys = new Set<string>();
  private previous = performance.now();
  private accumulator = 0;
  private readonly fixedStep = 1 / 60;

  private readonly player: Fighter = {
    kind: 'player', x: 360, y: 470, vx: 0, vy: 0,
    width: 58, height: 112, health: 100, maxHealth: 100,
    facing: 1, attackCooldown: 0, hitFlash: 0
  };

  private readonly enemy: Fighter = {
    kind: 'enemy', x: 880, y: 455, vx: 0, vy: 0,
    width: 62, height: 116, health: 100, maxHealth: 100,
    facing: -1, attackCooldown: 0, hitFlash: 0
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  setVirtualKey(code: string, down: boolean): void {
    if (down) this.virtualKeys.add(code);
    else this.virtualKeys.delete(code);
  }

  private frame = (now: number): void => {
    const delta = Math.min((now - this.previous) / 1000, 0.1);
    this.previous = now;
    this.accumulator += delta;

    while (this.accumulator >= this.fixedStep) {
      this.update(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }

    this.render();
    requestAnimationFrame(this.frame);
  };

  private down(code: string): boolean {
    return this.keys.has(code) || this.virtualKeys.has(code);
  }

  private update(dt: number): void {
    this.updatePlayer(dt);
    this.updateEnemy(dt);

    for (const fighter of [this.player, this.enemy]) {
      fighter.attackCooldown = Math.max(0, fighter.attackCooldown - dt);
      fighter.hitFlash = Math.max(0, fighter.hitFlash - dt);
      fighter.x = Math.max(70, Math.min(this.canvas.width - 70, fighter.x));
      fighter.y = Math.max(330, Math.min(610, fighter.y));
    }
  }

  private updatePlayer(dt: number): void {
    const speedX = 285;
    const speedY = 190;
    let dx = 0;
    let dy = 0;

    if (this.down('ArrowLeft')) dx -= 1;
    if (this.down('ArrowRight')) dx += 1;
    if (this.down('ArrowUp')) dy -= 1;
    if (this.down('ArrowDown')) dy += 1;

    if (dx !== 0) this.player.facing = dx > 0 ? 1 : -1;
    this.player.x += dx * speedX * dt;
    this.player.y += dy * speedY * dt;

    if (this.down('KeyZ') && this.player.attackCooldown <= 0) {
      this.attack(this.player, this.enemy, 14, 96);
      this.player.attackCooldown = 0.34;
    }

    if (this.down('KeyX') && this.player.attackCooldown <= 0) {
      this.attack(this.player, this.enemy, 22, 118);
      this.player.attackCooldown = 0.52;
    }
  }

  private updateEnemy(dt: number): void {
    if (this.enemy.health <= 0) return;

    const dx = this.player.x - this.enemy.x;
    const dy = this.player.y - this.enemy.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    this.enemy.facing = dx >= 0 ? 1 : -1;

    if (absY > 16) this.enemy.y += Math.sign(dy) * 105 * dt;
    if (absX > 92) this.enemy.x += Math.sign(dx) * 125 * dt;

    if (absX < 105 && absY < 34 && this.enemy.attackCooldown <= 0) {
      this.attack(this.enemy, this.player, 9, 74);
      this.enemy.attackCooldown = 0.95;
    }
  }

  private attack(attacker: Fighter, target: Fighter, damage: number, reach: number): void {
    if (target.health <= 0) return;

    const inFront = (target.x - attacker.x) * attacker.facing > 0;
    const closeX = Math.abs(target.x - attacker.x) <= reach;
    const closeY = Math.abs(target.y - attacker.y) <= 42;
    if (!inFront || !closeX || !closeY) return;

    target.health = Math.max(0, target.health - damage);
    target.hitFlash = 0.12;
    target.x += attacker.facing * 18;
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(0.58, '#1f2937');
    gradient.addColorStop(0.59, '#35322f');
    gradient.addColorStop(1, '#171717');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    this.drawBackdrop();
    this.drawHud();

    const fighters = [this.player, this.enemy].sort((a, b) => a.y - b.y);
    fighters.forEach((fighter) => this.drawFighter(fighter));
  }

  private drawBackdrop(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b0f16';
    ctx.fillRect(0, 260, this.canvas.width, 155);

    for (let x = 30; x < this.canvas.width; x += 150) {
      ctx.fillStyle = '#172033';
      ctx.fillRect(x, 285, 96, 94);
      ctx.fillStyle = '#d6a64a';
      ctx.fillRect(x + 18, 302, 22, 34);
      ctx.fillRect(x + 54, 302, 22, 34);
    }

    ctx.strokeStyle = '#58514a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 515);
    ctx.lineTo(this.canvas.width, 515);
    ctx.stroke();
  }

  private drawHud(): void {
    this.drawHealthBar(32, 28, 360, this.player.health / this.player.maxHealth, 'PLAYER 1');
    this.drawHealthBar(this.canvas.width - 392, 28, 360, this.enemy.health / this.enemy.maxHealth, 'THUG');
  }

  private drawHealthBar(x: number, y: number, width: number, ratio: number, label: string): void {
    const ctx = this.ctx;
    ctx.font = '700 22px system-ui';
    ctx.fillStyle = '#f5f5f5';
    ctx.fillText(label, x, y - 7);
    ctx.fillStyle = '#240f12';
    ctx.fillRect(x, y, width, 18);
    ctx.fillStyle = ratio > 0.3 ? '#e64a42' : '#f0b13d';
    ctx.fillRect(x, y, width * ratio, 18);
    ctx.strokeStyle = '#f5f5f5';
    ctx.strokeRect(x, y, width, 18);
  }

  private drawFighter(fighter: Fighter): void {
    const ctx = this.ctx;
    const scale = 0.78 + ((fighter.y - 330) / 280) * 0.22;
    const bodyW = fighter.width * scale;
    const bodyH = fighter.height * scale;
    const x = fighter.x - bodyW / 2;
    const y = fighter.y - bodyH;

    ctx.save();
    ctx.globalAlpha = fighter.health <= 0 ? 0.38 : 1;

    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(fighter.x, fighter.y + 5, bodyW * 0.58, 15 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = fighter.hitFlash > 0 ? '#ffffff' : fighter.kind === 'player' ? '#2ba9ff' : '#d24949';
    ctx.fillRect(x + bodyW * 0.2, y + bodyH * 0.27, bodyW * 0.6, bodyH * 0.52);

    ctx.fillStyle = fighter.kind === 'player' ? '#d5b08c' : '#a77758';
    ctx.beginPath();
    ctx.arc(fighter.x, y + bodyH * 0.16, bodyW * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111';
    ctx.fillRect(x + bodyW * 0.25, y + bodyH * 0.78, bodyW * 0.18, bodyH * 0.22);
    ctx.fillRect(x + bodyW * 0.57, y + bodyH * 0.78, bodyW * 0.18, bodyH * 0.22);

    ctx.strokeStyle = fighter.kind === 'player' ? '#8fd2ff' : '#ff9999';
    ctx.lineWidth = 6 * scale;
    ctx.beginPath();
    ctx.moveTo(fighter.x + fighter.facing * bodyW * 0.18, y + bodyH * 0.42);
    ctx.lineTo(fighter.x + fighter.facing * bodyW * 0.62, y + bodyH * 0.48);
    ctx.stroke();

    ctx.restore();
  }
}
