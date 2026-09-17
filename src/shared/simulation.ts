import {
  CHARACTERS,
  DEFAULT_CONTINUES_PER_PLAYER,
  STAGES,
  type CharacterId,
  type EncounterDefinition,
  type StageId,
} from './campaign';
import {
  PROTOCOL_VERSION,
  type Facing,
  type PlayerInput,
  type PlayerSlot,
  type WorldSnapshot,
} from './protocol';

export type SimPlayerState = 'idle' | 'walk' | 'attack' | 'jump' | 'hurt' | 'down' | 'getup' | 'ko';

export interface SimPlayer {
  slot: PlayerSlot;
  nickname: string;
  character: CharacterId | null;
  x: number;
  y: number;
  z: number;
  health: number;
  maxHealth: number;
  continues: number;
  state: SimPlayerState;
  action: string;
  facing: Facing;
  actionStartedTick: number;
  ready: boolean;
  connected: boolean;
  lastProcessedInputSeq: number;
}

export interface SimEnemy {
  id: number;
  kind: string;
  x: number;
  y: number;
  z: number;
  health: number;
  maxHealth: number;
  state: string;
  action: string;
  facing: Facing;
  actionStartedTick: number;
}

export interface SimulationState {
  tick: number;
  stage: StageId;
  phase: 'lobby' | 'playing' | 'paused' | 'stage-clear' | 'victory' | 'game-over';
  cameraX: number;
  players: SimPlayer[];
  enemies: SimEnemy[];
}

type HeldInput = {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  punch: boolean;
  kick: boolean;
  jump: boolean;
};

type AttackRuntime = {
  id: number;
  kind: 'punch' | 'kick';
  tick: number;
  hitEnemyIds: Set<number>;
};

type PlayerRuntime = {
  input: HeldInput;
  queuedPunch: boolean;
  queuedKick: boolean;
  queuedJump: boolean;
  attack?: AttackRuntime;
  jumpTicks: number;
  hurtTicks: number;
  downTicks: number;
  getupTicks: number;
  invulnTicks: number;
};

type EnemyRuntime = {
  attackCooldown: number;
  hitCooldown: number;
  enterTicks: number;
  entrySide?: 'left' | 'right';
  bossPhase?: 'idle' | 'telegraph' | 'execute' | 'recover';
  phaseTicks?: number;
  targetSlot?: PlayerSlot;
  move?: string;
  hurtTicks: number;
  moveHits: Set<PlayerSlot>;
};

const DT = 1 / 30;
const WALK_SPEED = 230;
const LANE_TOP = 470;
const LANE_BOTTOM = 650;
const VIEW_WIDTH = 1280;
const ENEMY_SPEED = 105;
const COOP_MAX_GAP = 920;
const CAMERA_LEFT_PAD = 150;
const CAMERA_RIGHT_PAD = 260;
const ENTRY_MARGIN = 140;
const EMPTY: HeldInput = { moveX: 0, moveY: 0, punch: false, kick: false, jump: false };

const ATTACKS = {
  punch: { duration: 11, impactStart: 4, impactEnd: 5, range: 76, damage: 9, knockback: 10 },
  kick: { duration: 16, impactStart: 6, impactEnd: 8, range: 94, damage: 13, knockback: 18 },
} as const;

export class AuthoritativeSimulation {
  readonly state: SimulationState;
  private defaultContinues: number;
  private players = new Map<PlayerSlot, PlayerRuntime>();
  private enemyRuntime = new Map<number, EnemyRuntime>();
  private triggered = new Set<string>();
  private nextEnemyId = 1;
  private nextAttackId = 1;
  private bossSpawned = false;
  private stageClearTicks = 0;
  private activeEncounter?: EncounterDefinition;
  private reinforcementWave = 0;
  private reinforcementDelay = 0;

  constructor(private readonly room: string, continues = DEFAULT_CONTINUES_PER_PLAYER) {
    this.state = { tick: 0, stage: 1, phase: 'lobby', cameraX: 0, players: [], enemies: [] };
    this.defaultContinues = continues;
  }

  setDefaultContinues(value: number) {
    if (this.state.phase !== 'lobby') return;
    this.defaultContinues = value;
    for (const p of this.state.players) p.continues = value;
  }

