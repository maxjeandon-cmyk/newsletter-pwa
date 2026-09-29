/* Newsletter PWA — app.js v15 — onglets : Édition du {jour}, Sources, Archives, Articles d’aujourd’hui (+ relais dépêches AFP, bouton « AFP uniquement ») */
/* Récupération des flux : essai direct → relais JSON (rss2json) → relais XML (allorigins, codetabs).
 * Le relais JSON renvoie du JSON (≠ XML) : il est parsé à part. L’AFP n’a pas d’API publique gratuite ;
 * ses dépêches sont suivies via les médias qui les republient (20 Minutes, BFM, France 24, RFI…). */
const PROXIES_XML = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u)
];
const PROXY_JSON = u => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u);
let chaptersCfg = null, edition = null, feedCache = { time: 0, articles: [] }, feedStats = { ok: 0, total: 0 }, activeTab = 'edition';
let archiveIdx = null, archiveSel = null, archiveMonth = null;
let weeksIdx = null;

const $ = s => document.querySelector(s);
const fmtDate = iso => new Date(iso + 'T09:00:00+02:00').toLocaleDateString('fr-FR',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateHour = iso => new Date(iso).toLocaleString('fr-FR',
  { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fmtMonth = ym => new Date(ym + '-01T12:00:00').toLocaleDateString('fr-FR',
  { month: 'long', year: 'numeric' });

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const nomJourEdition = () => edition?.date ? JOURS[new Date(edition.date + 'T12:00:00').getDay()] : 'jour';

function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const year = dt.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((dt - jan1) / 86400000 + 1) / 7);
  return { year, week };
}
function weekKeyOf(dateStr) {
  const w = isoWeek(new Date(dateStr + 'T12:00:00'));
  return w.year + '-S' + String(w.week).padStart(2, '0');
}

function getStore(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }
function setStore(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function parseRss2Json(text) {
  try {
    const j = JSON.parse(text);
    if (j.status !== 'ok' || !Array.isArray(j.items)) return [];
    return j.items.map(x => ({
      titre: (x.title || '').trim(),
      lien: (x.link || '').trim(),
      date: new Date(String(x.pubDate || '').replace(' ', 'T') + 'Z'),
      extrait: (x.description || '').replace(/<[^>]*>/g, '').trim().slice(0, 220),
      auteur: (x.author || '').trim()
    })).filter(a => a.titre && !isNaN(a.date));
  } catch (e) { return []; }
}

async function fetchFeedItems(url, timeout = 7000) {
  // 1) essai direct (certains flux autorisent CORS)
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) {
      const txt = await r.text();
      if (/<(rss|feed|item|entry)/i.test(txt.slice(0, 2000))) {
        const arts = parseFeed(txt);
        if (arts.length) return arts;
      }
    }
  } catch (e) { /* CORS ou échec : on passe aux relais */ }
  // 2) relais JSON (rapide et fiable, ~10 derniers items par flux)
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(PROXY_JSON(url), { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) {
      const arts = parseRss2Json(await r.text());
      if (arts.length) return arts;
    }
  } catch (e) { /* relais suivant */ }
  // 3) relais XML (plus riches — jusqu’à 40 items — mais parfois lents)
  for (const p of PROXIES_XML) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      const r = await fetch(p(url), { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const txt = await r.text();
      if (/<(rss|feed)/i.test(txt.slice(0, 500))) {
        const arts = parseFeed(txt);
        if (arts.length) return arts;
      }
    } catch (e) { /* relais suivant */ }
  }
  return [];
}

function parseFeed(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const items = [...doc.querySelectorAll('item')].length
      ? [...doc.querySelectorAll('item')]
      : [...doc.querySelectorAll('entry')];
    return items.slice(0, 40).map(it => ({
      titre: it.querySelector('title')?.textContent?.trim() ?? '',
      lien: it.querySelector('link')?.textContent?.trim() || it.querySelector('link')?.getAttribute('href') || '',
      date: new Date(it.querySelector('pubDate, published, updated')?.textContent ?? Date.now()),
      extrait: (it.querySelector('description, summary, content')?.textContent ?? '')
        .replace(/<[^>]*>/g, '').trim().slice(0, 220),
      auteur: it.querySelector('author')?.textContent?.trim()
        || it.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator')[0]?.textContent?.trim()
        || ''
    })).filter(a => a.titre && !isNaN(a.date));
  } catch (e) { return []; }
}

