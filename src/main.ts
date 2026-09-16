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
    <div class="touch-controls" aria-hidden="true">
      <div id="joystick" class="joystick"><div class="joystick-ring"></div><div id="joystick-knob" class="joystick-knob"></div></div>
      <div class="actions"><button data-key="Space" class="jump">JUMP</button><button data-key="KeyZ">PUNCH</button><button data-key="KeyX">KICK</button></div>
    </div>
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
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);press(true)});
  button.addEventListener('pointerup',e=>{e.preventDefault();press(false);if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId)});
  button.addEventListener('pointercancel',()=>press(false));
});

const joystick=document.querySelector<HTMLElement>('#joystick')!;
const knob=document.querySelector<HTMLElement>('#joystick-knob')!;
let joystickPointer:number|null=null;
let joystickKeys=new Set<string>();
const releaseJoystick=()=>{for(const k of joystickKeys)game.setVirtualKey(k,false);joystickKeys.clear();knob.style.transform='translate(-50%,-50%)';};
const moveJoystick=(clientX:number,clientY:number)=>{
  const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  const dx=clientX-cx,dy=clientY-cy,max=r.width*.32,dist=Math.hypot(dx,dy),scale=dist>max?max/dist:1;
  const x=dx*scale,y=dy*scale;knob.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
  const dead=max*.28,next=new Set<string>();
  if(dist>dead){const angle=Math.atan2(dy,dx),sector=Math.round(angle/(Math.PI/4));const dirs=[['ArrowRight'],['ArrowRight','ArrowDown'],['ArrowDown'],['ArrowLeft','ArrowDown'],['ArrowLeft'],['ArrowLeft','ArrowUp'],['ArrowUp'],['ArrowRight','ArrowUp']];for(const k of dirs[(sector+8)%8])next.add(k)}
  for(const k of joystickKeys)if(!next.has(k))game.setVirtualKey(k,false);for(const k of next)if(!joystickKeys.has(k))game.setVirtualKey(k,true);joystickKeys=next;
};
joystick.addEventListener('pointerdown',e=>{e.preventDefault();joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoystick(e.clientX,e.clientY)});
window.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer){e.preventDefault();moveJoystick(e.clientX,e.clientY)}},{capture:true,passive:false});
const endJoystick=(e:PointerEvent)=>{if(e.pointerId!==joystickPointer)return;e.preventDefault();releaseJoystick();if(joystick.hasPointerCapture(e.pointerId))joystick.releasePointerCapture(e.pointerId);joystickPointer=null;};
window.addEventListener('pointerup',endJoystick,{capture:true});window.addEventListener('pointercancel',endJoystick,{capture:true});

const card=document.querySelector<HTMLElement>('#install-card')!;
const hideInstall=()=>{card.hidden=true;};
window.addEventListener('beforeinstallprompt',(event:Event)=>{event.preventDefault();installPrompt=event as InstallPromptEvent;if(!window.matchMedia('(display-mode: standalone)').matches)card.hidden=false;});
window.addEventListener('appinstalled',()=>{installPrompt=null;hideInstall();});
document.querySelector('#install-close')?.addEventListener('click',hideInstall);
document.querySelector('#install-later')?.addEventListener('click',hideInstall);
document.querySelector('#install-now')?.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;hideInstall();});

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(console.error));
