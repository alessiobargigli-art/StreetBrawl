import './styles.css';
import { Game } from './game/Game';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root');

root.innerHTML = `
  <main class="shell">
    <header class="hud">
      <strong>STREETBRAWL</strong>
      <span>v0.1 vertical slice</span>
    </header>
    <canvas id="game" width="1280" height="720" aria-label="StreetBrawl game canvas"></canvas>
    <div class="touch-controls" aria-hidden="true">
      <div class="dpad">
        <button data-key="ArrowUp">▲</button>
        <div>
          <button data-key="ArrowLeft">◀</button>
          <button data-key="ArrowDown">▼</button>
          <button data-key="ArrowRight">▶</button>
        </div>
      </div>
      <div class="actions">
        <button data-key="KeyZ">PUNCH</button>
        <button data-key="KeyX">KICK</button>
      </div>
    </div>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing game canvas');

const game = new Game(canvas);
game.start();

document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => {
  const code = button.dataset.key!;
  const press = (down: boolean) => {
    game.setVirtualKey(code, down);
  };
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); press(true); });
  button.addEventListener('pointerup', (e) => { e.preventDefault(); press(false); });
  button.addEventListener('pointercancel', () => press(false));
  button.addEventListener('pointerleave', () => press(false));
});
