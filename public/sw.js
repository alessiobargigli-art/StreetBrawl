const PREFIX='streetbrawl-';
const CACHE=`${PREFIX}v4`;
const CORE=['/','/manifest.webmanifest','/icons/icon.svg','/assets/fighters/alex.svg','/assets/fighters/thug.svg','/assets/fighters/ripper.svg','/assets/fighters/bruno.svg','/assets/fighters/dock-master.svg','/assets/stages/stage1-street.svg','/assets/stages/stage2-docks.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const request=event.request;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok)event.waitUntil(caches.open(CACHE).then(cache=>cache.put('/',response.clone())));
      return response;
    }).catch(async()=>await caches.match(request)||await caches.match('/')||Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok&&response.type!=='opaque')event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())));
    return response;
  })));
});
