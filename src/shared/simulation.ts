import { DEFAULT_CONTINUES_PER_PLAYER, STAGES, type CharacterId, type StageId } from './campaign';
import type { PlayerInput, PlayerSlot, WorldSnapshot } from './protocol';

export type SimPlayerState = 'idle' | 'walk' | 'attack' | 'jump' | 'hurt' | 'down' | 'ko';

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
}

export interface SimulationState {
  tick: number;
  stage: StageId;
  phase: 'lobby' | 'playing' | 'paused' | 'stage-clear' | 'victory' | 'game-over';
  cameraX: number;
  players: SimPlayer[];
  enemies: SimEnemy[];
}

const DT = 1 / 30;
const WALK_SPEED = 230;
const LANE_TOP = 470;
const LANE_BOTTOM = 650;
const VIEW_WIDTH = 1280;

export class AuthoritativeSimulation {
  readonly state: SimulationState;

  constructor(private readonly room: string, continues = DEFAULT_CONTINUES_PER_PLAYER) {
    this.state = { tick: 0, stage: 1, phase: 'lobby', cameraX: 0, players: [], enemies: [] };
    this.defaultContinues = continues;
  }

  private defaultContinues: number;

  addPlayer(slot: PlayerSlot, nickname: string): SimPlayer {
    const existing = this.state.players.find((p) => p.slot === slot);
    if (existing) {
      existing.connected = true;
      existing.nickname = nickname;
      return existing;
    }
    const player: SimPlayer = {
      slot, nickname, character: null, x: 220 + slot * 90, y: 560 + slot * 35, z: 0,
      health: 100, maxHealth: 100, continues: this.defaultContinues, state: 'idle',
      ready: false, connected: true, lastProcessedInputSeq: -1,
    };
    this.state.players.push(player);
    return player;
  }

  removePlayer(slot: PlayerSlot): void {
    const player = this.state.players.find((p) => p.slot === slot);
    if (player) player.connected = false;
  }

  reserveCharacter(slot: PlayerSlot, character: CharacterId): boolean {
    if (this.state.players.some((p) => p.slot !== slot && p.character === character)) return false;
    const player = this.state.players.find((p) => p.slot === slot);
    if (!player) return false;
    player.character = character;
    return true;
  }

  setReady(slot: PlayerSlot, ready: boolean): void {
    const player = this.state.players.find((p) => p.slot === slot);
    if (player) player.ready = ready;
  }

  canStart(): boolean {
    const connected = this.state.players.filter((p) => p.connected);
    return connected.length > 0 && connected.every((p) => p.ready && p.character !== null);
  }

  start(): boolean {
    if (!this.canStart()) return false;
    this.state.phase = 'playing';
    return true;
  }

  applyInput(slot: PlayerSlot, input: PlayerInput): void {
    if (this.state.phase !== 'playing') return;
    const player = this.state.players.find((p) => p.slot === slot && p.connected);
    if (!player || input.seq <= player.lastProcessedInputSeq || player.state === 'ko') return;
    player.lastProcessedInputSeq = input.seq;

    const diagonal = input.moveX !== 0 && input.moveY !== 0 ? Math.SQRT1_2 : 1;
    player.x += input.moveX * WALK_SPEED * DT * diagonal;
    player.y += input.moveY * WALK_SPEED * DT * diagonal;
    const stage = STAGES[this.state.stage - 1];
    player.x = Math.max(0, Math.min(stage.worldWidth, player.x));
    player.y = Math.max(LANE_TOP, Math.min(LANE_BOTTOM, player.y));

    if (input.jump && player.z === 0) {
      player.z = 1;
      player.state = 'jump';
    } else if (input.punch || input.kick) {
      player.state = 'attack';
    } else if (input.moveX || input.moveY) {
      player.state = 'walk';
    } else {
      player.state = 'idle';
    }
  }

  tick(): void {
    if (this.state.phase !== 'playing') return;
    this.state.tick++;
    for (const player of this.state.players) {
      if (player.z > 0) {
        player.z = Math.max(0, player.z - 0.12);
        if (player.z === 0 && player.state === 'jump') player.state = 'idle';
      }
    }
    const active = this.state.players.filter((p) => p.connected && p.state !== 'ko');
    const leadX = active.length ? Math.max(...active.map((p) => p.x)) : 0;
    const stage = STAGES[this.state.stage - 1];
    this.state.cameraX = Math.max(0, Math.min(stage.worldWidth - VIEW_WIDTH, leadX - VIEW_WIDTH * 0.42));
  }

  damagePlayer(slot: PlayerSlot, damage: number): void {
    const player = this.state.players.find((p) => p.slot === slot);
    if (!player || player.state === 'ko') return;
    player.health = Math.max(0, player.health - Math.max(0, damage));
    if (player.health > 0) {
      player.state = 'hurt';
      return;
    }
    if (player.continues > 0) {
      player.continues--;
      player.health = player.maxHealth;
      player.state = 'idle';
      player.z = 0;
    } else {
      player.state = 'ko';
      if (this.state.players.filter((p) => p.connected).every((p) => p.state === 'ko')) this.state.phase = 'game-over';
    }
  }

  advanceStage(): void {
    if (this.state.stage === 6) {
      this.state.phase = 'victory';
      return;
    }
    this.state.stage = (this.state.stage + 1) as StageId;
    this.state.cameraX = 0;
    this.state.enemies = [];
    for (const player of this.state.players) {
      player.x = 220 + player.slot * 90;
      player.y = 560 + player.slot * 35;
      player.z = 0;
      if (player.state !== 'ko') player.state = 'idle';
    }
  }

  snapshot(serverTime = Date.now()): WorldSnapshot {
    return {
      type: 'snapshot', protocol: 1, tick: this.state.tick, serverTime, room: this.room,
      stage: this.state.stage, phase: this.state.phase, cameraX: this.state.cameraX,
      players: this.state.players.map((p) => ({ ...p })),
      enemies: this.state.enemies.map((e) => ({ ...e })),
    };
  }
}
