(function(){
'use strict';

/* ---------- категории ---------- */
var CATS={
  main:{n:'Главные точки'},food:{n:'Еда и кофе'},bar:{n:'Бары'},
  shop:{n:'Шопинг'},sight:{n:'Места и районы'},spa:{n:'Услуги'}
};
var ORDER=['main','food','bar','shop','sight','spa'];

/* ---------- координаты: Amap и Apple в GCJ-02, подложка в WGS-84 ---------- */
function tlat(x,y){var r=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;r+=(20*Math.sin(y*Math.PI)+40*Math.sin(y/3*Math.PI))*2/3;r+=(160*Math.sin(y/12*Math.PI)+320*Math.sin(y*Math.PI/30))*2/3;return r}
function tlon(x,y){var r=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;r+=(20*Math.sin(x*Math.PI)+40*Math.sin(x/3*Math.PI))*2/3;r+=(150*Math.sin(x/12*Math.PI)+300*Math.sin(x/30*Math.PI))*2/3;return r}
function delta(lat,lon){
  var a=6378245.0,ee=0.00669342162296594323;
  var dl=tlat(lon-105,lat-35),dn=tlon(lon-105,lat-35),rl=lat/180*Math.PI,m=Math.sin(rl);m=1-ee*m*m;var s=Math.sqrt(m);
  return [dl*180/((a*(1-ee))/(m*s)*Math.PI),dn*180/(a/s*Math.cos(rl)*Math.PI)];
}
function gcj2wgs(lat,lon){var d=delta(lat,lon);return [lon-d[1],lat-d[0]]}   /* -> [lon,lat] */
function wgs2gcj(lat,lon){var d=delta(lat,lon);return [lat+d[0],lon+d[1]]}  /* -> [lat,lon] */

function hav(a,b){ /* a,b = [lon,lat] */
  var R=6371,r=Math.PI/180,dp=(b[1]-a[1])*r,dl=(b[0]-a[0])*r;
  var x=Math.sin(dp/2)*Math.sin(dp/2)+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dl/2)*Math.sin(dl/2);
  return 2*R*Math.asin(Math.sqrt(x));
}
function km(d){return d<1?(Math.round(d*100)*10)+' м':d.toFixed(1)+' км'}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function store(k,v){try{if(v===undefined){var x=localStorage.getItem(k);return x?JSON.parse(x):null}localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}

/* ---------- состояние ---------- */
var places=[],unplaced=[],markers={},me=null,popup=null;
var state={cats:{},q:'',visited:store('bj-visited')||{}};
ORDER.forEach(function(c){state.cats[c]=true});

/* стили карты. OpenFreeMap: бесплатные векторные тайлы на данных OpenStreetMap */
var STYLES={
  liberty:{n:'Карта',u:'https://tiles.openfreemap.org/styles/liberty'},
  positron:{n:'Светлая',u:'https://tiles.openfreemap.org/styles/positron'},
  dark:{n:'Тёмная',u:'https://tiles.openfreemap.org/styles/dark'},
  osm:{n:'OSM',u:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}},layers:[{id:'osm',type:'raster',source:'osm'}]}}
};
var STYLE_ORDER=['liberty','positron','dark','osm'];
var dark=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches;
var styleKey=store('bj-style');
if(!STYLES[styleKey])styleKey=dark?'dark':'liberty';

var map=new maplibregl.Map({
  container:'map',style:STYLES[styleKey].u,center:[116.42,39.92],zoom:11,minZoom:3,maxZoom:19,
  attributionControl:{compact:true},hash:false
});
map.addControl(new maplibregl.NavigationControl({showCompass:true}),'top-right');
var geo=new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:true,showUserLocation:true,showAccuracyCircle:true,fitBoundsOptions:{maxZoom:16}});
map.addControl(geo,'top-right');
map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
geo.on('geolocate',function(e){me=[e.coords.longitude,e.coords.latitude];renderList()});
geo.on('error',function(e){
  toast(e&&e.code===1?'Доступ к геолокации запрещён. Разрешите его для этого сайта в настройках браузера.':'Не удалось определить местоположение. Нужен https и включённая геолокация.');
});
var fell=false;
setTimeout(function(){
  if(!map.isStyleLoaded()&&!fell&&styleKey!=='osm'){fell=true;toast('Векторная карта не загрузилась, включаю обычную схему OSM.');setStyle('osm',true)}
},9000);