  addPlayer(slot: PlayerSlot, nickname: string): SimPlayer {
    const old = this.state.players.find(p => p.slot === slot);
    if (old) {
      old.connected = true;
      old.nickname = nickname;
      if (!this.players.has(slot)) this.players.set(slot, this.newPlayerRuntime());
      return old;
    }
    const p: SimPlayer = {
      slot,
      nickname,
      character: null,
      x: 220 + slot * 90,
      y: 560 + slot * 35,
      z: 0,
      health: 100,
      maxHealth: 100,
      continues: this.defaultContinues,
      state: 'idle',
      action: 'idle',
      facing: 1,
      actionStartedTick: this.state.tick,
      ready: false,
      connected: true,
      lastProcessedInputSeq: -1,
    };
    this.state.players.push(p);
    this.players.set(slot, this.newPlayerRuntime());
    return p;
  }

  removePlayer(slot: PlayerSlot) {
    const p = this.state.players.find(player => player.slot === slot);
    if (p) p.connected = false;
    const rt = this.players.get(slot);
    if (rt) rt.input = { ...EMPTY };
  }

  dropPlayer(slot: PlayerSlot) {
    this.state.players = this.state.players.filter(p => p.slot !== slot);
    this.players.delete(slot);
  }

  reserveCharacter(slot: PlayerSlot, character: CharacterId) {
    if (this.state.phase !== 'lobby' || !(character in CHARACTERS)) return false;
    if (this.state.players.some(p => p.slot !== slot && p.character === character)) return false;
    const p = this.state.players.find(player => player.slot === slot);
    if (!p) return false;
    p.character = character;
    return true;
  }

  setReady(slot: PlayerSlot, ready: boolean) {
    if (this.state.phase !== 'lobby') return;
    const p = this.state.players.find(player => player.slot === slot);
    if (p) p.ready = ready;
  }

  canStart() {
    if (this.state.phase !== 'lobby') return false;
    const connected = this.state.players.filter(p => p.connected);
    return connected.length > 0 && connected.every(p => p.ready && p.character !== null);
  }

  start() {
    if (!this.canStart()) return false;
    this.resetStageRuntime();
    this.state.phase = 'playing';
    return true;
  }

  applyInput(slot: PlayerSlot, input: PlayerInput) {
    if (this.state.phase !== 'playing') return;
    if (!Number.isInteger(input.seq) || !Number.isFinite(input.clientTime)) return;
    if (![-1, 0, 1].includes(input.moveX) || ![-1, 0, 1].includes(input.moveY)) return;
    if (typeof input.punch !== 'boolean' || typeof input.kick !== 'boolean' || typeof input.jump !== 'boolean') return;

    const p = this.state.players.find(player => player.slot === slot && player.connected);
    const rt = this.players.get(slot);
    if (!p || !rt || input.seq <= p.lastProcessedInputSeq) return;

    if (input.punch && !rt.input.punch) rt.queuedPunch = true;
    if (input.kick && !rt.input.kick) rt.queuedKick = true;
    if (input.jump && !rt.input.jump) rt.queuedJump = true;
    rt.input = {
      moveX: input.moveX,
      moveY: input.moveY,
      punch: input.punch,
      kick: input.kick,
      jump: input.jump,
    };
    p.lastProcessedInputSeq = input.seq;
  }

  tick() {
    if (this.state.phase !== 'playing') return;
    this.state.tick++;
    for (const p of this.state.players) this.tickPlayer(p);
    this.constrainCoopParty();
    this.spawnEncounters();
    this.tickEnemies();
    this.resolvePlayerAttacks();
    this.removeDefeated();
    this.updateCamera();
    this.checkProgression();
  }

  private newPlayerRuntime(): PlayerRuntime {
    return {
      input: { ...EMPTY },
      queuedPunch: false,
      queuedKick: false,
      queuedJump: false,
      jumpTicks: 0,
      hurtTicks: 0,
      downTicks: 0,
      getupTicks: 0,
      invulnTicks: 0,
    };
  }

  private setPlayerState(p: SimPlayer, state: SimPlayerState, action = state) {
    if (p.state === state && p.action === action) return;
    p.state = state;
    p.action = action;
    p.actionStartedTick = this.state.tick;
  }

  private setEnemyState(e: SimEnemy, state: string, action = state) {
    if (e.state === state && e.action === action) return;
    e.state = state;
    e.action = action;
    e.actionStartedTick = this.state.tick;
  }