const norm = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function estAFP(a) {
  return a.chapitreId === 'depeches-afp'
    || /\bAFP\b/i.test((a.auteur || '') + ' ' + a.titre + ' ' + (a.extrait || ''));
}
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
  const visible = chaptersCfg.filter(c => !c.masque && c.flux.length);
  // Déduplication : un même flux partagé par plusieurs chapitres n'est récupéré qu'une seule fois
  const parUrl = new Map();
  for (const ch of visible) for (const url of ch.flux) {
    if (!parUrl.has(url)) parUrl.set(url, []);
    parUrl.get(url).push(ch);
  }
  const urls = [...parUrl.keys()];
  const results = await Promise.allSettled(urls.map(u => fetchFeedItems(u)));
  const all = [];
  let fluxOk = 0;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value || !r.value.length) return;
    fluxOk++;
    for (const ch of parUrl.get(urls[i])) {
      for (const a of r.value) {
        const fenetre = (ch.fenetreHeures ?? 24) * 3600e3;
        if (Date.now() - a.date.getTime() > fenetre) continue;
        if (scoreArticle(a, ch) < 1) continue;
        if (all.some(x => jaccard(x.titre, a.titre) >= 0.7)) continue;
        all.push({ ...a, chapitreId: ch.id, chapitreNom: ch.nom });
      }
    }
  });
  all.sort((a, b) => b.date - a.date);
  feedCache = { time: Date.now(), articles: all.slice(0, 200) };
  feedStats = { ok: fluxOk, total: urls.length, time: Date.now() };
  setStore('feedCache', feedCache);
  return feedCache;
}

function generationTime() {
  return edition?.genere_le ? new Date(edition.genere_le).getTime() : Date.now() - 24 * 3600e3;
}

function renderTabs() {
  const tabs = [
    { id: 'edition', nom: 'Édition du ' + nomJourEdition(), emoji: '📬' },
    { id: 'sources', nom: 'Sources', emoji: '📚' },
    { id: 'archives', nom: 'Archives', emoji: '🗄️' },
    { id: 'articles', nom: 'Articles d’aujourd’hui', emoji: '🔥' }
  ];
  $('#tabs').innerHTML = tabs.map(t =>
    '<button class="tab' + (t.id === activeTab ? ' active' : '') + '" data-id="' + t.id + '">' +
    t.emoji + ' ' + t.nom + '</button>').join('');
  [...document.querySelectorAll('.tab')].forEach(b =>
    b.onclick = () => { activeTab = b.dataset.id; renderTabs(); renderView(); window.scrollTo(0, 0); });
}

function articleHtml(a) {
  const age = Math.max(0, Math.round((Date.now() - a.date.getTime()) / 3600e3));
  return '<a class="article" href="' + (a.lien || '#') + '" target="_blank" rel="noopener">' +
    '<h3>' + a.titre + '</h3><div class="meta">' + a.chapitreNom + ' · il y a ' +
    (age < 1 ? 'moins d’1 h' : age + ' h') + '</div>' +
    (a.extrait ? '<div class="excerpt">' + a.extrait + '</div>' : '') + '</a>';
}

function openArchive(html) {
  archiveSel = html; renderView(); window.scrollTo(0, 0);
}

