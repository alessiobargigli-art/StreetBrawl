import './styles.css';
import { AudioManager, type SfxId } from './audio/AudioManager';
import { CoopLobby } from './online/CoopLobby';
import { CoopGame, type CoopAudioEvent } from './online/CoopGame';
import { LocalCampaignClient } from './online/LocalCampaignClient';
import { SoloLobby } from './online/SoloLobby';
import { StoryOverlay } from './online/StoryOverlay';
import { INTRO, STAGE_INTROS, STAGE_OUTROS, FINALE, type StoryScene } from './shared/story';
import type { CharacterId } from './shared/campaign';
import { CoopClient } from './online/CoopClient';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type InputTarget = { setVirtualKey: (code: string, down: boolean) => void; resetInput: () => void };
type CampaignClient = CoopClient | LocalCampaignClient;

const VERSION = '1.2.2-reconnect-preload';
let installPrompt: InstallPromptEvent | null = null;
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root');

root.innerHTML = `<main class="shell">
<section id="splash" class="cover"><div class="panel"><h1>STREETBRAWL</h1><p id="load-status">Preparazione…</p><div class="progress"><i id="load-bar"></i></div><strong id="load-value">0 / 5</strong><div id="load-error" class="load-error" hidden></div><div class="cover-actions"><button id="retry" hidden>RIPROVA</button><button id="silent" hidden>CONTINUA SENZA AUDIO</button><button id="enter" hidden>ENTRA</button></div></div></section>
<section id="menu" class="cover" hidden><div class="panel menu-panel"><h1>STREETBRAWL</h1><p>L’ultima partita.</p><small>v${VERSION}</small><button id="play" class="primary">GIOCA SOLO</button><button id="coop" class="primary">CO-OP ONLINE</button><label>MUSICA <input id="music-volume" type="range" min="0" max="100"></label><label>EFFETTI <input id="sfx-volume" type="range" min="0" max="100"></label><label class="mute"><input id="mute" type="checkbox"> MUTE</label></div></section>
<section id="coop-screen" class="cover" hidden></section>
<header class="hud" hidden><strong>STREETBRAWL</strong><span>v${VERSION}</span><button id="fullscreen" type="button">FULLSCREEN</button><button id="game-menu" type="button">MENU</button><button id="game-new" type="button">NUOVA PARTITA</button></header>
<canvas id="game" width="1280" height="720" aria-label="StreetBrawl game canvas" hidden></canvas>
<div class="touch-controls" hidden aria-hidden="true"><div id="joystick-zone" class="joystick-zone"><div id="joystick" class="joystick"><div class="joystick-ring"></div><div id="joystick-knob" class="joystick-knob"></div></div></div><div class="actions"><button data-key="Space" class="jump">JUMP</button><button data-key="KeyZ">PUNCH</button><button data-key="KeyX">KICK</button></div></div>
<section id="install-card" class="install-card" hidden><button id="install-close" class="install-close">×</button><img src="/icons/icon.svg" alt=""><div><strong>Installa StreetBrawl</strong><p>Gioca come un'app direttamente dalla Home.</p><div class="install-actions"><button id="install-now">INSTALLA APP</button><button id="install-later">Più tardi</button></div></div></section>
</main>`;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const canvas = $<HTMLCanvasElement>('#game');
const audio = new AudioManager();
const story = new StoryOverlay(root);
const idleInput: InputTarget = { setVirtualKey: () => {}, resetInput: () => {} };
let coopGame: CoopGame | null = null;
let localClient: LocalCampaignClient | null = null;
let inputTarget: InputTarget = idleInput;
let storySeenIntro = false;
let storyQueue = Promise.resolve();
let onlineStoryListener: ((event: Event) => void) | null = null;
const onlineScenesQueued = new Set<string>();
let narrativeGeneration = 0;
let activeClient: CampaignClient | null = null;

const splash = $<HTMLElement>('#splash');
const menu = $<HTMLElement>('#menu');
const coopScreen = $<HTMLElement>('#coop-screen');
const status = $<HTMLElement>('#load-status');
const bar = $<HTMLElement>('#load-bar');
const value = $<HTMLElement>('#load-value');
const error = $<HTMLElement>('#load-error');
const enter = $<HTMLButtonElement>('#enter');
const retry = $<HTMLButtonElement>('#retry');
const silent = $<HTMLButtonElement>('#silent');

