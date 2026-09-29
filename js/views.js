/* views.js — rendu des onglets (v16). Chaque onglet a sa fonction vue*(), appelée par renderView().
 * Règle d'hygiène : tout texte externe (flux RSS, éditions) passe par esc() avant innerHTML. */

import { $, state, esc, getStore, setStore, fmtDate, fmtDateHour, fmtHeure, fmtMonth, nomJourEdition, weekKeyOf }
  from './core.js';
import { estAFP, chargerMedia, chargerChapitres } from './feeds.js';

const TABS = () => [
  { id: 'edition', nom: 'Édition du ' + nomJourEdition(), emoji: '📬' },
  { id: 'sources', nom: 'Sources', emoji: '📚' },
  { id: 'archives', nom: 'Archives', emoji: '🗄️' },
  { id: 'articles', nom: 'Articles d’aujourd’hui', emoji: '🔥' },
  { id: 'medias', nom: 'Médias', emoji: '🎬' }
];

export function renderTabs() {
  $('#tabs').innerHTML = TABS().map(t =>
    '<button class="tab' + (t.id === state.activeTab ? ' active' : '') + '" data-id="' + t.id + '">' +
    t.emoji + ' ' + esc(t.nom) + '</button>').join('');
  [...document.querySelectorAll('.tab')].forEach(b =>
    b.onclick = () => { state.activeTab = b.dataset.id; renderTabs(); renderView(); window.scrollTo(0, 0); });
}

/* --- Bloc article commun (onglets Articles et Médias) --- */
function articleHtml(a) {
  const age = Math.max(0, Math.round((Date.now() - a.date.getTime()) / 3600e3));
  const origine = a.chapitreNom || a.mediaNom || '';
  return '<a class="article" href="' + esc(a.lien || '#') + '" target="_blank" rel="noopener">' +
    '<h3>' + esc(a.titre) + '</h3><div class="meta">' + esc(origine) + ' · il y a ' +
    (age < 1 ? 'moins d’1 h' : age + ' h') + '</div>' +
    (a.extrait ? '<div class="excerpt">' + esc(a.extrait) + '</div>' : '') + '</a>';
}

function generationTime() {
  return state.edition?.genere_le ? new Date(state.edition.genere_le).getTime() : Date.now() - 24 * 3600e3;
}

export function renderView() {
  const vues = { edition: vueEdition, sources: vueSources, archives: vueArchives, articles: vueArticles, medias: vueMedias };
  const vue = vues[state.activeTab] || vueEdition;
  if (!vues[state.activeTab]) state.activeTab = 'edition'; // état résiduel
  vue();
}

/* --- 📬 Édition du jour --- */
function vueEdition() {
  const view = $('#view');
  if (!state.edition) { view.innerHTML = '<div class="empty">Aucune édition disponible pour l’instant.</div>'; return; }
  view.innerHTML =
    '<div class="summary-card"><h2>📬 Édition du ' + esc(nomJourEdition()) + ' — ' + esc(fmtDate(state.edition.date)) + '</h2>' +
    '<ol>' + (state.edition.resume_executif || []).map(p => '<li>' + esc(p) + '</li>').join('') + '</ol></div>' +
    '<iframe class="edition-frame" src="' + esc(state.edition.html) + '" title="Newsletter du ' + esc(nomJourEdition()) + '"></iframe>';
}

/* --- 📚 Sources de l'édition --- */
function vueSources() {
  const view = $('#view');
  const src = state.edition?.sources || [];
  if (!src.length) { view.innerHTML = '<div class="empty">Sources indisponibles.</div>'; return; }
  view.innerHTML =
    '<div class="summary-card"><h2>📚 Toutes les sources de l’édition — ' + esc(fmtDate(state.edition.date)) + '</h2>' +
    '<p class="meta-count">' + src.length + ' sources · fiabilité sur 5</p></div>' +
    '<table class="sources-table"><tr><th>Source</th><th>Fiabilité</th><th>MàJ</th></tr>' +
    src.map(s => {
      const estLien = /^https?:\/\//.test(s.ref || '');
      const label = estLien
        ? '<a href="' + esc(s.ref) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>'
        : esc(s.label);
      return '<tr><td>' + label + (s.ref ? '<div class="src-ref">' + esc(s.ref) + '</div>' : '') + '</td>' +
        '<td>' + esc(s.fiabilite) + '</td><td>' + esc(s.maj) + '</td></tr>';
    }).join('') +
    '</table>';
}