  private tickPlayer(p: SimPlayer) {
    if (!p.connected || p.state === 'ko') return;
    const rt = this.players.get(p.slot) ?? this.newPlayerRuntime();
    this.players.set(p.slot, rt);
    if (rt.invulnTicks > 0) rt.invulnTicks--;

    if (rt.downTicks > 0) {
      rt.downTicks--;
      p.z = 0;
      this.setPlayerState(p, 'down', 'down');
      if (rt.downTicks === 0) {
        p.health = p.maxHealth;
        rt.getupTicks = 18;
        rt.invulnTicks = 60;
        this.setPlayerState(p, 'getup', 'getup');
      }
      return;
    }

    if (rt.getupTicks > 0) {
      rt.getupTicks--;
      p.z = 0;
      this.setPlayerState(p, 'getup', 'getup');
      if (rt.getupTicks === 0) this.setPlayerState(p, 'idle', 'idle');
      return;
    }

    if (rt.hurtTicks > 0) {
      rt.hurtTicks--;
      this.setPlayerState(p, 'hurt', 'hurt');
      if (rt.hurtTicks === 0) this.setPlayerState(p, 'idle', 'idle');
      return;
    }

    if (rt.queuedJump && rt.jumpTicks === 0 && !rt.attack) {
      rt.queuedJump = false;
      rt.jumpTicks = 24;
      this.setPlayerState(p, 'jump', 'jump');
    }

    if (rt.jumpTicks > 0) {
      const elapsed = 24 - rt.jumpTicks;
      p.z = Math.sin((elapsed / 24) * Math.PI);
      rt.jumpTicks--;
    } else {
      p.z = 0;
    }

    if (!rt.attack && (rt.queuedPunch || rt.queuedKick)) {
      const kind: 'punch' | 'kick' = rt.queuedKick ? 'kick' : 'punch';
      rt.queuedPunch = false;
      rt.queuedKick = false;
      rt.attack = { id: this.nextAttackId++, kind, tick: 0, hitEnemyIds: new Set<number>() };
      this.setPlayerState(p, 'attack', kind);
    }

    const stats = p.character ? CHARACTERS[p.character] : CHARACTERS.alex;
    const speed = WALK_SPEED * (0.82 + stats.speed * 0.06) * (rt.attack ? 0.28 : 1);
    const diagonal = rt.input.moveX && rt.input.moveY ? Math.SQRT1_2 : 1;
    if (rt.input.moveX !== 0) p.facing = rt.input.moveX > 0 ? 1 : -1;
    p.x += rt.input.moveX * speed * DT * diagonal;
    p.y += rt.input.moveY * speed * DT * diagonal;
    const stage = STAGES[this.state.stage - 1];
    p.x = Math.max(0, Math.min(stage.worldWidth - 40, p.x));
    p.y = Math.max(LANE_TOP, Math.min(LANE_BOTTOM, p.y));

    if (rt.attack) {
      rt.attack.tick++;
      this.setPlayerState(p, 'attack', rt.attack.kind);
      const spec = ATTACKS[rt.attack.kind];
      if (rt.attack.tick >= spec.duration) {
        rt.attack = undefined;
        if (p.z > 0) this.setPlayerState(p, 'jump', 'jump');
        else if (rt.input.moveX || rt.input.moveY) this.setPlayerState(p, 'walk', 'walk');
        else this.setPlayerState(p, 'idle', 'idle');
      }
      return;
    }

    if (p.z > 0) this.setPlayerState(p, 'jump', 'jump');
    else if (rt.input.moveX || rt.input.moveY) this.setPlayerState(p, 'walk', 'walk');
    else this.setPlayerState(p, 'idle', 'idle');
  }

  private constrainCoopParty() {
    const players = this.state.players.filter(p => p.connected && p.state !== 'ko');
    if (players.length < 2) return;
    const lead = Math.max(...players.map(p => p.x));
    const trail = Math.min(...players.map(p => p.x));
    if (lead - trail <= COOP_MAX_GAP) return;
    for (const p of players) if (p.x === lead) p.x = trail + COOP_MAX_GAP;
  }

