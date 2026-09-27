/* Newsletter PWA — app.js */
const PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u)
];
const DEFAULT_CHAPTERS = null; // chargé depuis chapters.json
let chaptersCfg = null, edition = null, feedCache = {}, activeTab = 'edition';

const $ = s => document.querySelector(s);
const fmtDate = iso => new Date(iso + 'T09:00:00+02:00').toLocaleDateString('fr-FR',
  { weekday:'long', day:'numeric', month:'long', year:'numeric' });

function getStore(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch(e){ return d; } }
function setStore(k, v){ localStorage.setItem(k, JSON.stringify(v)); }

async function fetchWithFallback(url, timeout = 10000) {
  for (const p of PROXIES) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      const r = await fetch(p(url), { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) return await r.text();
    } catch (e) { /* proxy suivant */ }
  }
  return null;
}

function parseFeed(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const items = [...doc.querySelectorAll('item')].length
      ? [...doc.querySelectorAll('item')]
      : [...doc.querySelectorAll('entry')];
    return items.slice(0, 30).map(it => ({
      titre: it.querySelector('title')?.textContent?.trim() ?? '',
      lien: it.querySelector('link')?.textContent?.trim() || it.querySelector('link')?.getAttribute('href') || '',
      date: new Date(it.querySelector('pubDate, published, updated')?.textContent ?? Date.now()),
      extrait: (it.querySelector('description, summary, content')?.textContent ?? '')
        .replace(/<[^>]*>/g, '').trim().slice(0, 220)
    })).filter(a => a.titre && a.date);
  } catch (e) { return []; }
}