/* --- 🗄️ Archives : vue mensuelle (récaps hebdo + éditions quotidiennes) --- */
function openArchive(html) {
  state.archiveSel = html; renderView(); window.scrollTo(0, 0);
}

function vueArchives() {
  const view = $('#view');
  if (state.archiveSel) {
    view.innerHTML =
      '<button class="back-btn" id="btn-back-archives">← Retour aux archives</button>' +
      '<iframe class="edition-frame" src="' + esc(state.archiveSel) + '" title="Newsletter archivée"></iframe>';
    $('#btn-back-archives').onclick = () => { state.archiveSel = null; renderView(); window.scrollTo(0, 0); };
    return;
  }
  if (!state.archiveIdx?.length) {
    view.innerHTML = '<div class="empty">Aucune archive disponible pour l’instant — la première édition date d’aujourd’hui. Les jours et semaines passés s’y accumuleront tout seuls. 🌱</div>';
    return;
  }

  const months = [...new Set(state.archiveIdx.map(e => e.date.slice(0, 7)))].sort().reverse();
  const cur = state.archiveMonth && months.includes(state.archiveMonth) ? state.archiveMonth : months[0];
  const monthEds = state.archiveIdx.filter(e => e.date.startsWith(cur)).sort((a, b) => a.date.localeCompare(b.date));
  const weeks = state.weeksIdx?.semaines || [];

  const groups = [];
  for (const e of monthEds) {
    const k = weekKeyOf(e.date);
    let g = groups.find(x => x.k === k);
    if (!g) { g = { k, days: [] }; groups.push(g); }
    g.days.push(e);
  }

  view.innerHTML =
    '<div class="summary-card"><h2>🗄️ Archives — ' + esc(fmtMonth(cur)) + '</h2>' +
    '<p class="meta-count">' + monthEds.length + ' édition(s) quotidienne(s) · ' + groups.length + ' semaine(s) — historique intégral.</p>' +
    '<select id="sel-month" class="month-select">' +
    months.map(m => '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + esc(fmtMonth(m)) + '</option>').join('') +
    '</select></div>' +
    groups.map(g => {
      const w = weeks.find(x => x.semaine === g.k);
      return (w ? '<div class="archive-item week" data-w="' + g.k + '">' +
        '<span class="date">📰 Récap de la semaine ' + g.k + '</span><span class="open">Ouvrir →</span></div>' : '') +
        g.days.map(e =>
          '<div class="archive-item' + (state.edition && e.date === state.edition.date ? ' today' : '') + '" data-d="' + e.date + '">' +
          '<span class="date">' + esc(fmtDate(e.date)) + '</span>' +
          (state.edition && e.date === state.edition.date ? '<span class="badge">Édition du jour</span>' : '') +
          '<span class="open">Ouvrir →</span></div>').join('');
    }).join('');

  $('#sel-month').onchange = ev => { state.archiveMonth = ev.target.value; renderView(); };
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
}

/* --- 🔥 Articles d'aujourd'hui : parus après la génération de l'édition --- */
function vueArticles() {
  const view = $('#view');
  const gen = generationTime();
  const tous = (state.feed.articles || []).filter(a => a.date.getTime() > gen);
  const afpOnly = getStore('afpOnly', false);
  const arts = afpOnly ? tous.filter(estAFP) : tous;
  view.innerHTML =
    '<div class="chapter-resume"><h2>🔥 Articles d’aujourd’hui</h2>' +
    '<p class="meta-count">Articles parus après la génération de l’édition (' +
    esc(fmtDateHour(state.edition?.genere_le ?? new Date().toISOString())) + ') · toutes rubriques confondues · ' +
    state.feedStats.ok + '/' + state.feedStats.total + ' flux actifs. L’essentiel du jour est dans l’Édition.</p>' +
    '<button class="filter-btn' + (afpOnly ? ' active' : '') + '" id="btn-afp">📡 Dépêches AFP uniquement</button></div>' +
    (arts.length ? arts.map(articleHtml).join('')
      : '<div class="empty">' + (afpOnly
        ? 'Aucune dépêche AFP repérée depuis la génération de l’édition pour l’instant — retente dans un instant. 🌱'
        : 'Rien de neuf depuis la génération de l’édition — c’est plutôt bon signe. 🌙') + '</div>');
  const bAfp = $('#btn-afp');
  if (bAfp) bAfp.onclick = () => { setStore('afpOnly', !afpOnly); renderView(); };
}

/* --- 🎬 Médias : sous-onglets configurés dans data/medias.json --- */
function vueMedias() {
  const view = $('#view');
  const medias = state.medias;
  if (!medias.length) {
    view.innerHTML = '<div class="empty">Aucun média configuré pour l’instant — ajoute-le dans data/medias.json. 🌱</div>';
    return;
  }
  if (!state.activeMedia || !medias.some(m => m.id === state.activeMedia)) state.activeMedia = medias[0].id;
  const m = medias.find(x => x.id === state.activeMedia);
  const d = state.mediaData[m.id];
  const fenetre = m.fenetreHeures ?? 24;

  view.innerHTML =
    '<div class="chapter-resume"><h2>🎬 Médias suivis</h2>' +
    '<p class="meta-count">Articles des dernières ' + fenetre + ' h, en continu — indépendamment de l’édition du jour.</p>' +
    '<div class="subtabs">' + medias.map(x =>
      '<button class="subtab' + (x.id === m.id ? ' active' : '') + '" data-m="' + esc(x.id) + '">' +
      (x.emoji ? x.emoji + ' ' : '') + esc(x.nom) + '</button>').join('') + '</div></div>' +
    '<div class="summary-card"><h2>' + (m.emoji ? m.emoji + ' ' : '') + esc(m.nom) + '</h2>' +
    '<p class="meta-count">' + (d
      ? (d.articles.length + ' article(s) · ' + d.ok + '/' + d.total + ' flux actifs · actualisé à ' + fmtHeure(d.time) +
        (d.stale ? ' (dernier état connu, flux injoignable)' : ''))
      : 'Récupération du flux…') + '</p></div>' +
    (d && d.articles.length ? d.articles.map(articleHtml).join('')
      : '<div class="empty">' + (d
        ? 'Aucun article publié dans les dernières ' + fenetre + ' h. 🌙'
        : 'Première récupération du flux ' + esc(m.nom) + ' — un instant…') + '</div>');

  [...document.querySelectorAll('.subtab')].forEach(b =>
    b.onclick = () => { state.activeMedia = b.dataset.m; renderView(); });

  /* Chargement à la demande, sans bloquer l'affichage : le cache s'affiche,
   * le rafraîchissement (TTL 20 min) re-rend la vue quand il aboutit. */
  if (!d || Date.now() - d.time > 20 * 60e3) {
    chargerMedia(m).then(() => {
      if (state.activeTab === 'medias' && state.activeMedia === m.id) renderView();
    }).catch(() => {});
  }
}

/* --- Réglages : chapitres suivis (les masques sont des préférences locales,
 *     indépendantes de la config serveur — plus besoin de numéro de version). --- */
export function renderChaptersEditor() {
  const masques = getStore('masques', {});
  $('#chapters-editor').innerHTML = state.chapters.filter(c => c.flux.length).map(c =>
    '<li><span>' + esc(c.emoji) + '</span><span class="name">' + esc(c.nom) + '</span>' +
    '<label style="margin:0"><input type="checkbox" data-id="' + esc(c.id) + '"' +
    (masques[c.id] ? '' : ' checked') + '> suivi</label></li>').join('');
  [...document.querySelectorAll('#chapters-editor input')].forEach(cb =>
    cb.onchange = () => {
      const masq = getStore('masques', {});
      masq[cb.dataset.id] = !cb.checked;
      setStore('masques', masq);
      renderView();
      chargerChapitres().then(renderView).catch(() => {}); // applique le changement d'un coup
    });
}
