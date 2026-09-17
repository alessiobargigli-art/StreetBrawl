import { DEFAULT_CONTINUES_PER_PLAYER, type CharacterId } from '../shared/campaign';
import { AuthoritativeSimulation } from '../shared/simulation';
import { SIMULATION_HZ, SNAPSHOT_HZ, type PlayerInput, type PlayerSlot, type WorldSnapshot } from '../shared/protocol';

export class LocalCampaignClient extends EventTarget {
  readonly slot: PlayerSlot = 0;
  readonly room = 'LOCAL';
  private readonly simulation = new AuthoritativeSimulation(this.room, DEFAULT_CONTINUES_PER_PLAYER);
  private timer?: number;
  private snapshotCounter = 0;
  private inputSeq = 0;
  private sceneId?: string;
  snapshot?: WorldSnapshot;

  constructor(character: CharacterId) {
    super();
    this.simulation.addPlayer(this.slot, 'PLAYER');
    this.simulation.reserveCharacter(this.slot, character);
    this.simulation.setReady(this.slot, true);
  }

  start() {
    if (this.timer !== undefined) return;
    if (!this.simulation.start()) throw new Error('Impossibile avviare la campagna locale');
    this.publishSnapshot();
    this.timer = window.setInterval(() => {
      this.simulation.tick();
      if (++this.snapshotCounter >= SIMULATION_HZ / SNAPSHOT_HZ) {
        this.snapshotCounter = 0;
        this.publishSnapshot();
      }
    }, 1000 / SIMULATION_HZ);
  }

  stop() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  setPaused(paused: boolean) {
    if (paused && this.simulation.state.phase === 'playing') this.simulation.state.phase = 'paused';
    else if (!paused && this.simulation.state.phase === 'paused' && !this.sceneId) this.simulation.state.phase = 'playing';
    this.publishSnapshot();
  }

  sceneEnter(sceneId: string) {
    this.sceneId = sceneId;
    if (this.simulation.state.phase === 'playing') this.simulation.state.phase = 'paused';
    this.publishSnapshot();
  }

  sceneReady(sceneId: string) {
    if (this.sceneId !== sceneId) return;
    this.sceneId = undefined;
    if (this.simulation.state.phase === 'paused') this.simulation.state.phase = 'playing';
    this.publishSnapshot();
  }

  sendInput(input: Omit<PlayerInput, 'seq' | 'clientTime'>) {
    const seq = ++this.inputSeq;
    this.simulation.applyInput(this.slot, { ...input, seq, clientTime: Date.now() });
    return seq;
  }

  private publishSnapshot() {
    this.snapshot = this.simulation.snapshot();
    this.dispatchEvent(new CustomEvent('message', { detail: this.snapshot }));
  }
}
