import { CHARACTERS, type CharacterId } from '../shared/campaign';

export class SoloLobby {
  constructor(private readonly host: HTMLElement, private readonly onBack: () => void, private readonly onStart: (character: CharacterId) => void) {}

  show() {
    const cards = Object.values(CHARACTERS).map(c => `
      <button class="character-card" data-solo-character="${c.id}">
        <strong>${c.name}</strong>
        <span>${c.description}</span>
        <small>VEL ${c.speed} · POT ${c.power} · RES ${c.endurance}</small>
      </button>`).join('');
    this.host.hidden = false;
    this.host.innerHTML = `
      <div class="panel coop-panel lobby-panel">
        <h2>GIOCA SOLO</h2>
        <p>Scegli il protagonista per la campagna completa a 6 livelli.</p>
        <div class="characters">${cards}</div>
        <div class="coop-actions"><button id="solo-back">INDIETRO</button></div>
      </div>`;
    this.host.querySelectorAll<HTMLButtonElement>('[data-solo-character]').forEach(button => {
      button.addEventListener('click', () => this.onStart(button.dataset.soloCharacter as CharacterId));
    });
    this.host.querySelector('#solo-back')?.addEventListener('click', this.onBack);
  }
}