  private spawnEncounters() {
    const stage = STAGES[this.state.stage - 1];
    const players = this.state.players.filter(p => p.connected && p.state !== 'ko');
    if (!players.length) return;
    const lead = Math.max(...players.map(p => p.x));

    if (this.activeEncounter) {
      if (this.state.enemies.length) return;
      if (this.reinforcementDelay > 0) {
        this.reinforcementDelay--;
        return;
      }
      const waves = this.activeEncounter.reinforcementWaves ?? 0;
      if (this.reinforcementWave < waves) {
        this.reinforcementWave++;
        this.spawnWave(this.activeEncounter, true);
        return;
      }
      this.activeEncounter = undefined;
      this.reinforcementWave = 0;
      this.reinforcementDelay = 18;
    }

    if (this.reinforcementDelay > 0) {
      this.reinforcementDelay--;
      return;
    }

    for (const encounter of stage.encounters) {
      if (this.triggered.has(encounter.id) || lead < encounter.distance) continue;
      this.triggered.add(encounter.id);
      this.activeEncounter = encounter;
      this.reinforcementWave = 0;
      this.spawnWave(encounter, false);
      return;
    }

    if (
      stage.encounters.every(e => this.triggered.has(e.id)) &&
      !this.activeEncounter &&
      !this.bossSpawned &&
      !this.state.enemies.length &&
      lead > stage.worldWidth - 1350
    ) {
      this.bossSpawned = true;
      this.spawnEnemy(`boss:${stage.boss}`, this.rightSpawn(ENTRY_MARGIN + 40), 555, 'right', true);
    }
  }

  private spawnWave(encounter: EncounterDefinition, reinforcement: boolean) {
    let offset = 0;
    for (const group of encounter.composition) {
      for (let n = 0; n < group.count; n++) {
        const canLeft = this.state.cameraX > ENTRY_MARGIN + 80;
        const side: 'left' | 'right' = canLeft && (this.nextEnemyId + n + (reinforcement ? 1 : 0)) % 3 === 0 ? 'left' : 'right';
        const x = side === 'left'
          ? this.state.cameraX - ENTRY_MARGIN - offset
          : this.rightSpawn(ENTRY_MARGIN + offset);
        this.spawnEnemy(group.enemy, x, 500 + (this.nextEnemyId * 37) % 135, side);
        offset += 72;
      }
    }
  }

  private rightSpawn(extra: number) {
    return this.state.cameraX + VIEW_WIDTH + extra;
  }

  private spawnEnemy(kind: string, x: number, y: number, side: 'left' | 'right' = 'right', boss = false) {
    const id = this.nextEnemyId++;
    const hp = boss ? 220 : kind === 'heavy' ? 100 : kind === 'ripper' ? 70 : 55;
    const facing: Facing = side === 'right' ? -1 : 1;
    this.state.enemies.push({
      id,
      kind,
      x,
      y,
      z: 0,
      health: hp,
      maxHealth: hp,
      state: `entering-${side}`,
      action: 'entering',
      facing,
      actionStartedTick: this.state.tick,
    });
    this.enemyRuntime.set(id, {
      attackCooldown: boss ? 55 : 30,
      hitCooldown: 0,
      enterTicks: boss ? 32 : 24,
      entrySide: side,
      bossPhase: boss ? 'idle' : undefined,
      phaseTicks: 0,
      hurtTicks: 0,
      moveHits: new Set<PlayerSlot>(),
    });
  }

