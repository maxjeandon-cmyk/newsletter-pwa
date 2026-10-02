/* views/archives.js — 🗄️ Archives (v17, extrait de views.js) : éditions quotidiennes,
 * récaps hebdo + archives thématiques (chapitres Droit & Économie archivés chaque édition). */
import { $, state, esc, fmtDate, fmtMonth, weekKeyOf } from '../core.js';
import { renderView } from './common.js';
import { vueSources } from './sources.js';

function openArchive(html) {
  state.archiveSel = html; renderView(); window.scrollTo(0, 0);
}

/* Sous-onglets : éditions complètes, chapitre Droit du jour, chapitre Économie du jour.
 * Les chapitres thématiques sont archivés à chaque édition (editions/archives/) pour
 * pouvoir y revenir — l'index porte des titres datés et liés au contenu. */
const SOUS_ONGLETS_ARCHIVES = () => [
  { id: 'editions', nom: '📰 Éditions' },
  { id: 'sources', nom: '📚 Sources' },
  { id: 'droit', nom: '⚖️ Droit' },
  { id: 'economie', nom: '💰 Économie' }
];

function sousOngletsArchives(sub) {
  return '<div class="subtabs">' + SOUS_ONGLETS_ARCHIVES().map(x =>
    '<button class="subtab' + (x.id === sub ? ' active' : '') + '" data-s="' + x.id + '">' + esc(x.nom) + '</button>').join('') + '</div>';
}

function wireSousOngletsArchives() {
  [...document.querySelectorAll('.subtab[data-s]')].forEach(b =>
    b.onclick = () => { state.archiveSub = b.dataset.s; renderView(); });
}

export function vueArchives() {
  const view = $('#view');
  if (state.archiveSel) {
    view.innerHTML =
      '<button class="back-btn" id="btn-back-archives">← Retour aux archives</button>' +
      '<iframe class="edition-frame" src="' + esc(state.archiveSel) + '" title="Newsletter archivée"></iframe>';
    $('#btn-back-archives').onclick = () => { state.archiveSel = null; renderView(); window.scrollTo(0, 0); };
    return;
  }
  const sub = SOUS_ONGLETS_ARCHIVES().some(x => x.id === state.archiveSub) ? state.archiveSub : 'editions';
  /* Sous-onglet Sources : le tableau des sources de l'édition du jour (v30, intégré aux archives) */
  if (sub === 'sources') {
    vueSources();
    const bandeau = document.createElement('div');
    bandeau.innerHTML = sousOngletsArchives(sub);
    view.prepend(bandeau.firstChild);
    wireSousOngletsArchives();
    return;
  }
  /* Sous-onglet thématique : le chapitre Droit (ou Économie) de chaque édition, archivé */
  if (sub !== 'editions') {
    const estDroit = sub === 'droit';
    const meta = estDroit
      ? { emoji: '⚖️', nom: 'Droit pour les nuls', chapitre: 'de droit' }
      : { emoji: '💰', nom: 'Économie pour les nuls', chapitre: 'd’économie' };
    const entrees = (state.archivesThema?.[sub]?.entrees || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    view.innerHTML =
      '<div class="summary-card"><h2>🗄️ Archives — ' + meta.emoji + ' ' + esc(meta.nom) + '</h2>' +
      '<p class="meta-count">Le chapitre ' + meta.chapitre + ' de chaque édition, conservé jour après jour pour pouvoir y revenir.</p>' +
      sousOngletsArchives(sub) + '</div>' +
      (entrees.length ? entrees.map(e =>
        '<div class="archive-item thema" data-h="' + esc(e.html) + '">' +
        '<span class="date">' + esc(fmtDate(e.date)) + '</span>' +
        '<span class="titre">' + esc(e.titre) + '</span>' +
        '<span class="open">Ouvrir →</span></div>').join('')
        : '<div class="empty">Pas encore de chapitre ' + meta.chapitre + ' archivé — le premier arrive avec la prochaine édition. 🌱</div>');
    wireSousOngletsArchives();
    [...document.querySelectorAll('.archive-item.thema')].forEach(el =>
      el.onclick = () => openArchive(el.dataset.h));
    return;
  }
  if (!state.archiveIdx?.length) {
    view.innerHTML = '<div class="empty">Aucune archive disponible pour l’instant — la première édition date d’aujourd’hui. Les jours et semaines passés s’y accumuleront tout seuls. 🌱</div>' + sousOngletsArchives('editions');
    wireSousOngletsArchives();
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
    '</select>' + sousOngletsArchives('editions') + '</div>' +
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
  wireSousOngletsArchives();
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
