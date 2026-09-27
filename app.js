'use strict';
// ===== Newsletter PWA — Édition du jour + Flux chaud =====
const PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u)
];
const STATE = { edition:null, flux:{}, chapters:[], theme:'dark', refreshMin:15, lastRefresh:null, view:'edition', chapter:null };
const $ = s => document.querySelector(s);
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const LS = { theme:'nl_theme', refresh:'nl_refresh', chapters:'nl_chapters', fluxCache:'nl_flux_cache', fluxTime:'nl_flux_time', chapterState:'nl_chap_state' };
const ls = { get:(k,f)=>{ try{ const v=localStorage.getItem(k); return v===null?f:JSON.parse(v);}catch(e){return f} }, set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}} };

// ---------- Thème ----------
function applyTheme(){
  const t = STATE.theme==='auto' ? (matchMedia('(prefers-color-scheme: light)').matches?'light':'dark') : STATE.theme;
  document.documentElement.dataset.theme = t;
  $('#btnTheme').textContent = t==='dark' ? '🌙' : '☀️';
}
function cycleTheme(){ const order=['dark','light','auto']; STATE.theme = order[(order.indexOf(STATE.theme)+1)%3]; ls.set(LS.theme, STATE.theme); applyTheme(); toast('Apparence : '+({dark:'sombre',light:'clair',auto:'auto'}[STATE.theme])); }

// ---------- Édition du jour ----------
async function loadEdition(){
  const today = new Date().toISOString().slice(0,10);
  const candidates = ['editions/'+today+'.json','editions/latest.json'];
  for(const p of candidates){
    try{ const r = await fetch(p,{cache:'no-store'}); if(!r.ok) continue; STATE.edition = await r.json(); STATE.edition._path=p; return; }catch(e){}
  }
  // fallback : cache
  STATE.edition = ls.get('nl_edition_cache', null);
  if(STATE.edition) STATE.edition._offline = true;
}
async function saveEditionCache(){ if(STATE.edition) ls.set('nl_edition_cache', STATE.edition); }