const showPlaySurface = () => {
  menu.hidden = true;
  coopScreen.hidden = true;
  canvas.hidden = false;
  $('.hud').removeAttribute('hidden');
  $('.touch-controls').removeAttribute('hidden');
};

const showMenu = async () => {
  narrativeGeneration++;
  story.cancel();
  onlineScenesQueued.clear();
  storyQueue = Promise.resolve();
  coopGame?.stop();
  coopGame = null;
  if (onlineStoryListener) { coopLobby?.getClient?.().removeEventListener('message', onlineStoryListener); onlineStoryListener = null; }
  localClient?.stop();
  localClient = null;
  inputTarget = idleInput;
  activeClient = null;
  splash.hidden = true;
  canvas.hidden = true;
  $('.hud').setAttribute('hidden', '');
  $('.touch-controls').setAttribute('hidden', '');
  coopScreen.hidden = true;
  menu.hidden = false;
  await audio.playMusic('menu');
};

const queueStory = (work: () => Promise<void>) => {
  storyQueue = storyQueue.then(work, work);
  return storyQueue;
};

const presentStory = async (client: CampaignClient, sceneId: string, card: StoryScene) => {
  const generation = narrativeGeneration;
  if (client instanceof LocalCampaignClient) client.sceneEnter(sceneId);
  if (client instanceof CoopClient && client.activeScene !== sceneId) return;
  if (!(client instanceof CoopClient && client.activeSceneReady)) {
    await story.show(card);
    if (generation !== narrativeGeneration) return;
    if (client instanceof CoopClient && client.activeScene !== sceneId) return;
    try { client.sceneReady(sceneId); } catch { return; }
  }
  if (client instanceof CoopClient) {
    await new Promise<void>(resolve => {
      const reconcile = () => {
        if (generation !== narrativeGeneration || client.activeScene !== sceneId) {
          client.removeEventListener('narrative-state', reconcile);
          client.removeEventListener('reconnect-expired', reconcile);
          client.removeEventListener('session-replaced', reconcile);
          resolve();
        }
      };
      client.addEventListener('narrative-state', reconcile);
      client.addEventListener('reconnect-expired', reconcile);
      client.addEventListener('session-replaced', reconcile);
      reconcile();
    });
  }
};

const showOpening = (client: CampaignClient) => queueStory(async () => {
  if (storySeenIntro) return;
  storySeenIntro = true;
  await presentStory(client, 'opening', INTRO);
});

const handleAudio = (event: CoopAudioEvent) => {
  if (event.stopMusic) audio.stopMusic();
  if (event.music) void audio.playMusic(event.music);
  if (event.sfx) audio.sfx(event.sfx as SfxId);
};