  private tickEnemies() {
    for (const enemy of this.state.enemies) {
      const rt = this.enemyRuntime.get(enemy.id);
      if (!rt) continue;
      rt.attackCooldown = Math.max(0, rt.attackCooldown - 1);
      rt.hitCooldown = Math.max(0, rt.hitCooldown - 1);

      if (enemy.state.startsWith('entering')) {
        const side = rt.entrySide ?? (enemy.state.endsWith('left') ? 'left' : 'right');
        const visible = side === 'left'
          ? enemy.x >= this.state.cameraX - 20
          : enemy.x <= this.state.cameraX + VIEW_WIDTH + 20;
        if (!visible) {
          enemy.x += (side === 'left' ? 1 : -1) * ENEMY_SPEED * 1.65 * DT;
          rt.enterTicks = Math.max(0, rt.enterTicks - 1);
          continue;
        }
        rt.enterTicks = 0;
        this.setEnemyState(enemy, 'walk', 'walk');
      }

      const players = this.state.players.filter(p => p.connected && p.state !== 'ko' && p.state !== 'down');
      if (!players.length) continue;
      if (enemy.kind.startsWith('boss:') && this.tickBoss(enemy, rt, players)) continue;

      let target = players[0];
      for (const p of players) if (this.dist(enemy, p) < this.dist(enemy, target)) target = p;
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = this.dist(enemy, target);
      if (Math.abs(dx) > 2) enemy.facing = dx > 0 ? 1 : -1;

      if (distance > 76) {
        const len = Math.hypot(dx, dy) || 1;
        enemy.x += (dx / len) * ENEMY_SPEED * DT;
        enemy.y += (dy / len) * ENEMY_SPEED * 0.72 * DT;
        enemy.y = Math.max(LANE_TOP, Math.min(LANE_BOTTOM, enemy.y));
        this.setEnemyState(enemy, 'walk', 'walk');
      } else if (rt.attackCooldown === 0) {
        rt.attackCooldown = 38;
        this.setEnemyState(enemy, 'attack', 'attack');
        this.damagePlayer(target.slot, enemy.kind === 'heavy' ? 11 : 7);
      } else if (enemy.state !== 'hurt') {
        this.setEnemyState(enemy, 'idle', 'idle');
      }
    }
  }