const norm = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function scoreArticle(a, ch) {
  const t = norm(a.titre + ' ' + a.extrait);
  if ((ch.motsCles || []).includes('*')) return 1;
  let s = 0;
  for (const m of ch.motsCles || []) if (t.includes(norm(m))) s++;
  for (const m of ch.exclusion || []) if (t.includes(norm(m))) return 0;
  return s;
}
function jaccard(a, b) {
  const A = new Set(norm(a).split(/[^a-z0-9]+/).filter(w => w.length > 2));
  const B = new Set(norm(b).split(/[^a-z0-9]+/).filter(w => w.length > 2));
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

async function refreshFeed() {
  const visible = chaptersCfg.filter(c => !c.masque);
  const all = [];
  for (const ch of visible) {
    for (const url of ch.flux) {
      const txt = await fetchWithFallback(url);
      if (!txt) continue;
      for (const a of parseFeed(txt)) {
        const fenetre = (ch.fenetreHeures ?? 24) * 3600e3;
        if (Date.now() - a.date.getTime() > fenetre) continue;
        if (scoreArticle(a, ch) < 1) continue;
        if (all.some(x => jaccard(x.titre, a.titre) >= 0.7)) continue;
        all.push({ ...a, chapitreId: ch.id, chapitreNom: ch.nom });
      }
    }
  }
  all.sort((a, b) => b.date - a.date);
  feedCache = { time: Date.now(), articles: all.slice(0, 200) };
  setStore('feedCache', feedCache);
  return feedCache;
}

function renderTabs() {
  const tabs = [{ id:'edition', nom:'Édition du jour', emoji:'📬' },
    ...chaptersCfg.filter(c => !c.masque).map(c => ({ id:c.id, nom:c.nom, emoji:c.emoji }))];
  $('#tabs').innerHTML = tabs.map(t =>
    '<button class="tab' + (t.id === activeTab ? ' active' : '') + '" data-id="' + t.id + '">' +
    t.emoji + ' ' + t.nom + '</button>').join('');
  [...document.querySelectorAll('.tab')].forEach(b =>
    b.onclick = () => { activeTab = b.dataset.id; renderTabs(); renderView(); window.scrollTo(0,0); });
}

function articleHtml(a) {
  const age = Math.round((Date.now() - a.date.getTime()) / 3600e3);
  return '<a class="article" href="' + (a.lien || '#') + '" target="_blank" rel="noopener">' +
    '<h3>' + a.titre + '</h3><div class="meta">' + a.chapitreNom + ' · il y a ' +
    (age < 1 ? 'moins d’1 h' : age + ' h') + '</div>' +
    (a.extrait ? '<div class="excerpt">' + a.extrait + '</div>' : '') + '</a>';
}

function renderView() {
  const view = $('#view');
  if (activeTab === 'edition') {
    if (!edition) { view.innerHTML = '<div class="empty">Aucune édition disponible pour l’instant.</div>'; return; }
    const chapterBlocks = edition.chapitres.map(c =>
      '<div class="chapter-resume"><h2>' + c.emoji + ' ' + c.nom + '</h2><p>' + c.resume + '</p></div>'
    ).join('');
    view.innerHTML =
      '<div class="summary-card"><h2>L’essentiel en 5 points — ' + fmtDate(edition.date) + '</h2><ol>' +
      edition.resume_executif.map(p => '<li>' + p + '</li>').join('') + '</ol></div>' + chapterBlocks;
    return;
  }
  const arts = (feedCache.articles || []).filter(a => a.chapitreId === activeTab);
  view.innerHTML = arts.length
    ? arts.map(articleHtml).join('')
    : '<div class="empty">Pas d’article récent dans ce chapitre — la veille continue. Réessayez après actualisation.</div>';
}

function renderChaptersEditor() {
  $('#chapters-editor').innerHTML = chaptersCfg.map((c, i) =>
    '<li><span>' + c.emoji + '</span><span class="name">' + c.nom + '</span>' +
    '<label style="margin:0"><input type="checkbox" data-i="' + i + '"' + (c.masque ? '' : ' checked') + '> visible</label></li>'
  ).join('');
  [...document.querySelectorAll('#chapters-editor input')].forEach(cb =>
    cb.onchange = () => {
      chaptersCfg[cb.dataset.i].masque = !cb.checked;
      setStore('chapters', chaptersCfg); renderTabs(); renderView();
    });
}

async function init() {
  // Thème
  const theme = getStore('theme', 'dark');
  const applyTheme = t => document.documentElement.dataset.theme =
    t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
  applyTheme(theme);
  $('#sel-theme').value = theme;
  $('#sel-theme').onchange = e => { setStore('theme', e.target.value); applyTheme(e.target.value); };

  // Chapitres
  const def = await (await fetch('chapters.json')).json();
  chaptersCfg = getStore('chapters', def);
  renderTabs(); renderChaptersEditor();
  $('#btn-reset-chapters').onclick = () => { setStore('chapters', def); chaptersCfg = def; renderTabs(); renderChaptersEditor(); };
  $('#btn-purge').onclick = () => { localStorage.removeItem('feedCache'); feedCache = {}; renderView(); };

  // Édition du jour
  try {
    const idx = await (await fetch('editions/latest.json', { cache:'no-store' })).json();
    edition = await (await fetch(idx.editions[0].fichier, { cache:'no-store' })).json();
    $('#edition-date').textContent = '· ' + fmtDate(edition.date);
  } catch (e) { edition = null; }
  renderView();

  // Flux chaud : cache instantané puis rafraîchissement
  feedCache = getStore('feedCache', { time: 0, articles: [] });
  renderView();
  const stale = Date.now() - feedCache.time > 24 * 3600e3 || !feedCache.articles.length;
  $('#stale-banner').hidden = !stale || feedCache.articles.length > 0;
  if (stale) $('#stale-banner').textContent = 'Flux chaud en cours de récupération…';
  await refreshFeed();
  $('#stale-banner').hidden = true;
  if (activeTab !== 'edition') renderView();

  setInterval(() => { if (document.visibilityState === 'visible') refreshFeed().then(renderView); }, 15 * 60 * 1000);
  $('#btn-refresh').onclick = async () => { await refreshFeed(); renderView(); };

  // Réglages
  $('#btn-settings').onclick = () => { $('#settings-panel').hidden = false; };
  $('#btn-close-settings').onclick = () => { $('#settings-panel').hidden = true; };
  $('#btn-install-hint').onclick = () => alert('Sur iPhone : bouton Partager ⬆️ en bas de Safari, puis « Sur l’écran d’accueil ». L’app s’ouvrira plein écran, comme une vraie app.');

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}
init();