// ---------- Flux chaud (RSS via proxy) ----------
const FEEDS = [
  'https://www.lemonde.fr/rss/une.xml',
  'https://www.lemonde.fr/rss/international.xml',
  'https://www.lemonde.fr/rss/sciences.xml',
  'https://www.lemonde.fr/rss/culture.xml',
  'https://feeds.leparisien.fr/leparisien/rss',
  'https://www.francetvinfo.fr/titres.rss',
  'https://www.huffingtonpost.fr/rss/index.xml',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'https://www.techmeme.com/feed.xml'
];
async function fetchText(url, timeout=10000){
  for(const px of PROXIES){
    try{
      const c = new AbortController(); const t = setTimeout(()=>c.abort(), timeout);
      const r = await fetch(px(url), {signal:c.signal});
      clearTimeout(t);
      if(!r.ok) continue;
      const txt = await r.text();
      if(txt && txt.length>50) return {txt, via:'proxy'};
    }catch(e){}
  }
  return null;
}
function parseFeed(xml, source){
  const doc = new DOMParser().parseFromString(xml,'text/xml');
  const items = [...doc.querySelectorAll('item'), ...doc.querySelectorAll('entry')];
  return items.map(it=>{
    const g = t => (it.querySelector(t)?.textContent||'').trim();
    let link = g('link') || it.querySelector('link')?.getAttribute('href') || '';
    const dt = g('pubDate') || g('updated') || g('published') || g('dc\\:date') || '';
    return { title: g('title'), link, summary: (g('description')||g('summary')||'').replace(/<[^>]*>/g,'').slice(0,240), date: dt?new Date(dt):null, source };
  }).filter(a=>a.title);
}
function norm(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim(); }
function jaccard(a,b){ const A=new Set(a.split(' ').filter(w=>w.length>2)), B=new Set(b.split(' ').filter(w=>w.length>2)); let inter=0; A.forEach(w=>{if(B.has(w))inter++}); return inter/Math.max(1,Math.sqrt(A.size*B.size)); }
function classify(articles, chapters){
  const out = {}; chapters.forEach(c=>out[c.id]=[]);
  const seen = [];
  for(const a of articles){
    const hay = norm(a.title+' '+a.summary);
    // déduplication
    if(seen.some(s=>jaccard(s,hay)>=0.7)) continue;
    seen.push(hay);
    let best=null, bestScore=0, second=null, secondScore=0;
    for(const c of chapters){
      let score=0;
      c.include.forEach(k=>{ if(hay.includes(norm(k))) score+=2; });
      c.exclude.forEach(k=>{ if(hay.includes(norm(k))) score-=4; });
      if(score>bestScore){ second=best; secondScore=bestScore; best=c; bestScore=score; } else if(score>secondScore){ second=c; secondScore=score; }
    }
    if(best && bestScore>0){ out[best.id].push({...a, score:bestScore}); if(second && secondScore>0) out[second.id].push({...a, score:secondScore}); }
  }
  Object.keys(out).forEach(k=>{
    out[k].sort((x,y)=> (y.date?.getTime?y.date.getTime():0)-(x.date?.getTime?x.date.getTime():0) || y.score-x.score);
  });
  return out;
}
async function refreshFlux(){
  const results = await Promise.all(FEEDS.map(async f=>{
    const r = await fetchText(f);
    return r ? parseFeed(r.txt, f) : [];
  }));
  const all = results.flat().filter(a=>{
    if(!a.date) return true;
    return (Date.now()-a.date.getTime()) < 24*3600*1000;
  });
  STATE.flux = classify(all, STATE.chapters);
  STATE.lastRefresh = new Date();
  ls.set(LS.fluxCache, {flux:STATE.flux, time:STATE.lastRefresh.toISOString(), articles:all.length});
  ls.set(LS.fluxTime, STATE.lastRefresh.toISOString());
  $('#offline').style.display='none';
}
function restoreFlux(){
  const c = ls.get(LS.fluxCache, null);
  if(c){ STATE.flux=c.flux; STATE.lastRefresh=new Date(c.time); return true; }
  return false;
}

// ---------- Chapitres (config utilisateur) ----------
async function loadChapters(){
  let remote=null;
  try{ const r = await fetch('chapters.json',{cache:'no-store'}); if(r.ok) remote = await r.json(); }catch(e){}
  const def = remote?.chapters || [];
  const userState = ls.get(LS.chapterState, null);
  if(userState){
    STATE.chapters = def.map(d=>{ const u=userState.find(x=>x.id===d.id); return u ? {...d,...u,include:d.include,exclude:d.exclude,feeds:d.feeds} : d; })
      .concat([]);
    // garder l'ordre utilisateur
    const order = userState.map(u=>u.id);
    STATE.chapters.sort((a,b)=> (order.indexOf(a.id)+1||99) - (order.indexOf(b.id)+1||99));
  } else STATE.chapters = def;
}

