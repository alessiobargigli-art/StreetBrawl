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
  private manualPaused = false;
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
    this.manualPaused = paused;
    this.applyPause();
  }

  sceneEnter(sceneId: string) {
    this.sceneId = sceneId;
    this.applyPause();
  }

  sceneReady(sceneId: string) {
    if (this.sceneId !== sceneId) return;
    this.sceneId = undefined;
    this.applyPause();
  }

  private applyPause() {
    if (this.simulation.state.phase !== 'playing' && this.simulation.state.phase !== 'paused') return;
    this.simulation.state.phase = this.manualPaused || !!this.sceneId ? 'paused' : 'playing';
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
