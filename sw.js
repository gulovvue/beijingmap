/* Кэш для офлайна: оболочка сайта и все тайлы, которые вы уже видели. */
var SHELL='bj-shell-v1',TILES='bj-tiles-v1',MAXTILES=2500;
var FILES=['./','index.html','style.css','app.js','vendor/maplibre-gl.js','vendor/maplibre-gl.css','data/places.json','manifest.webmanifest','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(SHELL).then(function(c){return c.addAll(FILES)}).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k!==SHELL&&k!==TILES}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});

function trim(cache){
  cache.keys().then(function(ks){
    if(ks.length>MAXTILES)ks.slice(0,ks.length-MAXTILES).forEach(function(k){cache.delete(k)});
  });
}
var MAPHOSTS=['tiles.openfreemap.org','tile.openstreetmap.org'];

self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var u=new URL(req.url);
  if(MAPHOSTS.indexOf(u.hostname)>-1){
    /* карта: сначала кэш, иначе сеть и запоминаем */
    e.respondWith(caches.open(TILES).then(function(c){
      return c.match(req).then(function(hit){
        if(hit)return hit;
        return fetch(req).then(function(r){
          if(r&&r.ok){c.put(req,r.clone());trim(c)}
          return r;
        });
      });
    }));
    return;
  }
  if(u.origin===location.origin){
    /* сайт: показываем из кэша и тихо обновляем */
    e.respondWith(caches.open(SHELL).then(function(c){
      return c.match(req,{ignoreSearch:true}).then(function(hit){
        var net=fetch(req).then(function(r){if(r&&r.ok)c.put(req,r.clone());return r}).catch(function(){return hit});
        return hit||net;
      });
    }));
  }
});