function setStyle(k,silent){
  styleKey=k;if(!silent)store('bj-style',k);
  map.setStyle(STYLES[k].u);
  document.getElementById('layerName').textContent=STYLES[k].n;
}
document.getElementById('layerName').textContent=STYLES[styleKey].n;
document.getElementById('layerBtn').onclick=function(){
  setStyle(STYLE_ORDER[(STYLE_ORDER.indexOf(styleKey)+1)%STYLE_ORDER.length]);
};

/* ---------- данные ---------- */
function getJSON(u){return fetch(u,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})}
function prep(p){
  if(p.w){p.g=wgs2gcj(p.w[1],p.w[0])}
  else{p.g=[p.lat,p.lon];p.w=gcj2wgs(p.lat,p.lon)}
  p.links=p.links||[];return p;
}
var MAIN_TPL={
  home:{id:'home',cat:'main',glyph:'⌂',name:'Где я буду жить',note:'Долгое нажатие на карте — поставить точку',addr:''},
  bisu:{id:'bisu',cat:'main',glyph:'У',name:'BISU: университет Кати',note:'Beijing International Studies University, 北京第二外国语学院',addr:''}
};
Promise.all([
  getJSON('data/places.json'),
  getJSON('data/main.json').catch(function(){return {places:[]}})
]).then(function(r){
  places=r[0].places.map(prep);unplaced=r[0].unplaced||[];
  var mainFile={};(r[1].places||[]).forEach(function(p){mainFile[p.id]=p});
  var local=store('bj-main')||{};
  Object.keys(MAIN_TPL).reverse().forEach(function(id){
    var p=Object.assign({},MAIN_TPL[id],mainFile[id]||{});
    if(local[id])p.w=[local[id].lon,local[id].lat],delete p.lat,delete p.lon;
    if(p.w||(p.lat&&p.lon))places.unshift(prep(p));
  });
  start();
}).catch(function(){toast('Не удалось загрузить список мест.')});

/* ---------- маркеры и список ---------- */
function home(){return places.filter(function(p){return p.id==='home'})[0]}
function matches(p){
  if(!state.cats[p.cat])return false;
  if(state.q)return (p.name+' '+(p.note||'')+' '+(p.addr||'')).toLowerCase().indexOf(state.q)>-1;
  return true;
}
function makeMarker(p){
  var el=document.createElement('div');
  el.className='mk '+p.cat+(p.rough?' rough':'')+(state.visited[p.id]?' done':'');
  el.style.setProperty('--cc','var(--c-'+p.cat+')');
  if(p.glyph)el.setAttribute('data-g',p.glyph);
  el.title=p.name;el.setAttribute('role','button');el.tabIndex=0;
  el.addEventListener('click',function(e){e.stopPropagation();open(p)});
  el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open(p)}});
  var m=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat(p.w);
  m._el=el;return m;
}
function refreshMarkers(){
  Object.keys(markers).forEach(function(id){markers[id].remove()});
  markers={};
  places.forEach(function(p){
    if(!matches(p))return;
    var m=makeMarker(p);m.addTo(map);markers[p.id]=m;
    if(p.cat==='main')m._el.style.zIndex=5;
  });
}
function distText(p){
  var a=me?hav(p.w,me):null,h=home();
  if(a!==null)return km(a);
  if(h&&p.id!=='home')return km(hav(p.w,h.w));
  return '';
}
function renderList(){
  var el=document.getElementById('list'),h='',any=false;
  ORDER.forEach(function(c){
    var items=places.filter(function(p){return p.cat===c&&matches(p)});
    if(!items.length)return;any=true;
    h+='<h3>'+CATS[c].n+' · '+items.length+'</h3>';
    items.forEach(function(p){
      h+='<button type="button" class="item'+(state.visited[p.id]?' done':'')+'" data-id="'+esc(p.id)+'" style="--cc:var(--c-'+c+')"><i></i><span class="t"><b>'+esc(p.name)+'</b><span>'+esc(p.note||'')+'</span></span><span class="d">'+esc(distText(p))+'</span></button>';
    });
  });
  var un=unplaced.filter(function(p){
    if(!state.cats[p.cat])return false;
    return !state.q||(p.name+' '+(p.note||'')).toLowerCase().indexOf(state.q)>-1;
  });
  if(un.length){
    any=true;h+='<h3>Без точки на карте · '+un.length+'</h3>';
    un.forEach(function(p){
      var a=p.links&&p.links.length?'<a class="go" target="_blank" rel="noopener" href="'+esc(p.links[0].u)+'">Открыть</a>':'';
      h+='<div class="item static" style="--cc:var(--c-'+p.cat+')"><i></i><span class="t"><b>'+esc(p.name)+'</b><span>'+esc(p.note||'')+'</span></span>'+a+'</div>';
    });
  }
  if(!any)h='<p class="empty">Ничего не найдено.</p>';
  el.innerHTML=h;
}
function refresh(){refreshMarkers();renderList()}

