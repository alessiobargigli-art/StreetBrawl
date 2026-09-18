import type { CharacterId, StageId } from './campaign';

export const PROTOCOL_VERSION = 2;
export const SIMULATION_HZ = 30;
export const SNAPSHOT_HZ = 15;
export const MAX_PLAYERS = 2;
export const RECONNECT_WINDOW_MS = 30_000;

export type PlayerSlot = 0 | 1;
export type RoomCode = string;
export type Facing = -1 | 1;
export type ActionKind = 'idle' | 'walk' | 'punch' | 'kick' | 'jump' | 'hurt' | 'down' | 'getup' | 'ko' | 'attack' | 'entering' | 'telegraph' | 'special' | 'recover';

export interface PlayerInput {
  seq: number;
  clientTime: number;
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  punch: boolean;
  kick: boolean;
  jump: boolean;
  continueRequestId?: string;
}

export interface PlayerSnapshot {
  slot: PlayerSlot;
  nickname: string;
  character: CharacterId | null;
  x: number;
  y: number;
  z: number;
  health: number;
  maxHealth: number;
  continues: number;
  state: string;
  action: string;
  facing: Facing;
  actionStartedTick: number;
  ready: boolean;
  connected: boolean;
  lastProcessedInputSeq: number;
}

export interface EnemySnapshot {
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

export interface WorldSnapshot {
  type: 'snapshot';
  protocol: typeof PROTOCOL_VERSION;
  tick: number;
  serverTime: number;
  room: RoomCode;
  stage: StageId;
  phase: string;
  cameraX: number;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
}

export interface GameEvent {
  type: 'event';
  id: string;
  tick: number;
  kind: 'hit' | 'ko' | 'go' | 'boss' | 'heal' | 'continue' | 'scene' | 'stage-clear' | 'victory' | 'game-over';
  actor?: string;
  target?: string;
  payload?: Record<string, string | number | boolean>;
}

export type ClientMessage =
  | { type: 'hello'; protocol: typeof PROTOCOL_VERSION; nickname: string; reconnectToken?: string }
  | { type: 'reserve-character'; character: CharacterId }
  | { type: 'ready'; ready: boolean }
  | { type: 'settings'; continuesPerPlayer: number }
  | { type: 'input'; inputs: PlayerInput[] }
  | { type: 'pause'; paused: boolean }
  | { type: 'scene-enter'; sceneId: string }
  | { type: 'scene-ready'; sceneId: string }
  | { type: 'start' };

export type ServerMessage =
  | { type: 'welcome'; protocol: typeof PROTOCOL_VERSION; room: RoomCode; slot: PlayerSlot; reconnectToken: string }
  | { type: 'lobby'; room: RoomCode; hostSlot: PlayerSlot; continuesPerPlayer: number; players: Array<Pick<PlayerSnapshot, 'slot' | 'nickname' | 'character' | 'ready' | 'connected'>> }
  | { type: 'scene'; sceneId: string; active: boolean; readySlots: PlayerSlot[]; revision: number }
  | WorldSnapshot
  | GameEvent
  | { type: 'error'; code: 'ROOM_FULL' | 'ROOM_NOT_FOUND' | 'ROOM_EXPIRED' | 'GAME_FINISHED' | 'CHARACTER_TAKEN' | 'BAD_MESSAGE' | 'NOT_HOST'; message: string };