const startCampaignGame = async (client: CampaignClient, startLocal = false) => {
  activeClient = client;
  if (client instanceof LocalCampaignClient) await showOpening(client);
  inputTarget.resetInput();
  coopGame?.stop();
  coopGame = new CoopGame(canvas, client);
  coopScreen.hidden = false;
  coopScreen.innerHTML = '<div class="panel"><h2>CARICAMENTO GRAFICA</h2><p id="art-status">Preparazione asset…</p><div class="progress"><i id="art-bar"></i></div><div class="cover-actions"><button id="art-retry" hidden>RIPROVA</button><button id="art-exit">ESCI</button></div></div>';
  for (;;) {
    try {
      await coopGame.preload((loaded, total) => {
        const artStatus = coopScreen.querySelector<HTMLElement>('#art-status');
        const artBar = coopScreen.querySelector<HTMLElement>('#art-bar');
        if (artStatus) artStatus.textContent = `Asset ${loaded} / ${total}`;
        if (artBar) artBar.style.width = `${Math.round(loaded / total * 100)}%`;
      });
      break;
    } catch (assetError) {
      const artStatus = coopScreen.querySelector<HTMLElement>('#art-status');
      const artRetry = coopScreen.querySelector<HTMLButtonElement>('#art-retry');
      const artExit = coopScreen.querySelector<HTMLButtonElement>('#art-exit');
      if (artStatus) artStatus.textContent = assetError instanceof Error ? assetError.message : 'Caricamento grafica fallito';
      if (!artRetry || !artExit) throw assetError;
      artRetry.hidden = false;
      const retryChosen = await new Promise<boolean>(resolve => {
        artRetry.addEventListener('click', () => resolve(true), { once: true });
        artExit.addEventListener('click', () => resolve(false), { once: true });
      });
      if (!retryChosen) {
        if (client instanceof CoopClient) client.close();
        await showMenu();
        return;
      }
      artRetry.hidden = true;
      coopGame.resetPreload();
    }
  }

  const presentSceneId = (sceneId: string) => {
    if (onlineScenesQueued.has(sceneId)) return;
    onlineScenesQueued.add(sceneId);
    const match = sceneId.match(/^stage-(intro|outro)-(\d)$/);
    const card = sceneId === 'opening' ? INTRO
      : sceneId === 'finale' ? FINALE
      : match?.[1] === 'intro' ? STAGE_INTROS[Number(match[2])]
      : match?.[1] === 'outro' ? STAGE_OUTROS[Number(match[2])]
      : undefined;
    if (card) void queueStory(() => presentStory(client, sceneId, card));
  };

  if (client instanceof CoopClient) {
    onlineStoryListener = event => {
      const message = (event as CustomEvent<import('./shared/protocol').ServerMessage>).detail;
      if (message.type === 'scene' && message.active) presentSceneId(message.sceneId);
      else if (message.type === 'scene' && !message.active) onlineScenesQueued.delete(message.sceneId);
    };
    client.addEventListener('message', onlineStoryListener);
    if (client.activeScene) presentSceneId(client.activeScene);
  } else {
    coopGame.addEventListener('story', event => {
      const detail = (event as CustomEvent<{ kind: string; stage: number; from?: number }>).detail;
      void queueStory(async () => {
        if (detail.kind === 'stage-intro') await presentStory(client, `stage-intro-${detail.stage}`, STAGE_INTROS[detail.stage]);
        else if (detail.kind === 'stage-transition') {
          if (detail.from && STAGE_OUTROS[detail.from]) await presentStory(client, `stage-outro-${detail.from}`, STAGE_OUTROS[detail.from]);
          await presentStory(client, `stage-intro-${detail.stage}`, STAGE_INTROS[detail.stage]);
        } else if (detail.kind === 'finale') await presentStory(client, 'finale', FINALE);
      });
    });
  }

  coopGame.addEventListener('audio', event => handleAudio((event as CustomEvent<CoopAudioEvent>).detail));
  inputTarget = coopGame;
  showPlaySurface();
  coopGame.start();
  if (startLocal && client instanceof LocalCampaignClient) client.start();
};

const startLocalGame = async (character: CharacterId) => {
  localClient?.stop();
  localClient = new LocalCampaignClient(character);
  await startCampaignGame(localClient, true);
};

const startCoopGame = async (client: CoopClient) => {
  localClient?.stop();
  localClient = null;
  await startCampaignGame(client);
};

const workerEndpoint = (window as unknown as { STREETBRAWL_COOP_ENDPOINT?: string }).STREETBRAWL_COOP_ENDPOINT ||
  localStorage.getItem('streetbrawl-coop-endpoint') || 'https://streetbrawl-coop.workers.dev';
const coopLobby = new CoopLobby(coopScreen, { endpoint: workerEndpoint, onBack: () => void showMenu(), onStarted: client => void startCoopGame(client) });
const soloLobby = new SoloLobby(coopScreen, () => void showMenu(), character => void startLocalGame(character));


$('#game-menu').addEventListener('click', () => {
  if (activeClient instanceof CoopClient) activeClient.close();
  void showMenu();
});
$('#game-new').addEventListener('click', () => {
  const wasCoop = activeClient instanceof CoopClient;
  if (activeClient instanceof CoopClient) activeClient.close();
  narrativeGeneration++;
  story.cancel();
  coopGame?.stop();
  localClient?.stop();
  activeClient = null;
  canvas.hidden = true;
  $('.hud').setAttribute('hidden', '');
  $('.touch-controls').setAttribute('hidden', '');
  menu.hidden = true;
  if (wasCoop) coopLobby.showHome();
  else soloLobby.show();
});
coopLobby.getClient().addEventListener('session-replaced', () => {
  narrativeGeneration++;
  story.cancel();
  coopGame?.stop();
  coopGame = null;
  inputTarget = idleInput;
  canvas.hidden = true;
  $('.hud').setAttribute('hidden', '');
  $('.touch-controls').setAttribute('hidden', '');
  coopScreen.hidden = false;
  coopScreen.innerHTML = '<div class="panel coop-panel"><h2>SESSIONE SPOSTATA</h2><p>Sessione aperta su un altro dispositivo.</p><div class="coop-actions"><button id="replaced-menu">TORNA AL MENU</button></div></div>';
  coopScreen.querySelector('#replaced-menu')?.addEventListener('click', () => void showMenu());
});
coopLobby.getClient().addEventListener('reconnect-expired', () => {
  narrativeGeneration++;
  story.cancel();
});

