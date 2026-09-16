type FighterKind = 'player' | 'enemy';
type FighterState = 'idle' | 'walk' | 'attack' | 'hitstun' | 'knockdown' | 'getup' | 'ko';
type AttackKind = 'jab' | 'cross' | 'finisher' | 'enemy';

type Fighter = {
  kind: FighterKind;
  x: number; y: number; vx: number; vy: number;
  width: number; height: number;
  health: number; maxHealth: number;
  facing: 1 | -1;
  state: FighterState;
  stateTime: number;
  attack?: AttackKind;
  attackHit: boolean;
  comboStep: number;
  comboWindow: number;
  hitFlash: number;
};

type AttackSpec = { duration: number; activeFrom: number; activeTo: number; damage: number; reach: number; knockback: number; knockdown: boolean };

const ATTACKS: Record<AttackKind, AttackSpec> = {
  jab:      { duration: .25, activeFrom: .075, activeTo: .13, damage: 8,  reach: 92,  knockback: 8,  knockdown: false },
  cross:    { duration: .29, activeFrom: .09,  activeTo: .16, damage: 10, reach: 98,  knockback: 12, knockdown: false },
  finisher: { duration: .46, activeFrom: .13,  activeTo: .22, damage: 18, reach: 116, knockback: 38, knockdown: true },
  enemy:    { duration: .48, activeFrom: .16,  activeTo: .24, damage: 9,  reach: 78,  knockback: 18, knockdown: false }
};

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly keys = new Set<string>();
  private readonly virtualKeys = new Set<string>();
  private readonly pressed = new Set<string>();
  private previous = performance.now();
  private accumulator = 0;
  private readonly fixedStep = 1 / 60;
  private freezeTime = 0;
  private shakeTime = 0;
  private enemyThink = .5;

  private readonly player: Fighter = this.makeFighter('player', 360, 470, 58, 112, 1);
  private readonly enemy: Fighter = this.makeFighter('enemy', 880, 455, 62, 116, -1);

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  private makeFighter(kind: FighterKind, x: number, y: number, width: number, height: number, facing: 1|-1): Fighter {
    return { kind, x, y, vx: 0, vy: 0, width, height, health: 100, maxHealth: 100, facing,
      state: 'idle', stateTime: 0, attackHit: false, comboStep: 0, comboWindow: 0, hitFlash: 0 };
  }

  start(): void { requestAnimationFrame(this.frame); }
  setVirtualKey(code: string, down: boolean): void {
    if (down && !this.virtualKeys.has(code)) this.pressed.add(code);
    if (down) this.virtualKeys.add(code); else this.virtualKeys.delete(code);
  }
  private down(code: string): boolean { return this.keys.has(code) || this.virtualKeys.has(code); }
  private consume(code: string): boolean { const hit = this.pressed.has(code); this.pressed.delete(code); return hit; }

  private frame = (now: number): void => {
    const delta = Math.min((now - this.previous) / 1000, .1); this.previous = now; this.accumulator += delta;
    while (this.accumulator >= this.fixedStep) { this.update(this.fixedStep); this.accumulator -= this.fixedStep; }
    this.render(); requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    if (this.freezeTime > 0) { this.freezeTime -= dt; this.pressed.clear(); return; }
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    this.updateFighterTimers(this.player, dt); this.updateFighterTimers(this.enemy, dt);
    this.updatePlayer(dt); this.updateEnemy(dt);
    this.integrate(this.player, dt); this.integrate(this.enemy, dt);
    this.pressed.clear();
  }

  private updateFighterTimers(f: Fighter, dt: number): void {
    f.stateTime += dt; f.hitFlash = Math.max(0, f.hitFlash - dt); f.comboWindow = Math.max(0, f.comboWindow - dt);
    if (f.comboWindow <= 0 && f.state !== 'attack') f.comboStep = 0;
    if (f.state === 'hitstun' && f.stateTime >= .22) this.setState(f, 'idle');
    if (f.state === 'knockdown' && f.stateTime >= .72) this.setState(f, f.health > 0 ? 'getup' : 'ko');
    if (f.state === 'getup' && f.stateTime >= .42) this.setState(f, 'idle');
    if (f.state === 'attack' && f.attack) {
      const spec = ATTACKS[f.attack];
      if (!f.attackHit && f.stateTime >= spec.activeFrom && f.stateTime <= spec.activeTo) {
        const target = f.kind === 'player' ? this.enemy : this.player;
        if (this.tryHit(f, target, spec)) f.attackHit = true;
      }
      if (f.stateTime >= spec.duration) { f.attack = undefined; this.setState(f, 'idle'); }
    }
  }

  private updatePlayer(dt: number): void {
    const f = this.player;
    if (['hitstun','knockdown','getup','ko'].includes(f.state)) return;
    if (f.state === 'attack') return;
    if (this.consume('KeyZ')) { this.startComboAttack(); return; }
    if (this.consume('KeyX')) { this.startAttack(f, 'finisher'); f.comboStep = 0; return; }
    let dx = 0, dy = 0;
    if (this.down('ArrowLeft')) dx--; if (this.down('ArrowRight')) dx++;
    if (this.down('ArrowUp')) dy--; if (this.down('ArrowDown')) dy++;
    if (dx !== 0) f.facing = dx > 0 ? 1 : -1;
    f.vx = dx * 285; f.vy = dy * 190;
    this.setLocomotion(f, dx !== 0 || dy !== 0 ? 'walk' : 'idle');
  }

  private startComboAttack(): void {
    const f = this.player;
    if (f.comboWindow > 0) f.comboStep = (f.comboStep % 3) + 1; else f.comboStep = 1;
    const kind: AttackKind = f.comboStep === 1 ? 'jab' : f.comboStep === 2 ? 'cross' : 'finisher';
    this.startAttack(f, kind); f.comboWindow = .62;
  }

  private updateEnemy(dt: number): void {
    const f = this.enemy;
    if (['attack','hitstun','knockdown','getup','ko'].includes(f.state)) return;
    const dx = this.player.x - f.x, dy = this.player.y - f.y;
    f.facing = dx >= 0 ? 1 : -1;
    this.enemyThink -= dt;
    if (Math.abs(dx) < 102 && Math.abs(dy) < 34 && this.enemyThink <= 0) {
      this.startAttack(f, 'enemy'); this.enemyThink = .8 + Math.random() * .45; return;
    }
    f.vx = Math.abs(dx) > 88 ? Math.sign(dx) * 118 : 0;
    f.vy = Math.abs(dy) > 14 ? Math.sign(dy) * 100 : 0;
    this.setLocomotion(f, f.vx !== 0 || f.vy !== 0 ? 'walk' : 'idle');
  }

  private startAttack(f: Fighter, kind: AttackKind): void {
    f.vx = 0; f.vy = 0; f.attack = kind; f.attackHit = false; this.setState(f, 'attack');
  }

  private tryHit(attacker: Fighter, target: Fighter, spec: AttackSpec): boolean {
    if (target.state === 'ko' || target.state === 'knockdown') return false;
    const inFront = (target.x - attacker.x) * attacker.facing > 0;
    if (!inFront || Math.abs(target.x-attacker.x) > spec.reach || Math.abs(target.y-attacker.y) > 40) return false;
    target.health = Math.max(0, target.health - spec.damage); target.hitFlash = .11;
    target.vx = attacker.facing * spec.knockback * 8; target.vy = 0;
    this.setState(target, spec.knockdown || target.health <= 0 ? 'knockdown' : 'hitstun');
    this.freezeTime = spec.knockdown ? .075 : .045; this.shakeTime = spec.knockdown ? .16 : .08;
    return true;
  }

  private integrate(f: Fighter, dt: number): void {
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.state === 'hitstun' || f.state === 'knockdown') f.vx *= Math.pow(.015, dt); else if (f.state !== 'walk') { f.vx = 0; f.vy = 0; }
    f.x = Math.max(70, Math.min(this.canvas.width-70, f.x)); f.y = Math.max(330, Math.min(610, f.y));
  }
  private setState(f: Fighter, state: FighterState): void { if (f.state !== state) { f.state = state; f.stateTime = 0; } }
  private setLocomotion(f: Fighter, state: 'idle'|'walk'): void { if (f.state === 'idle' || f.state === 'walk') this.setState(f, state); }

  private render(): void {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0,0,w,h); ctx.save();
    if (this.shakeTime > 0) ctx.translate((Math.random()-.5)*8, (Math.random()-.5)*5);
    const gradient=ctx.createLinearGradient(0,0,0,h); gradient.addColorStop(0,'#111827'); gradient.addColorStop(.58,'#1f2937'); gradient.addColorStop(.59,'#35322f'); gradient.addColorStop(1,'#171717');
    ctx.fillStyle=gradient; ctx.fillRect(-10,-10,w+20,h+20); this.drawBackdrop(); this.drawHud();
    [this.player,this.enemy].sort((a,b)=>a.y-b.y).forEach(f=>this.drawFighter(f)); ctx.restore();
  }

  private drawBackdrop(): void {
    const c=this.ctx; c.fillStyle='#0b0f16'; c.fillRect(0,260,this.canvas.width,155);
    for(let x=30;x<this.canvas.width;x+=150){c.fillStyle='#172033';c.fillRect(x,285,96,94);c.fillStyle='#d6a64a';c.fillRect(x+18,302,22,34);c.fillRect(x+54,302,22,34);}
    c.strokeStyle='#58514a';c.lineWidth=3;c.beginPath();c.moveTo(0,515);c.lineTo(this.canvas.width,515);c.stroke();
  }
  private drawHud(): void { this.drawHealthBar(32,28,360,this.player.health/100,'PLAYER 1'); this.drawHealthBar(this.canvas.width-392,28,360,this.enemy.health/100,'THUG'); }
  private drawHealthBar(x:number,y:number,width:number,ratio:number,label:string):void{const c=this.ctx;c.font='700 22px system-ui';c.fillStyle='#f5f5f5';c.fillText(label,x,y-7);c.fillStyle='#240f12';c.fillRect(x,y,width,18);c.fillStyle=ratio>.3?'#e64a42':'#f0b13d';c.fillRect(x,y,width*ratio,18);c.strokeStyle='#f5f5f5';c.strokeRect(x,y,width,18);}

  private drawFighter(f: Fighter): void {
    const c=this.ctx, scale=.78+((f.y-330)/280)*.22, bw=f.width*scale, bh=f.height*scale;
    let bob=0, lean=0, armReach=.62;
    if(f.state==='walk') bob=Math.sin(f.stateTime*18)*3;
    if(f.state==='attack'&&f.attack){const p=f.stateTime/ATTACKS[f.attack].duration; armReach=f.attack==='finisher'?.95:.82; lean=Math.sin(Math.min(1,p)*Math.PI)*f.facing*7;}
    const x=f.x-bw/2+lean, y=f.y-bh+bob;
    c.save(); c.globalAlpha=f.state==='ko'?.38:1;
    c.fillStyle='rgba(0,0,0,.35)';c.beginPath();c.ellipse(f.x,f.y+5,bw*.58,15*scale,0,0,Math.PI*2);c.fill();
    if(f.state==='knockdown'||f.state==='ko'){c.translate(f.x,f.y-18);c.rotate(f.facing*.12);c.fillStyle=f.hitFlash>0?'#fff':f.kind==='player'?'#2ba9ff':'#d24949';c.fillRect(-bh*.42,-bw*.28,bh*.78,bw*.56);c.restore();return;}
    c.fillStyle=f.hitFlash>0?'#fff':f.kind==='player'?'#2ba9ff':'#d24949';c.fillRect(x+bw*.2,y+bh*.27,bw*.6,bh*.52);
    c.fillStyle=f.kind==='player'?'#d5b08c':'#a77758';c.beginPath();c.arc(f.x+lean,y+bh*.16,bw*.24,0,Math.PI*2);c.fill();
    c.fillStyle='#111';const stride=f.state==='walk'?Math.sin(f.stateTime*18)*7:0;c.fillRect(x+bw*.25-stride,y+bh*.78,bw*.18,bh*.22);c.fillRect(x+bw*.57+stride,y+bh*.78,bw*.18,bh*.22);
    c.strokeStyle=f.kind==='player'?'#8fd2ff':'#ff9999';c.lineWidth=6*scale;c.beginPath();c.moveTo(f.x+lean+f.facing*bw*.18,y+bh*.42);c.lineTo(f.x+lean+f.facing*bw*armReach,y+bh*(f.attack==='finisher'?.58:.48));c.stroke();
    c.restore();
  }
}
