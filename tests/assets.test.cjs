const test=require('node:test');const assert=require('node:assert/strict');
global.window=new EventTarget();global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
class BadImage{constructor(){this.decoding='';this.naturalWidth=0;this.naturalHeight=0;}set src(v){this._src=v}decode(){return Promise.reject(new Error('decode failed'))}}
global.Image=BadImage;
const {CoopGame}=require('../.test-game/online/CoopGame.js');
class Client extends EventTarget{sendInput(){}}
test('art preload rejects a missing/undecodable required image instead of starting silently',async()=>{
 const canvas={getContext:()=>({imageSmoothingEnabled:false})};const game=new CoopGame(canvas,new Client());
 await assert.rejects(()=>game.preload(),/non caricabile/);game.stop();
});
