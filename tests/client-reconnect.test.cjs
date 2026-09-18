const test = require('node:test');
const assert = require('node:assert/strict');

class Storage {
  constructor(){ this.map=new Map(); }
  getItem(k){ return this.map.has(k)?this.map.get(k):null; }
  setItem(k,v){ this.map.set(k,String(v)); }
  removeItem(k){ this.map.delete(k); }
}
class CE extends Event { constructor(type, init={}){ super(type); this.detail=init.detail; } }
class MockWebSocket extends EventTarget {
  static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
  static instances=[];
  constructor(url){ super(); this.url=url; this.readyState=0; this.sent=[]; MockWebSocket.instances.push(this); }
  open(){ this.readyState=1; this.dispatchEvent(new Event('open')); }
  send(v){ this.sent.push(v); }
  message(v){ this.dispatchEvent(new CE('message',{detail:null})); const e=new Event('message'); Object.defineProperty(e,'data',{value:JSON.stringify(v)}); this.dispatchEvent(e); }
  close(code=1000, reason=''){ this.readyState=3; const e=new Event('close'); Object.defineProperties(e,{code:{value:code},reason:{value:reason}}); this.dispatchEvent(e); }
}
global.window=global;
global.localStorage=new Storage();
global.CustomEvent=CE;
global.WebSocket=MockWebSocket;
const { CoopClient } = require('../.test-client/online/CoopClient.js');

function welcome(ws, token='tok'){ ws.message({type:'welcome',protocol:2,room:'ABC234',slot:0,reconnectToken:token}); }

test('replaced session does not reconnect automatically or erase shared token', async()=>{
  const client=new CoopClient('https://example.test');
  const p=client.connect('ABC234','A'); const ws=MockWebSocket.instances.at(-1); ws.open(); welcome(ws); await p;
  const before=localStorage.getItem('streetbrawl-coop-session');
  let replaced=0; client.addEventListener('session-replaced',()=>replaced++);
  ws.close(4000,'REPLACED');
  await new Promise(r=>setTimeout(r,700));
  assert.equal(replaced,1); assert.equal(MockWebSocket.instances.length,1);
  assert.equal(localStorage.getItem('streetbrawl-coop-session'),before);
});

test('network loss retains automatic reconnect', async()=>{
  MockWebSocket.instances.length=0; localStorage.removeItem('streetbrawl-coop-session');
  const client=new CoopClient('https://example.test');
  const p=client.connect('ABC234','A'); const ws=MockWebSocket.instances.at(-1); ws.open(); welcome(ws,'net'); await p;
  ws.close(1006,'');
  await new Promise(r=>setTimeout(r,700));
  assert.ok(MockWebSocket.instances.length>=2);
  client.close();
});

test('authoritative narrative state reconciles active, ready and inactive scenes', async()=>{
  MockWebSocket.instances.length=0; localStorage.removeItem('streetbrawl-coop-session');
  const client=new CoopClient('https://example.test');
  const p=client.connect('ABC234','A'); const ws=MockWebSocket.instances.at(-1); ws.open(); welcome(ws,'scene'); await p;
  ws.message({type:'scene',sceneId:'opening',active:true,readySlots:[0],revision:4});
  assert.equal(client.activeScene,'opening'); assert.equal(client.activeSceneReady,true);
  ws.message({type:'scene',sceneId:'stage-intro-1',active:true,readySlots:[],revision:5});
  assert.equal(client.activeScene,'stage-intro-1'); assert.equal(client.activeSceneReady,false);
  ws.message({type:'scene',sceneId:'stage-intro-1',active:false,readySlots:[],revision:6});
  assert.equal(client.activeScene,undefined);
  ws.message({type:'scene',sceneId:'opening',active:true,readySlots:[],revision:3});
  assert.equal(client.activeScene,undefined);
  client.close();
});