// ---------- Rendu ----------
function render(){
  const app = $('#app'); const tb = $('#tabbar');
  const visible = STATE.chapters.filter(c=>c.visible);
  // Onglets
  tb.innerHTML = '<button class="tab'+(STATE.view==='edition'?' active':'')+'" data-v="edition">📬<span class="k">Édition du jour</span></button>' +
    visible.map(c=>'<button class="tab'+(STATE.view==='chapter'&&STATE.chapter===c.id?' active':'')+'" data-v="'+c.id+'">'+c.emoji+'<span class="k">'+esc(c.nom)+'</span></button>').join('');
  tb.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
    const v=b.dataset.v; if(v==='edition'){STATE.view='edition'}else{STATE.view='chapter';STATE.chapter=v} render(); window.scrollTo(0,0);
  });
  $('#edDate').textContent = STATE.edition ? (STATE.edition._offline?'en cache':'du '+STATE.edition.date.split('-').reverse().join('/')) : '';
  if(STATE.view==='edition') renderEdition(app); else renderChapter(app, STATE.chapter);
}
function renderEdition(app){
  const ed = STATE.edition;
  if(!ed){ app.innerHTML = '<div class="empty">📭 Aucune édition trouvée.<br/><small>Le fichier editions/latest.json arrivera avec la première publication.</small></div>'; return; }
  let h = '<section class="exec"><h2>🎯 L\'essentiel</h2><ul>' + ed.resume_executif.map(x=>'<li>'+esc(x)+'</li>').join('') + '</ul></section>';
  const visible = new Set(STATE.chapters.filter(c=>c.visible).map(c=>c.id));
  for(const ch of (ed.chapitres||[])){
    if(!visible.has(ch.id)) continue;
    const hot = STATE.flux[ch.id]||[];
    h += '<section><div class="chapter-head"><span class="e">'+ch.emoji+'</span><h3>'+esc(ch.nom)+'</h3><small>'+ch.articles.length+' article(s)</small></div>';
    h += '<p class="resume">'+esc(ch.resume)+'</p>';
    h += '<ul class="arts">' + ch.articles.map(a=>'<li>'+articleLink(a)+'</li>').join('') + '</ul>';
    if(hot.length) h += '<p style="text-align:right;margin:4px 0"><button class="btn" data-goto="'+ch.id+'">🔥 ' + hot.length + ' en direct →</button></p>';
    h += '</section>';
  }
  app.innerHTML = h;
  app.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{STATE.view='chapter';STATE.chapter=b.dataset.goto;render();window.scrollTo(0,0)});
}
function articleLink(a){
  const src = '<span class="s"><span class="src">'+esc(a.source)+'</span><span>édition du jour</span></span>';
  return '<a href="'+(a.url||'#')+'"'+(a.url?' target="_blank" rel="noopener"':'')+'><span class="t">'+esc(a.titre)+'</span>'+src+'</a>';
}
function renderChapter(app, id){
  const ch = STATE.chapters.find(c=>c.id===id); if(!ch){ app.innerHTML='<div class="empty">Chapitre introuvable</div>'; return; }
  const edCh = (STATE.edition?.chapitres||[]).find(c=>c.id===id);
  let h = '<section><div class="chapter-head"><span class="e">'+ch.emoji+'</span><h3>'+esc(ch.nom)+'</h3><small>'+(STATE.lastRefresh?'flux du '+STATE.lastRefresh.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'')+'</small></div>';
  if(edCh){ h += '<p class="resume">'+esc(edCh.resume)+'</p><ul class="arts">'+edCh.articles.map(a=>'<li>'+articleLink(a)+'</li>').join('')+'</ul>'; }
  const hot = STATE.flux[id]||[];
  if(hot.length){
    h += '<h3>🔥 En direct (24 h)</h3><ul class="arts">' + hot.slice(0,30).map(a=>{
      const age = a.date? ilY a(a.date) : '';
      return '<li><a href="'+a.link+'" target="_blank" rel="noopener"><span class="t">'+esc(a.title)+'</span><span class="s"><span class="src">'+esc(host(a.source))+'</span><span>'+age+'</span></span></a></li>';
    }).join('') + '</ul>';
  } else if(!edCh){
    h += '<div class="empty">Aucun article en direct pour le moment.<br/><small>Le flux se rafraîchit automatiquement.</small></div>';
  }
  h += '</section>';
  app.innerHTML = h;
}
function host(u){ try{ return new URL(u).hostname.replace(/^www\\./,'') }catch(e){ return u.slice(0,30) } }
function ilY a(d){ const mn = Math.round((Date.now()-d.getTime())/60000); if(mn<60) return 'il y a '+mn+' min'; const h=Math.round(mn/60); if(h<24) return 'il y a '+h+' h'; return 'hier'; }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }

// ---------- Réglages / chapitres ----------
function openSettings(){
  $('#setTheme').value = STATE.theme;
  $('#setRefresh').value = String(STATE.refreshMin);
  $('#dlgSettings').showModal();
}
function openChapters(){
  const list = $('#chapList');
  list.innerHTML = STATE.chapters.map((c,i)=>'<li data-i="'+i+'"><span class="grip" draggable="true">⠿</span><span class="nm">'+c.emoji+' '+esc(c.nom)+'<small>'+c.include.length+' mots-clés</small></span><span class="switch"><input type="checkbox" '+(c.visible?'checked':'')+' data-id="'+c.id+'"/><span class="tr"></span></span></li>').join('');
  $('#dlgChapters').showModal();
}
function saveChapState(){ ls.set(LS.chapterState, STATE.chapters.map(c=>({id:c.id, visible:c.visible})).map((x,i)=>({...x, order:i}))); }

// ---------- Init ----------
async function init(){
  STATE.theme = ls.get(LS.theme,'dark'); STATE.refreshMin = parseInt(ls.get(LS.refresh,'15'));
  applyTheme();
  await loadChapters();
  const cached = restoreFlux();
  await loadEdition(); await saveEditionCache();
  if(cached){ $('#offline').style.display='block'; $('#offlineTime').textContent = STATE.lastRefresh?.toLocaleString('fr-FR')||''; }
  render();
  // rafraîchissement arrière-plan
  refreshFlux().then(()=>{ render(); }).catch(()=>{});
  if(STATE.refreshMin>0){ setInterval(async()=>{ if(document.visibilityState==='visible'){ await refreshFlux(); render(); } }, STATE.refreshMin*60000); }
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && STATE.lastRefresh && Date.now()-STATE.lastRefresh.getTime()>10*60000){ refreshFlux().then(render); } });
}
// wiring
$('#btnRefresh').onclick = async ()=>{ toast('Rafraîchissement…'); await Promise.allSettled([loadEdition(), refreshFlux()]); render(); toast('À jour ✅'); };
$('#btnTheme').onclick = cycleTheme;
$('#btnSettings').onclick = openSettings;
$('#btnChapters').onclick = openChapters;
$('#btnCloseSettings').onclick = ()=>$('#dlgSettings').close();
$('#btnCloseChap').onclick = ()=>{ $('#dlgChapters').close(); render(); };
$('#btnResetChap').onclick = ()=>{ localStorage.removeItem(LS.chapterState); toast('Chapitres réinitialisés'); $('#dlgChapters').close(); init().then(render); };
$('#btnPurge').onclick = ()=>{ [LS.fluxCache,LS.fluxTime].forEach(k=>localStorage.removeItem(k)); toast('Cache purgé 🧹'); };
$('#setTheme').onchange = e=>{ STATE.theme=e.target.value; ls.set(LS.theme,STATE.theme); applyTheme(); };
$('#setRefresh').onchange = e=>{ STATE.refreshMin=parseInt(e.target.value); ls.set(LS.refresh,STATE.refreshMin); toast('Enregistré'); };
$('#chapList').addEventListener('change', e=>{ const id=e.target.dataset.id; if(!id) return; const c=STATE.chapters.find(x=>x.id===id); c.visible=e.target.checked; saveChapState(); });
// drag & drop réordonnancement
let dragEl=null;
$('#chapList').addEventListener('dragstart', e=>{ dragEl = e.target.closest('li'); });
$('#chapList').addEventListener('dragover', e=>{ e.preventDefault(); });
$('#chapList').addEventListener('drop', e=>{ e.preventDefault(); const li = e.target.closest('li'); if(!li||!dragEl||li===dragEl) return; const from=+dragEl.dataset.i, to=+li.dataset.i; const [m]=STATE.chapters.splice(from,1); STATE.chapters.splice(to,0,m); saveChapState(); openChaptersRefresh(); });
function openChaptersRefresh(){ openChapters(); }
window.addEventListener('online', ()=>{ $('#offline').style.display='none'; });
window.addEventListener('offline', ()=>{ $('#offline').style.display='block'; $('#offlineTime').textContent=STATE.lastRefresh?.toLocaleString('fr-FR')||''; });
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
init();