function renderView() {
  const view = $('#view');

  // --- Édition du jour de la semaine : la plus récente édition publiée ---
  if (activeTab === 'edition') {
    if (!edition) { view.innerHTML = '<div class="empty">Aucune édition disponible pour l’instant.</div>'; return; }
    view.innerHTML =
      '<div class="summary-card"><h2>📬 Édition du ' + nomJourEdition() + ' — ' + fmtDate(edition.date) + '</h2>' +
      '<ol>' + edition.resume_executif.map(p => '<li>' + p + '</li>').join('') + '</ol></div>' +
      '<iframe class="edition-frame" src="' + edition.html + '" title="Newsletter du ' + nomJourEdition() + '"></iframe>';
    return;
  }

  if (activeTab === 'sources') {
    if (!edition?.sources?.length) { view.innerHTML = '<div class="empty">Sources indisponibles.</div>'; return; }
    view.innerHTML =
      '<div class="summary-card"><h2>📚 Toutes les sources de l’édition — ' + fmtDate(edition.date) + '</h2>' +
      '<p class="meta-count">' + edition.sources.length + ' sources · fiabilité sur 5</p></div>' +
      '<table class="sources-table"><tr><th>Source</th><th>Fiabilité</th><th>MàJ</th></tr>' +
      edition.sources.map(s => {
        const estLien = /^https?:\/\//.test(s.ref || '');
        const label = estLien
          ? '<a href="' + s.ref + '" target="_blank" rel="noopener">' + s.label + '</a>'
          : s.label;
        return '<tr><td>' + label + (s.ref ? '<div class="src-ref">' + s.ref + '</div>' : '') + '</td>' +
          '<td>' + s.fiabilite + '</td><td>' + s.maj + '</td></tr>';
      }).join('') +
      '</table>';
    return;
  }

  // --- Archives : vue mensuelle (semaines + éditions quotidiennes) ---
  if (activeTab === 'archives') {
    if (archiveSel) {
      view.innerHTML =
        '<button class="back-btn" id="btn-back-archives">← Retour aux archives</button>' +
        '<iframe class="edition-frame" src="' + archiveSel + '" title="Newsletter archivée"></iframe>';
      $('#btn-back-archives').onclick = () => { archiveSel = null; renderView(); window.scrollTo(0, 0); };
      return;
    }
    if (!archiveIdx?.length) { view.innerHTML = '<div class="empty">Aucune archive disponible pour l’instant — la première édition date d’aujourd’hui. Les jours et semaines passés s’y accumuleront tout seuls. 🌱</div>'; return; }

    const months = [...new Set(archiveIdx.map(e => e.date.slice(0, 7)))].sort().reverse();
    const cur = archiveMonth && months.includes(archiveMonth) ? archiveMonth : months[0];
    const monthEds = archiveIdx.filter(e => e.date.startsWith(cur)).sort((a, b) => a.date.localeCompare(b.date));
    const weeks = weeksIdx?.semaines || [];

    const groups = [];
    for (const e of monthEds) {
      const k = weekKeyOf(e.date);
      let g = groups.find(x => x.k === k);
      if (!g) { g = { k, days: [] }; groups.push(g); }
      g.days.push(e);
    }

    view.innerHTML =
      '<div class="summary-card"><h2>🗄️ Archives — ' + fmtMonth(cur) + '</h2>' +
      '<p class="meta-count">' + monthEds.length + ' édition(s) quotidienne(s) · ' + groups.length + ' semaine(s) — historique intégral.</p>' +
      '<select id="sel-month" class="month-select">' +
      months.map(m => '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + fmtMonth(m) + '</option>').join('') +
      '</select></div>' +
      groups.map(g => {
        const w = weeks.find(x => x.semaine === g.k);
        return (w ? '<div class="archive-item week" data-w="' + g.k + '">' +
          '<span class="date">📰 Récap de la semaine ' + g.k + '</span><span class="open">Ouvrir →</span></div>' : '') +
          g.days.map(e =>
            '<div class="archive-item' + (edition && e.date === edition.date ? ' today' : '') + '" data-d="' + e.date + '">' +
            '<span class="date">' + fmtDate(e.date) + '</span>' +
            (edition && e.date === edition.date ? '<span class="badge">Édition du jour</span>' : '') +
            '<span class="open">Ouvrir →</span></div>').join('');
      }).join('');

    $('#sel-month').onchange = ev => { archiveMonth = ev.target.value; renderView(); };
    groups.forEach(g => {
      const w = weeks.find(x => x.semaine === g.k);
      if (w) {
        const el = document.querySelector('.archive-item[data-w="' + g.k + '"]');
        if (el) el.onclick = () => openArchive(w.html);
      }
      g.days.forEach(e => {
        const el = document.querySelector('.archive-item[data-d="' + e.date + '"]');
        if (el) el.onclick = () => openArchive(e.html);
      });
    });
    return;
  }

  // --- Articles d’aujourd’hui : tous les articles parus après la génération, toutes rubriques ---
  if (activeTab === 'articles') {
    const gen = generationTime();
    const tous = (feedCache.articles || []).filter(a => a.date.getTime() > gen);
    const afpOnly = getStore('afpOnly', false);
    const arts = afpOnly ? tous.filter(estAFP) : tous;
    view.innerHTML =
      '<div class="chapter-resume"><h2>🔥 Articles d’aujourd’hui</h2>' +
      '<p class="meta-count">Articles parus après la génération de l’édition (' + fmtDateHour(edition?.genere_le ?? new Date().toISOString()) + ') · toutes rubriques confondues · ' + feedStats.ok + '/' + feedStats.total + ' flux actifs. L’essentiel du jour est dans l’Édition.</p>' +
      '<button class="filter-btn' + (afpOnly ? ' active' : '') + '" id="btn-afp">📡 Dépêches AFP uniquement</button></div>' +
      (arts.length ? arts.map(articleHtml).join('')
        : '<div class="empty">' + (afpOnly
          ? 'Aucune dépêche AFP repérée depuis la génération de l’édition pour l’instant — retente dans un instant. 🌱'
          : 'Rien de neuf depuis la génération de l’édition — c’est plutôt bon signe. 🌙') + '</div>');
    const bAfp = $('#btn-afp');
    if (bAfp) bAfp.onclick = () => { setStore('afpOnly', !afpOnly); renderView(); };
    return;
  }

  // Onglet inconnu (état résiduel) : retour à l’édition
  activeTab = 'edition';
  renderView();
}

function renderChaptersEditor() {
  $('#chapters-editor').innerHTML = chaptersCfg.map((c, i) => ({ c, i }))
    .filter(x => x.c.flux.length)
    .map(({ c, i }) =>
    '<li><span>' + c.emoji + '</span><span class="name">' + c.nom + '</span>' +
    '<label style="margin:0"><input type="checkbox" data-i="' + i + '"' + (c.masque ? '' : ' checked') + '> suivi</label></li>'
  ).join('');
  [...document.querySelectorAll('#chapters-editor input')].forEach(cb =>
    cb.onchange = () => {
      chaptersCfg[cb.dataset.i].masque = !cb.checked;
      setStore('chapters', chaptersCfg); renderTabs(); renderView();
    });
}

function applyTheme(t) {
  document.documentElement.dataset.theme =
    t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}

async function loadEdition() {
  try {
    const idx = await (await fetch('editions/latest.json', { cache: 'no-store' })).json();
    archiveIdx = idx.editions || [];
    edition = await (await fetch(idx.editions[0].fichier, { cache: 'no-store' })).json();
    $('#edition-date').textContent = '· ' + fmtDate(edition.date);
  } catch (e) { edition = null; }
  try {
    weeksIdx = await (await fetch('editions/semaines/index.json', { cache: 'no-store' })).json();
  } catch (e) { weeksIdx = null; }
}

async function init() {
  const theme = getStore('theme', 'dark');
  applyTheme(theme);
  $('#sel-theme').value = theme;
  $('#sel-theme').onchange = e => { setStore('theme', e.target.value); applyTheme(e.target.value); };

  $('#btn-refresh').onclick = async () => {
    $('#stale-banner').hidden = false;
    $('#stale-banner').textContent = 'Actualisation en cours…';
    await refreshFeed();
    $('#stale-banner').hidden = true;
    renderView();
  };
  $('#btn-settings').onclick = () => { $('#settings-panel').removeAttribute('hidden'); $('#settings-panel').classList.add('open'); };
  $('#btn-close-settings').onclick = () => { $('#settings-panel').classList.remove('open'); };
  $('#settings-panel').onclick = e => { if (e.target.id === 'settings-panel') $('#settings-panel').classList.remove('open'); };
  $('#btn-install-hint').onclick = () => alert('Sur iPhone : bouton Partager ⬆️ en bas de Safari, puis « Sur l’écran d’accueil ». L’app s’ouvrira plein écran, comme une vraie app.');
  $('#btn-purge').onclick = () => { localStorage.removeItem('feedCache'); feedCache = { time: 0, articles: [] }; renderView(); };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  feedCache = getStore('feedCache', { time: 0, articles: [] });
  renderView();

  const def = await (await fetch('chapters.json')).json();
  // Migration : si la config en cache locale est plus ancienne que celle du dépôt, on l’adopte
  const VCFG = 2;
  let stored = getStore('chapters', null);
  if (!stored || getStore('chaptersV', 0) < VCFG) {
    stored = def; setStore('chapters', def); setStore('chaptersV', VCFG);
  }
  chaptersCfg = stored;
  $('#btn-reset-chapters').onclick = () => { setStore('chapters', def); chaptersCfg = def; renderTabs(); renderChaptersEditor(); };
  renderTabs(); renderChaptersEditor();
  renderView();

  await loadEdition();
  renderTabs(); renderView();

  $('#stale-banner').hidden = false;
  $('#stale-banner').textContent = 'Flux chaud en cours de récupération…';
  refreshFeed().then(() => { $('#stale-banner').hidden = true; renderView(); })
    .catch(() => { $('#stale-banner').hidden = true; });

  setInterval(() => {
    // Actualisation du flux chaud uniquement quand l’onglet Articles est ouvert,
    // la page visible, et le cache de plus de 20 minutes (économie des relais).
    if (document.visibilityState === 'visible' && activeTab === 'articles'
      && Date.now() - feedCache.time > 20 * 60e3) {
      refreshFeed().then(renderView).catch(() => {});
    }
  }, 5 * 60 * 1000);
}
init();