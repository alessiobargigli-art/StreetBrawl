const test=require('node:test');const assert=require('node:assert/strict');
global.WebSocket={OPEN:1};
const {GameRoom}=require('../.test-room/worker/src/room.js');
class Socket{constructor(){this.readyState=1;this.messages=[];this.closed=[]}send(v){this.messages.push(JSON.parse(v))}close(c,r){this.closed.push([c,r]);this.readyState=3}}
function room(){const r=new GameRoom({},{});r.code='ABC234';r.simulation.addPlayer(0,'A');r.simulation.addPlayer(1,'B');r.simulation.reserveCharacter(0,'alex');r.simulation.reserveCharacter(1,'matt');r.simulation.setReady(0,true);r.simulation.setReady(1,true);assert.equal(r.simulation.start(),true);return r}
test('A ready, disconnect, B ready advances and reconnect sees next authoritative scene',()=>{
 const r=room(),a=new Socket(),b=new Socket();r.sessions.set(a,{socket:a,slot:0,token:'ta',nickname:'A'});r.sessions.set(b,{socket:b,slot:1,token:'tb',nickname:'B'});
 r.activateScene('opening',true);r.pendingScenes.push('stage-intro-1');r.markSceneReady(0,'opening');r.onClose(a);r.markSceneReady(1,'opening');
 assert.equal(r.activeScene,'stage-intro-1');assert.equal(r.sceneReady.size,0);
 const a2=new Socket();r.handleHello(a2,{type:'hello',protocol:2,nickname:'A',reconnectToken:'ta'});
 const scene=a2.messages.filter(x=>x.type==='scene').at(-1);assert.equal(scene.sceneId,'stage-intro-1');assert.equal(scene.active,true);assert.deepEqual(scene.readySlots,[]);if(r.tickTimer)clearInterval(r.tickTimer);
});
test('reconnect with no active scene receives explicit inactive narrative state',()=>{
 const r=room(),a=new Socket();r.reconnects.set('ta',{slot:0,token:'ta',nickname:'A',expiresAt:Date.now()+30000});
 const a2=new Socket();r.handleHello(a2,{type:'hello',protocol:2,nickname:'A',reconnectToken:'ta'});
 const scene=a2.messages.filter(x=>x.type==='scene').at(-1);assert.equal(scene.active,false);assert.equal(scene.sceneId,'');if(r.tickTimer)clearInterval(r.tickTimer);
});
test('duplicate scene confirmations are idempotent and manual pause survives finale scene',()=>{
 const r=room(),a=new Socket(),b=new Socket();r.sessions.set(a,{socket:a,slot:0,token:'ta',nickname:'A'});r.sessions.set(b,{socket:b,slot:1,token:'tb',nickname:'B'});
 r.manualPaused=true;r.activateScene('finale',false);r.markSceneReady(0,'finale');r.markSceneReady(0,'finale');assert.equal(r.sceneReady.size,1);r.markSceneReady(1,'finale');assert.equal(r.activeScene,undefined);assert.equal(r.simulation.state.phase,'paused');
});
