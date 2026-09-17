import { GameRoom } from './room';
export { GameRoom };
interface Env { ROOMS: DurableObjectNamespace; }
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:cors});
function roomCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(6));return Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');}
export default {async fetch(request:Request,env:Env):Promise<Response>{if(request.method==='OPTIONS')return new Response(null,{headers:cors});const url=new URL(request.url);if(url.pathname==='/health')return json({ok:true,service:'streetbrawl-coop'});if(url.pathname==='/rooms'&&request.method==='POST'){const code=roomCode(),id=env.ROOMS.idFromName(code),stub=env.ROOMS.get(id);await stub.fetch(new Request(`https://room/init?code=${code}`,{method:'POST'}));return json({room:code,joinUrl:`${url.origin}/rooms/${code}`},201);}const match=url.pathname.match(/^\/rooms\/([A-Z2-9]{6})(\/ws)?$/);if(!match)return json({error:'NOT_FOUND'},404);return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);}};