  private tickBoss(enemy: SimEnemy, rt: EnemyRuntime, players: SimPlayer[]) {
    if (rt.hurtTicks > 0 && rt.bossPhase === 'idle') {
      rt.hurtTicks--;
      this.setEnemyState(enemy, 'hurt', 'hurt');
      return true;
    }

    let target = players.find(p => p.slot === rt.targetSlot) ?? players[0];
    for (const p of players) if (this.dist(enemy, p) < this.dist(enemy, target)) target = p;
    const name = enemy.kind.slice(5).toLowerCase();
    const dxToTarget = target.x - enemy.x;
    if (Math.abs(dxToTarget) > 2) enemy.facing = dxToTarget > 0 ? 1 : -1;

    if (rt.bossPhase === 'telegraph') {
      this.setEnemyState(enemy, `telegraph-${rt.move}`, 'telegraph');
      if (--rt.phaseTicks! <= 0) {
        rt.bossPhase = 'execute';
        rt.phaseTicks = name === 'roxy' ? 10 : name === 'switch' ? 12 : name === 'rivet' ? 16 : 18;
        rt.moveHits.clear();
      }
      return true;
    }

    if (rt.bossPhase === 'execute') {
      this.setEnemyState(enemy, `special-${rt.move}`, 'special');
      this.executeBossMove(name, enemy, rt, target, players);
      if (--rt.phaseTicks! <= 0) {
        rt.bossPhase = 'recover';
        rt.phaseTicks = name === 'roxy' ? 18 : name === 'switch' ? 20 : name === 'rivet' ? 34 : 28;
      }
      return true;
    }

    if (rt.bossPhase === 'recover') {
      this.setEnemyState(enemy, 'recover', 'recover');
      if (--rt.phaseTicks! <= 0) {
        rt.bossPhase = 'idle';
        rt.attackCooldown = name === 'roxy' ? 28 : name === 'switch' ? 34 : name === 'rivet' ? 52 : 44;
      }
      return true;
    }

    if (rt.attackCooldown === 0 && this.dist(enemy, target) < (name === 'crane' ? 230 : 150)) {
      rt.bossPhase = 'telegraph';
      rt.targetSlot = target.slot;
      rt.move = name === 'roxy' ? 'combo' : name === 'switch' ? 'dash' : name === 'rivet' ? 'slam' : name === 'crane' ? 'sweep' : 'strike';
      rt.phaseTicks = name === 'roxy' ? 10 : name === 'switch' ? 18 : name === 'rivet' ? 30 : name === 'crane' ? 26 : 16;
      rt.moveHits.clear();
      this.setEnemyState(enemy, `telegraph-${rt.move}`, 'telegraph');
      return true;
    }

    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const len = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / len) * ENEMY_SPEED * (name === 'roxy' ? 1.2 : name === 'rivet' ? 0.72 : 1) * DT;
    enemy.y += (dy / len) * ENEMY_SPEED * 0.65 * DT;
    enemy.y = Math.max(LANE_TOP, Math.min(LANE_BOTTOM, enemy.y));
    this.setEnemyState(enemy, 'walk', 'walk');
    return true;
  }

  private executeBossMove(name: string, enemy: SimEnemy, rt: EnemyRuntime, target: SimPlayer, players: SimPlayer[]) {
    const first = rt.phaseTicks === (name === 'roxy' ? 10 : name === 'switch' ? 12 : name === 'rivet' ? 16 : 18);

    if (name === 'switch') {
      const previousX = enemy.x;
      enemy.x += (Math.sign(target.x - enemy.x) || enemy.facing) * 18;
      const minX = Math.min(previousX, enemy.x) - 55;
      const maxX = Math.max(previousX, enemy.x) + 55;
      for (const p of players) {
        if (rt.moveHits.has(p.slot)) continue;
        if (p.x >= minX && p.x <= maxX && Math.abs(p.y - enemy.y) < 72) {
          rt.moveHits.add(p.slot);
          this.damagePlayer(p.slot, 13);
        }
      }
      return;
    }

    if (name === 'roxy') {
      if ((rt.phaseTicks ?? 0) % 4 === 0 && this.dist(enemy, target) < 95) this.damagePlayer(target.slot, 5);
      return;
    }

    if (name === 'rivet' && first) {
      for (const p of players) {
        if (Math.hypot(p.x - enemy.x, (p.y - enemy.y) * 1.4) < 155) this.damagePlayer(p.slot, 20);
      }
      return;
    }

    if (name === 'crane' && first) {
      for (const p of players) {
        const dx = Math.abs(p.x - enemy.x);
        const dy = Math.abs(p.y - enemy.y);
        if (dx < 230 && dy < 78 && dx > 58) this.damagePlayer(p.slot, 17);
      }
      return;
    }

    if (first && this.dist(enemy, target) < 105) this.damagePlayer(target.slot, 15);
  }

  private dist(enemy: SimEnemy, player: SimPlayer) {
    return Math.hypot(player.x - enemy.x, (player.y - enemy.y) * 1.5);
  }

  private resolvePlayerAttacks() {
    for (const p of this.state.players) {
      if (!p.connected) continue;
      const rt = this.players.get(p.slot);
      if (!rt?.attack) continue;
      const attack = rt.attack;
      const spec = ATTACKS[attack.kind];
      if (attack.tick < spec.impactStart || attack.tick > spec.impactEnd) continue;

      const stats = p.character ? CHARACTERS[p.character] : CHARACTERS.alex;
      const range = spec.range + stats.reach * 7;
      let target: SimEnemy | undefined;
      let best = Infinity;
      for (const enemy of this.state.enemies) {
        const ert = this.enemyRuntime.get(enemy.id);
        if (!ert || ert.hitCooldown > 0 || enemy.state.startsWith('entering') || attack.hitEnemyIds.has(enemy.id)) continue;
        const dx = enemy.x - p.x;
        if (dx * p.facing < -8 || Math.abs(dx) > range) continue;
        const laneDistance = Math.abs(enemy.y - p.y) * 1.6;
        if (laneDistance > 72) continue;
        const distance = Math.hypot(dx, laneDistance);
        if (distance < best) {
          best = distance;
          target = enemy;
        }
      }

      if (!target) continue;
      attack.hitEnemyIds.add(target.id);
      const damage = spec.damage + stats.power * 2;
      target.health = Math.max(0, target.health - damage);
      const ert = this.enemyRuntime.get(target.id)!;
      ert.hitCooldown = 8;
      target.x += p.facing * spec.knockback;
      if (target.kind.startsWith('boss:')) {
        if (ert.bossPhase === 'idle') {
          ert.hurtTicks = 5;
          this.setEnemyState(target, 'hurt', 'hurt');
        }
      } else {
        this.setEnemyState(target, target.health > 0 ? 'hurt' : 'down', target.health > 0 ? 'hurt' : 'down');
      }
    }
  }

  private removeDefeated() {
    for (const enemy of this.state.enemies) if (enemy.health <= 0) this.enemyRuntime.delete(enemy.id);
    this.state.enemies = this.state.enemies.filter(enemy => enemy.health > 0);
  }

  private updateCamera() {
    const players = this.state.players.filter(p => p.connected && p.state !== 'ko');
    const stage = STAGES[this.state.stage - 1];
    if (!players.length) return;
    const lead = Math.max(...players.map(p => p.x));
    const trail = Math.min(...players.map(p => p.x));
    let desired = players.length > 1 ? (lead + trail) / 2 - VIEW_WIDTH / 2 : lead - VIEW_WIDTH * 0.42;
    desired = Math.max(0, Math.min(stage.worldWidth - VIEW_WIDTH, desired));
    this.state.cameraX += Math.max(-18, Math.min(18, desired - this.state.cameraX));
    this.state.cameraX = Math.max(0, Math.min(stage.worldWidth - VIEW_WIDTH, this.state.cameraX));
    const left = this.state.cameraX + CAMERA_LEFT_PAD;
    const right = this.state.cameraX + VIEW_WIDTH - CAMERA_RIGHT_PAD;
    for (const p of players) p.x = Math.max(left, Math.min(right, p.x));
  }

  private checkProgression() {
    if (this.bossSpawned && !this.state.enemies.length) {
      this.stageClearTicks++;
      if (this.stageClearTicks > 45) {
        if (this.state.stage === 6) this.state.phase = 'victory';
        else {
          this.advanceStage();
          this.state.phase = 'playing';
        }
      }
    } else {
      this.stageClearTicks = 0;
    }

    const connected = this.state.players.filter(p => p.connected);
    if (connected.length && connected.every(p => p.state === 'ko')) this.state.phase = 'game-over';
  }

  damagePlayer(slot: PlayerSlot, damage: number) {
    const p = this.state.players.find(player => player.slot === slot);
    const rt = this.players.get(slot);
    if (!p || !rt || p.state === 'ko' || p.state === 'down' || p.state === 'getup' || rt.invulnTicks > 0 || p.z > 0.68) return;

    p.health = Math.max(0, p.health - Math.max(0, damage));
    if (p.health > 0) {
      rt.hurtTicks = 9;
      this.setPlayerState(p, 'hurt', 'hurt');
      return;
    }

    if (p.continues > 0) {
      p.continues--;
      p.health = 0;
      p.z = 0;
      rt.attack = undefined;
      rt.hurtTicks = 0;
      rt.downTicks = 30;
      this.setPlayerState(p, 'down', 'down');
      p.x = Math.max(this.state.cameraX + 160, p.x - 120);
      return;
    }

    this.setPlayerState(p, 'ko', 'ko');
  }

  advanceStage() {
    if (this.state.stage === 6) {
      this.state.phase = 'victory';
      return;
    }
    this.state.stage = (this.state.stage + 1) as StageId;
    this.state.cameraX = 0;
    for (const p of this.state.players) {
      p.x = 220 + p.slot * 90;
      p.y = 560 + p.slot * 35;
      p.z = 0;
      if (p.state !== 'ko') {
        p.health = Math.min(p.maxHealth, p.health + 25);
        this.setPlayerState(p, 'idle', 'idle');
      }
      this.players.set(p.slot, this.newPlayerRuntime());
    }
    this.resetStageRuntime();
  }

  private resetStageRuntime() {
    this.state.enemies = [];
    this.triggered.clear();
    this.enemyRuntime.clear();
    this.bossSpawned = false;
    this.stageClearTicks = 0;
    this.activeEncounter = undefined;
    this.reinforcementWave = 0;
    this.reinforcementDelay = 0;
    for (const p of this.state.players) {
      const rt = this.players.get(p.slot) ?? this.newPlayerRuntime();
      rt.input = { ...EMPTY };
      rt.queuedPunch = false;
      rt.queuedKick = false;
      rt.queuedJump = false;
      rt.attack = undefined;
      rt.jumpTicks = 0;
      rt.hurtTicks = 0;
      rt.downTicks = 0;
      rt.getupTicks = 0;
      this.players.set(p.slot, rt);
    }
  }

  snapshot(serverTime = Date.now()): WorldSnapshot {
    return {
      type: 'snapshot',
      protocol: PROTOCOL_VERSION,
      tick: this.state.tick,
      serverTime,
      room: this.room,
      stage: this.state.stage,
      phase: this.state.phase,
      cameraX: this.state.cameraX,
      players: this.state.players.map(p => ({ ...p })),
      enemies: this.state.enemies.map(e => ({ ...e })),
    };
  }
}