const preload = async () => {
  retry.hidden = silent.hidden = enter.hidden = true;
  error.hidden = true;
  bar.style.width = '0%';
  status.textContent = 'Download colonna sonora…';
  const controller = new AbortController();
  const overall = setTimeout(() => controller.abort(), 90_000);
  try {
    await audio.preload(progress => {
      status.textContent = progress.status;
      value.textContent = progress.totalBytes && progress.totalBytes > 0
        ? `${Math.min(100, Math.round(progress.loadedBytes / progress.totalBytes * 100))}%`
        : `${progress.completed} / ${progress.total}`;
      bar.classList.toggle('indeterminate', progress.indeterminate);
      if (!progress.indeterminate && progress.totalBytes) bar.style.width = `${Math.min(100, progress.loadedBytes / progress.totalBytes * 100)}%`;
      else if (progress.completed) bar.style.width = `${progress.completed / progress.total * 100}%`;
    }, controller.signal);
    bar.classList.remove('indeterminate');
    bar.style.width = '100%';
    value.textContent = '100%';
    status.textContent = 'Pronto';
    enter.hidden = false;
  } catch (preloadError) {
    error.hidden = false;
    error.textContent = preloadError instanceof Error ? preloadError.message : 'Errore caricamento audio';
    status.textContent = 'Audio non disponibile';
    retry.hidden = false;
    silent.hidden = false;
  } finally {
    clearTimeout(overall);
  }
};

retry.addEventListener('click', () => void preload());
silent.addEventListener('click', () => { audio.disable(); void showMenu(); });
enter.addEventListener('click', async () => { await audio.unlock(); await showMenu(); });

const musicVolume = $<HTMLInputElement>('#music-volume');
const sfxVolume = $<HTMLInputElement>('#sfx-volume');
const mute = $<HTMLInputElement>('#mute');
musicVolume.value = String(Math.round(audio.settings.musicVolume * 100));
sfxVolume.value = String(Math.round(audio.settings.sfxVolume * 100));
mute.checked = audio.settings.muted;
musicVolume.oninput = () => audio.setMusicVolume(+musicVolume.value / 100);
sfxVolume.oninput = () => audio.setSfxVolume(+sfxVolume.value / 100);
mute.onchange = () => audio.setMuted(mute.checked);

$('#play').addEventListener('click', () => { audio.sfx('confirm'); menu.hidden = true; soloLobby.show(); });
$('#coop').addEventListener('click', () => {
  audio.sfx('confirm');
  menu.hidden = true;
  coopLobby.showHome(new URLSearchParams(location.search).get('room') || '');
});

const invitedRoom = new URLSearchParams(location.search).get('room');
if (invitedRoom) {
  window.addEventListener('streetbrawl-menu-ready', () => {
    menu.hidden = true;
    coopLobby.showHome(invitedRoom);
  }, { once: true });
}

const heldPointers = new Map<number, string>();
const releaseActionPointer = (id: number) => {
  const code = heldPointers.get(id);
  if (!code) return;
  inputTarget.setVirtualKey(code, false);
  heldPointers.delete(id);
};

document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
  const code = button.dataset.key!;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    heldPointers.set(event.pointerId, code);
    button.setPointerCapture(event.pointerId);
    inputTarget.setVirtualKey(code, true);
  });
  const end = (event: PointerEvent) => {
    event.preventDefault();
    releaseActionPointer(event.pointerId);
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('lostpointercapture', event => releaseActionPointer(event.pointerId));
});

const zone = $<HTMLElement>('#joystick-zone');
const joystick = $<HTMLElement>('#joystick');
const knob = $<HTMLElement>('#joystick-knob');
let joystickPointer: number | null = null;
let joystickKeys = new Set<string>();
let center = { x: 0, y: 0 };

