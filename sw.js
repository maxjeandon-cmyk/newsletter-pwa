const CACHE='newsletter-v1';
const CORE=['./','./index.html','./app.js','./manifest.webmanifest','./chapters.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.mode==='navigate'||CORE.includes(url.pathname.replace(/\\/$/,''))){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
  } else if(url.pathname.includes('/editions/')){
    e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r; }).catch(()=>caches.match(e.request)));
  }
});