/* Newsletter PWA — app.js v9 */
const PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u)
];
let chaptersCfg = null, edition = null, feedCache = { time: 0, articles: [] }, activeTab = 'edition';
let archiveIdx = null, archiveSel = null, archiveMonth = null;
let weekData = null, weeksIdx = null;

const $ = s => document.querySelector(s);
const fmtDate = iso => new Date(iso + 'T09:00:00+02:00').toLocaleDateString('fr-FR',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateHour = iso => new Date(iso).toLocaleString('fr-FR',
  { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fmtMonth = ym => new Date(ym + '-01T12:00:00').toLocaleDateString('fr-FR',
  { month: 'long', year: 'numeric' });

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

async function fetchWithFallback(url, timeout = 10000) {
  for (const p of PROXIES) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      const r = await fetch(p(url), { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) {
        const txt = await r.text();
        if (txt && txt.length > 50) return txt;
      }
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
    return items.slice(0, 40).map(it => ({
      titre: it.querySelector('title')?.textContent?.trim() ?? '',
      lien: it.querySelector('link')?.textContent?.trim() || it.querySelector('link')?.getAttribute('href') || '',
      date: new Date(it.querySelector('pubDate, published, updated')?.textContent ?? Date.now()),
      extrait: (it.querySelector('description, summary, content')?.textContent ?? '')
        .replace(/<[^>]*>/g, '').trim().slice(0, 220)
    })).filter(a => a.titre && !isNaN(a.date));
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
  const visible = chaptersCfg.filter(c => !c.masque && c.flux.length);
  const jobs = [];
  for (const ch of visible) for (const url of ch.flux) jobs.push({ ch, url });
  const results = await Promise.allSettled(jobs.map(j => fetchWithFallback(j.url)));
  const all = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value) return;
    const ch = jobs[i].ch;
    for (const a of parseFeed(r.value)) {
      const fenetre = (ch.fenetreHeures ?? 24) * 3600e3;
      if (Date.now() - a.date.getTime() > fenetre) continue;
      if (scoreArticle(a, ch) < 1) continue;
      if (all.some(x => jaccard(x.titre, a.titre) >= 0.7)) continue;
      all.push({ ...a, chapitreId: ch.id, chapitreNom: ch.nom });
    }
  });
  all.sort((a, b) => b.date - a.date);
  feedCache = { time: Date.now(), articles: all.slice(0, 200) };
  setStore('feedCache', feedCache);
  return feedCache;
}

function generationTime() {
  return edition?.genere_le ? new Date(edition.genere_le).getTime() : Date.now() - 24 * 3600e3;
}

function renderTabs() {
  const tabs = [
    { id: 'edition', nom: 'Édition du jour', emoji: '📬' },
    { id: 'sources', nom: 'Sources', emoji: '📚' },
    { id: 'archives', nom: 'Archives', emoji: '🗄️' },
    ...chaptersCfg.filter(c => !c.masque).map(c => ({ id: c.id, nom: c.nom, emoji: c.emoji }))
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

  if (activeTab === 'edition') {
    if (!edition) { view.innerHTML = '<div class="empty">Aucune édition disponible pour l’instant.</div>'; return; }
    view.innerHTML =
      '<div class="summary-card"><h2>Édition complète — ' + fmtDate(edition.date) + '</h2>' +
      '<ol>' + edition.resume_executif.map(p => '<li>' + p + '</li>').join('') + '</ol></div>' +
      '<iframe class="edition-frame" src="' + edition.html + '" title="Newsletter complète"></iframe>';
    return;
  }

  if (activeTab === 'sources') {
    if (!edition?.sources?.length) { view.innerHTML = '<div class="empty">Sources indisponibles.</div>'; return; }
    view.innerHTML =
      '<div class="summary-card"><h2>📚 Toutes les sources de l’édition — ' + fmtDate(edition.date) + '</h2>' +
      '<p class="meta-count">' + edition.sources.length + ' sources · fiabilité sur 5</p></div>' +
      '<table class="sources-table"><tr><th>Source</th><th>Fiabilité</th><th>MàJ</th></tr>' +
      edition.sources.map(s =>
        '<tr><td>' + s.label + '<div class="src-ref">' + s.ref + '</div></td>' +
        '<td>' + s.fiabilite + '</td><td>' + s.maj + '</td></tr>').join('') +
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

  // --- Grande info de la semaine : essentiel de chaque journée, lundi → dimanche ---
  if (activeTab === 'grande-info-semaine') {
    if (!weekData) {
      view.innerHTML = '<div class="empty">Le récapitulatif de la semaine en cours n’est pas encore disponible — il s’étoffera au fil des éditions quotidiennes. 🌱</div>';
      return;
    }
    const jours = weekData.jours || [];
    view.innerHTML =
      '<div class="summary-card"><h2>📰 L’essentiel de la semaine — du ' + fmtDate(weekData.lundi) + ' au dimanche</h2>' +
      '<p class="meta-count">' + jours.length + ' journée(s) résumée(s), du lundi au dimanche.</p></div>' +
      (jours.length ? jours.map(j =>
        '<div class="chapter-resume"><h2>' + j.jour.charAt(0).toUpperCase() + j.jour.slice(1) + (j.date ? ' — ' + fmtDate(j.date) : '') + '</h2>' +
        '<p>' + j.essentiel + '</p></div>').join('')
        : '<div class="empty">La semaine commence lundi — le récap s’écrit au fil des jours. 🌙</div>');
    return;
  }

  const gen = generationTime();
  const ch = chaptersCfg.find(c => c.id === activeTab);
  const arts = (feedCache.articles || []).filter(a => a.chapitreId === activeTab && a.date.getTime() > gen);
  view.innerHTML =
    '<div class="chapter-resume"><h2>' + (ch?.emoji ?? '') + ' ' + (ch?.nom ?? '') + '</h2>' +
    '<p class="meta-count">Articles parus après la génération de l’édition (' + fmtDateHour(edition?.genere_le ?? new Date().toISOString()) + '). L’essentiel du chapitre est dans l’Édition du jour.</p></div>' +
    (arts.length ? arts.map(articleHtml).join('')
      : '<div class="empty">Rien de neuf depuis l’édition de ce matin dans ce chapitre — c’est plutôt bon signe. 🌙</div>');
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
  const w = isoWeek(new Date());
  try {
    weekData = await (await fetch('editions/semaines/' + w.year + '-S' + String(w.week).padStart(2, '0') + '.json', { cache: 'no-store' })).json();
  } catch (e) { weekData = null; }
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
  chaptersCfg = getStore('chapters', def);
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
    if (document.visibilityState === 'visible') refreshFeed().then(renderView).catch(() => {});
  }, 15 * 60 * 1000);
}
init();