/* ---------- карточка места ---------- */
function amapUrl(p){return 'https://uri.amap.com/marker?position='+p.g[1]+','+p.g[0]+'&name='+encodeURIComponent(p.name)+'&coordinate=gaode&callnative=1'}
function appleUrl(p){return 'https://maps.apple.com/?ll='+p.g[0]+','+p.g[1]+'&q='+encodeURIComponent(p.name)}
function routeUrl(p){return 'https://maps.apple.com/?daddr='+p.g[0]+','+p.g[1]+'&q='+encodeURIComponent(p.name)+'&dirflg=r'}
function popupHtml(p){
  var done=!!state.visited[p.id];
  var h='<div class="pp"><span class="tag" style="--cc:var(--c-'+p.cat+')"><i></i>'+CATS[p.cat].n+'</span><h2>'+esc(p.name)+'</h2>';
  if(p.note)h+='<p>'+esc(p.note)+'</p>';
  if(p.addr)h+='<p class="sub">'+esc(p.addr)+'</p>';
  if(p.rough)h+='<p class="sub">Точка приблизительная, сверьтесь со ссылкой.</p>';
  var dd=[],hm=home();
  if(hm&&p.id!=='home')dd.push(km(hav(p.w,hm.w))+' от дома');
  if(me)dd.push(km(hav(p.w,me))+' от вас');
  if(dd.length)h+='<p class="sub">≈ '+esc(dd.join(' · '))+' по прямой</p>';
  h+='<div class="row">';
  if(p.price)h+='<span class="pill">'+esc(p.price)+'</span>';
  p.links.forEach(function(l){h+='<a class="btn" target="_blank" rel="noopener" href="'+esc(l.u)+'">'+esc(l.l)+'</a>'});
  h+='<a class="btn ghost" target="_blank" rel="noopener" href="'+esc(amapUrl(p))+'">В Amap</a>';
  h+='<a class="btn ghost" target="_blank" rel="noopener" href="'+esc(appleUrl(p))+'">Apple Maps</a>';
  h+='<a class="btn ghost" target="_blank" rel="noopener" href="'+esc(routeUrl(p))+'">Маршрут</a>';
  h+='<button type="button" class="btn ghost" data-visit="'+esc(p.id)+'">'+(done?'Не был':'Был здесь')+'</button></div></div>';
  return h;
}
function open(p,fly){
  if(popup)popup.remove();
  popup=new maplibregl.Popup({offset:p.cat==='main'?22:16,maxWidth:'300px',closeOnMove:false}).setLngLat(p.w).setHTML(popupHtml(p)).addTo(map);
  if(fly)map.flyTo({center:p.w,zoom:Math.max(map.getZoom(),15),duration:600});
}
function byId(id){return places.filter(function(p){return p.id===id})[0]}
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('[data-visit]');
  if(b){
    var id=b.getAttribute('data-visit');
    if(state.visited[id])delete state.visited[id];else state.visited[id]=1;
    store('bj-visited',state.visited);
    var p=byId(id);if(markers[id])markers[id]._el.classList.toggle('done',!!state.visited[id]);
    if(popup)popup.setHTML(popupHtml(p));
    renderList();return;
  }
  var s=e.target.closest&&e.target.closest('[data-set]');
  if(s&&pending){
    var loc=store('bj-main')||{};
    if(s.getAttribute('data-set')==='reset'){loc={}}
    else loc[s.getAttribute('data-set')]={lon:pending.lng,lat:pending.lat};
    store('bj-main',loc);
    pending=null;if(popup)popup.remove();
    reloadMain(loc);
  }
});
function reloadMain(loc){
  places=places.filter(function(p){return p.cat!=='main'});
  getJSON('data/main.json').catch(function(){return {places:[]}}).then(function(r){
    var mf={};(r.places||[]).forEach(function(p){mf[p.id]=p});
    Object.keys(MAIN_TPL).reverse().forEach(function(id){
      var p=Object.assign({},MAIN_TPL[id],mf[id]||{});
      if(loc[id]){p.w=[loc[id].lon,loc[id].lat];delete p.lat;delete p.lon}
      if(p.w||(p.lat&&p.lon))places.unshift(prep(p));
    });
    refresh();
  });
}

