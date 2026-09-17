export type MusicId='menu'|'stage1'|'boss1'|'stage2'|'boss2';
export type SfxId='confirm'|'back'|'go'|'bossWarning'|'enrage'|'stageClear'|'victory'|'gameOver'|'swing'|'punch'|'kick'|'finisher'|'airHit'|'playerHit'|'enemyKo'|'jump'|'land'|'grab'|'throw'|'bodyHit'|'crate'|'barrel'|'heal';
export type LoadProgress={completed:number;total:number;loadedBytes:number;totalBytes:number|null;status:string;indeterminate:boolean};

const TRACKS:Record<MusicId,string>={menu:'/assets/audio/music/menu.mp3',stage1:'/assets/audio/music/stage-1.mp3',boss1:'/assets/audio/music/boss-1.mp3',stage2:'/assets/audio/music/stage-2.mp3',boss2:'/assets/audio/music/boss-2.mp3'};
const STORE='streetbrawl-audio-v1';

export class AudioManager{
 private ctx?:AudioContext;private music?:HTMLAudioElement;private current?:MusicId;private urls=new Map<MusicId,string>();private blobs=new Map<MusicId,Blob>();private musicVolume=.25;private sfxVolume=.75;private muted=false;private disabled=false;private suspendedByPage=false;private lastSfx=new Map<SfxId,number>();
 constructor(){try{const raw=localStorage.getItem(STORE);if(raw){const s=JSON.parse(raw);this.musicVolume=this.clamp(s.musicVolume??.25);this.sfxVolume=this.clamp(s.sfxVolume??.75);this.muted=!!s.muted}}catch{}}
 get settings(){return{musicVolume:this.musicVolume,sfxVolume:this.sfxVolume,muted:this.muted,disabled:this.disabled}}
 setMusicVolume(v:number){this.musicVolume=this.clamp(v);this.applyMusicVolume();this.save()}
 setSfxVolume(v:number){this.sfxVolume=this.clamp(v);this.save()}
 setMuted(v:boolean){this.muted=v;this.applyMusicVolume();this.save()}
 disable(){this.disabled=true;this.stopMusic();this.ctx?.suspend().catch(()=>{})}
 async unlock(){if(this.disabled)return;this.ensureContext();if(this.ctx?.state==='suspended')await this.ctx.resume().catch(()=>{});this.sfx('confirm')}
 async preload(onProgress:(p:LoadProgress)=>void,signal?:AbortSignal){
  const entries=Object.entries(TRACKS) as [MusicId,string][];let completed=0,loadedBytes=0;const sizes=new Map<MusicId,number>();
  onProgress({completed,total:entries.length,loadedBytes,totalBytes:null,status:'Controllo dimensioni…',indeterminate:true});
  await Promise.all(entries.map(async([id,url])=>{try{const r=await fetch(url,{method:'HEAD',cache:'no-store',signal});const n=Number(r.headers.get('content-length'));if(r.ok&&Number.isFinite(n)&&n>0)sizes.set(id,n)}catch{}}));
  const totalBytes=sizes.size===entries.length?[...sizes.values()].reduce((a,b)=>a+b,0):null;
  for(const [id,url] of entries){
   let lastError:unknown;
   for(let attempt=1;attempt<=2;attempt++)try{
    const blob=await this.fetchWithProgress(url,id,sizes,loadedBytes,totalBytes,p=>onProgress({completed,total:entries.length,loadedBytes:loadedBytes+p,totalBytes,status:`Download ${id} (${attempt}/2)`,indeterminate:totalBytes===null}),signal);
    if(blob.size<1024)throw new Error(`${id}: file audio troppo piccolo`);this.blobs.set(id,blob);loadedBytes+=blob.size;completed++;onProgress({completed,total:entries.length,loadedBytes,totalBytes,status:`Scaricato ${completed}/${entries.length}`,indeterminate:totalBytes===null});lastError=undefined;break;
   }catch(e){lastError=e;if(signal?.aborted)throw e}
   if(lastError)throw lastError;
  }
  onProgress({completed,total:entries.length,loadedBytes,totalBytes,status:'Preparazione audio…',indeterminate:false});
  for(const [id,blob] of this.blobs){const url=URL.createObjectURL(blob);this.urls.set(id,url);await this.validate(url,id)}
  onProgress({completed:entries.length,total:entries.length,loadedBytes,totalBytes:totalBytes??loadedBytes,status:'Audio pronto',indeterminate:false});
 }
 private async fetchWithProgress(url:string,id:MusicId,sizes:Map<MusicId,number>,base:number,total:number|null,onChunk:(n:number)=>void,signal?:AbortSignal){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  try{const r=await fetch(url,{cache:'reload',signal:controller.signal});if(!r.ok)throw new Error(`${id}: HTTP ${r.status}`);if(!r.body)return await r.blob();const reader=r.body.getReader(),parts:Uint8Array[]=[];let n=0;while(true){const x=await reader.read();if(x.done)break;if(x.value){parts.push(x.value);n+=x.value.byteLength;onChunk(n)}}const type=r.headers.get('content-type')||'audio/mpeg';return new Blob(parts,{type})}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 }
 private validate(url:string,id:MusicId){return new Promise<void>((resolve,reject)=>{const a=new Audio();const timer=setTimeout(()=>{a.src='';reject(new Error(`${id}: timeout preparazione`))},12000);a.preload='metadata';a.onloadedmetadata=()=>{clearTimeout(timer);if(!Number.isFinite(a.duration)||a.duration<=1)reject(new Error(`${id}: durata non valida`));else resolve()};a.onerror=()=>{clearTimeout(timer);reject(new Error(`${id}: MP3 non supportato/corrotto`))};a.src=url;a.load()})}
 async playMusic(id:MusicId,fade=.18){if(this.disabled||this.current===id&&!this.music?.paused)return;const src=this.urls.get(id)||TRACKS[id];const old=this.music;if(old){old.pause();old.src=''}const a=new Audio(src);a.loop=true;a.preload='auto';a.volume=0;this.music=a;this.current=id;try{await a.play();const target=this.effectiveMusic();const steps=6;for(let i=1;i<=steps;i++){await new Promise(r=>setTimeout(r,fade*1000/steps));if(this.music!==a)return;a.volume=target*i/steps}}catch{}}
 stopMusic(){if(this.music){this.music.pause();this.music.src='';this.music=undefined}this.current=undefined}
 pauseForPage(){this.suspendedByPage=true;this.music?.pause();this.ctx?.suspend().catch(()=>{})}
 async resumeForPage(){if(!this.suspendedByPage||this.disabled)return;this.suspendedByPage=false;if(this.ctx?.state==='suspended')await this.ctx.resume().catch(()=>{});if(this.music&&!this.muted)await this.music.play().catch(()=>{})}
 sfx(id:SfxId){if(this.disabled||this.muted||this.sfxVolume<=0)return;const now=performance.now(),last=this.lastSfx.get(id)??-1e9;if(now-last<45)return;this.lastSfx.set(id,now);this.ensureContext();if(!this.ctx||this.ctx.state!=='running')return;const map:Record<SfxId,[number,number,OscillatorType,number]>={confirm:[620,.06,'square',.06],back:[280,.07,'square',.05],go:[760,.12,'square',.07],bossWarning:[95,.32,'sawtooth',.09],enrage:[145,.22,'sawtooth',.08],stageClear:[660,.28,'square',.08],victory:[880,.42,'square',.09],gameOver:[120,.5,'triangle',.08],swing:[210,.045,'square',.035],punch:[125,.055,'square',.065],kick:[78,.075,'square',.075],finisher:[62,.11,'sawtooth',.08],airHit:[95,.09,'triangle',.075],playerHit:[105,.1,'sawtooth',.07],enemyKo:[72,.16,'square',.07],jump:[360,.07,'square',.04],land:[82,.05,'triangle',.045],grab:[190,.06,'square',.05],throw:[70,.13,'sawtooth',.07],bodyHit:[55,.12,'triangle',.075],crate:[150,.1,'square',.065],barrel:[230,.13,'sawtooth',.06],heal:[720,.18,'triangle',.055]};const [f,d,type,v]=map[id];this.tone(f,d,type,v*this.sfxVolume)}
 private tone(freq:number,d:number,type:OscillatorType,vol:number){const c=this.ctx!,o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(35,freq*.55),t+d);g.gain.setValueAtTime(Math.max(.0001,vol),t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d);o.onended=()=>{o.disconnect();g.disconnect()}}
 private ensureContext(){if(!this.ctx)try{this.ctx=new AudioContext({latencyHint:'interactive'})}catch{}}
 private effectiveMusic(){return this.muted||this.disabled?0:this.musicVolume}
 private applyMusicVolume(){if(this.music)this.music.volume=this.effectiveMusic()}
 private clamp(v:number){return Math.max(0,Math.min(1,Number(v)||0))}
 private save(){try{localStorage.setItem(STORE,JSON.stringify({musicVolume:this.musicVolume,sfxVolume:this.sfxVolume,muted:this.muted}))}catch{}}
 dispose(){this.stopMusic();for(const u of this.urls.values())URL.revokeObjectURL(u);this.urls.clear();this.blobs.clear();void this.ctx?.close()}
}
