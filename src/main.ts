import './styles.css';
import { Game } from './game/Game';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let installPrompt: InstallPromptEvent | null = null;

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root');
root.innerHTML = `
  <main class="shell">
    <header class="hud"><strong>STREETBRAWL</strong><span>combat prototype</span></header>
    <canvas id="game" width="1280" height="720" aria-label="StreetBrawl game canvas"></canvas>
    <div class="touch-controls" aria-hidden="true"><div class="dpad"><button data-key="ArrowUp">▲</button><div><button data-key="ArrowLeft">◀</button><button data-key="ArrowDown">▼</button><button data-key="ArrowRight">▶</button></div></div><div class="actions"><button data-key="KeyZ">PUNCH</button><button data-key="KeyX">KICK</button></div></div>
    <section id="install-card" class="install-card" hidden>
      <button id="install-close" class="install-close" aria-label="Chiudi">×</button>
      <img src="/icons/icon.svg" alt="" />
      <div><strong>Installa StreetBrawl</strong><p>Gioca come un'app: fullscreen e direttamente dalla Home.</p><div class="install-actions"><button id="install-now">INSTALLA APP</button><button id="install-later">Più tardi</button></div></div>
    </section>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing game canvas');
const game = new Game(canvas); game.start();

document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
  const code=button.dataset.key!; const press=(down:boolean)=>game.setVirtualKey(code,down);
  button.addEventListener('pointerdown',e=>{e.preventDefault();press(true)}); button.addEventListener('pointerup',e=>{e.preventDefault();press(false)});
  button.addEventListener('pointercancel',()=>press(false)); button.addEventListener('pointerleave',()=>press(false));
});

const card=document.querySelector<HTMLElement>('#install-card')!;
const hideInstall=()=>{card.hidden=true;};
window.addEventListener('beforeinstallprompt',(event:Event)=>{event.preventDefault();installPrompt=event as InstallPromptEvent;if(!window.matchMedia('(display-mode: standalone)').matches)card.hidden=false;});
window.addEventListener('appinstalled',()=>{installPrompt=null;hideInstall();});
document.querySelector('#install-close')?.addEventListener('click',hideInstall);
document.querySelector('#install-later')?.addEventListener('click',hideInstall);
document.querySelector('#install-now')?.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;hideInstall();});

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(console.error));