const releaseJoystick = () => {
  for (const key of joystickKeys) inputTarget.setVirtualKey(key, false);
  joystickKeys.clear();
  knob.style.transform = 'translate(-50%,-50%)';
  joystick.classList.remove('active');
  joystickPointer = null;
};

const setCenter = (x: number, y: number) => {
  const rect = zone.getBoundingClientRect();
  const joystickRect = joystick.getBoundingClientRect();
  const half = joystickRect.width / 2;
  const nx = Math.max(half, Math.min(rect.width - half, x - rect.left));
  const ny = Math.max(half, Math.min(rect.height - half, y - rect.top));
  joystick.style.left = `${nx}px`;
  joystick.style.top = `${ny}px`;
  center = { x: rect.left + nx, y: rect.top + ny };
};

const moveJoystick = (x: number, y: number) => {
  const rect = joystick.getBoundingClientRect();
  const max = rect.width * 0.32;
  const dx = x - center.x;
  const dy = y - center.y;
  const distance = Math.hypot(dx, dy);
  const scale = distance > max ? max / distance : 1;
  knob.style.transform = `translate(calc(-50% + ${dx * scale}px),calc(-50% + ${dy * scale}px))`;
  const next = new Set<string>();
  if (distance > max * 0.28) {
    const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    const dirs = [['ArrowRight'], ['ArrowRight', 'ArrowDown'], ['ArrowDown'], ['ArrowLeft', 'ArrowDown'], ['ArrowLeft'], ['ArrowLeft', 'ArrowUp'], ['ArrowUp'], ['ArrowRight', 'ArrowUp']];
    for (const key of dirs[(sector + 8) % 8]) next.add(key);
  }
  for (const key of joystickKeys) if (!next.has(key)) inputTarget.setVirtualKey(key, false);
  for (const key of next) if (!joystickKeys.has(key)) inputTarget.setVirtualKey(key, true);
  joystickKeys = next;
};

zone.addEventListener('pointerdown', event => {
  if (joystickPointer !== null) return;
  event.preventDefault();
  joystickPointer = event.pointerId;
  setCenter(event.clientX, event.clientY);
  joystick.classList.add('active');
  zone.setPointerCapture(event.pointerId);
  moveJoystick(event.clientX, event.clientY);
});
window.addEventListener('pointermove', event => {
  if (event.pointerId === joystickPointer) {
    event.preventDefault();
    moveJoystick(event.clientX, event.clientY);
  }
}, { capture: true, passive: false });
const endJoystick = (event: PointerEvent) => {
  if (event.pointerId !== joystickPointer) return;
  event.preventDefault();
  if (zone.hasPointerCapture(event.pointerId)) zone.releasePointerCapture(event.pointerId);
  releaseJoystick();
};
window.addEventListener('pointerup', endJoystick, { capture: true });
window.addEventListener('pointercancel', endJoystick, { capture: true });
zone.addEventListener('lostpointercapture', releaseJoystick);

const resetInput = () => {
  releaseJoystick();
  for (const id of [...heldPointers.keys()]) releaseActionPointer(id);
  inputTarget.resetInput();
};
window.addEventListener('blur', resetInput);
document.addEventListener('visibilitychange', () => {
  if (localClient) localClient.setPaused(document.hidden);
  else if (coopGame) {
    try { coopLobby.getClient().setPaused(document.hidden); } catch {}
  }
  if (document.hidden) {
    resetInput();
    audio.pauseForPage();
  } else {
    void audio.resumeForPage();
  }
});
window.addEventListener('resize', resetInput);
window.addEventListener('orientationchange', resetInput);

$('#fullscreen').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  } catch {}
});

const installCard = $<HTMLElement>('#install-card');
const hideInstall = () => installCard.hidden = true;
window.addEventListener('beforeinstallprompt', (event: Event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
  if (!matchMedia('(display-mode: standalone)').matches) installCard.hidden = false;
});
window.addEventListener('appinstalled', () => { installPrompt = null; hideInstall(); });
$('#install-close').addEventListener('click', hideInstall);
$('#install-later').addEventListener('click', hideInstall);
$('#install-now').addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  hideInstall();
});

window.addEventListener('pagehide', () => {
  coopGame?.stop();
  localClient?.stop();
  story.dispose();
  audio.dispose();
});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
void preload().then(() => window.dispatchEvent(new Event('streetbrawl-menu-ready')));