/* ---------- долгое нажатие: поставить дом или университет ---------- */
var pending=null,lpTimer=null,lpStart=null;
function showSetMenu(ll){
  pending={lng:ll.lng,lat:ll.lat};
  if(popup)popup.remove();
  var h='<div class="pp"><h2>Поставить здесь</h2><p class="sub">'+ll.lat.toFixed(5)+', '+ll.lng.toFixed(5)+'</p><div class="row">'
   +'<button type="button" class="btn" data-set="home">⌂ Здесь я живу</button>'
   +'<button type="button" class="btn" data-set="bisu">У Университет Кати</button>';
  if(store('bj-main'))h+='<button type="button" class="btn ghost" data-set="reset">Сбросить</button>';
  popup=new maplibregl.Popup({offset:6,maxWidth:'300px'}).setLngLat(ll).setHTML(h+'</div></div>').addTo(map);
}
function lpCancel(){clearTimeout(lpTimer);lpTimer=null}
map.on('touchstart',function(e){
  if(e.originalEvent.touches.length!==1){lpCancel();return}
  lpStart=e.point;lpCancel();
  lpTimer=setTimeout(function(){lpTimer=null;showSetMenu(e.lngLat)},650);
});
map.on('touchmove',function(e){if(lpTimer&&lpStart&&Math.hypot(e.point.x-lpStart.x,e.point.y-lpStart.y)>10)lpCancel()});
['touchend','touchcancel','dragstart','zoomstart','pitchstart','rotatestart'].forEach(function(ev){map.on(ev,lpCancel)});
map.on('contextmenu',function(e){showSetMenu(e.lngLat)});

/* ---------- интерфейс ---------- */
var panel=document.getElementById('panel');
var mobile=function(){return window.matchMedia('(max-width:859px)').matches};
function sheet(mode){
  panel.classList.remove('peek','open');if(mode)panel.classList.add(mode);
  document.documentElement.style.setProperty('--ph',mode==='open'?'76vh':'calc(138px + env(safe-area-inset-bottom,0px))');
}
document.getElementById('handle').onclick=function(){sheet(panel.classList.contains('open')?'peek':'open')};
document.getElementById('list').addEventListener('click',function(e){
  var b=e.target.closest('.item[data-id]');if(!b)return;
  var p=byId(b.getAttribute('data-id'));if(!p)return;
  if(mobile())sheet('peek');
  open(p,true);
});
document.getElementById('q').addEventListener('input',function(e){state.q=e.target.value.trim().toLowerCase();refresh()});
document.getElementById('q').addEventListener('focus',function(){if(mobile())sheet('open')});

var toastT=null;
function toast(t){
  var el=document.getElementById('toast');el.textContent=t;el.style.display='block';
  clearTimeout(toastT);toastT=setTimeout(function(){el.style.display='none'},6000);
}

function start(){
  var chips=document.getElementById('chips');
  ORDER.forEach(function(c){
    var n=places.filter(function(p){return p.cat===c}).length+unplaced.filter(function(p){return p.cat===c}).length;
    if(!n)return;
    var b=document.createElement('button');
    b.type='button';b.className='chip';b.setAttribute('aria-pressed','true');
    b.style.setProperty('--cc','var(--c-'+c+')');
    b.innerHTML='<i></i>'+CATS[c].n+' <span class="n">'+n+'</span>';
    b.onclick=function(){state.cats[c]=!state.cats[c];b.setAttribute('aria-pressed',state.cats[c]?'true':'false');refresh()};
    chips.appendChild(b);
  });
  document.getElementById('count').textContent=places.length+' мест на карте · '+unplaced.length+' без точки';
  sheet(mobile()?'peek':null);
  refresh();
  var bounds=new maplibregl.LngLatBounds();
  places.forEach(function(p){bounds.extend(p.w)});
  if(!bounds.isEmpty()){
    var pad=mobile()?{top:70,left:30,right:30,bottom:210}:{top:60,left:390,right:60,bottom:60};
    map.fitBounds(bounds,{padding:pad,duration:0,maxZoom:14});
  }
}

/* ---------- офлайн и установка на экран «Домой» ---------- */
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
  window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})});
}
})();
