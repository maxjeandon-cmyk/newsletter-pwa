/* views.js — rendu des onglets (v16). Chaque onglet a sa fonction vue*(), appelée par renderView().
 * Règle d'hygiène : tout texte externe (flux RSS, éditions) passe par esc() avant innerHTML. */

import { $, state, esc, getStore, setStore, fmtDate, fmtDateHour, fmtHeure, fmtMonth, nomJourEdition, weekKeyOf, norm }
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

/* --- 🎬 Médias : sous-onglets (config data/medias.json + médias ajoutés sur l'appareil) --- */

/* Médias effectifs = config serveur + ajouts personnels (préférence locale « nl.mediasPerso »). */
export function majMedias() {
  state.medias = (state.mediasBase || []).concat(getStore('mediasPerso', []));
}

/* Identifiant stable depuis le nom : minuscules, sans accents ni espaces. */
const slugMedia = nom => norm(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'media';

function sousOngletsMedias(visibles, mode) {
  return '<div class="chapter-resume"><h2>🎬 Médias suivis</h2>' +
    '<p class="meta-count">Articles en continu, fenêtre propre à chaque média — indépendamment de l’édition du jour.</p>' +
    '<div class="subtabs">' +
    visibles.map(x =>
      '<button class="subtab' + (x.id === state.activeMedia && !mode ? ' active' : '') + '" data-m="' + esc(x.id) + '">' +
      (x.emoji ? x.emoji + ' ' : '') + esc(x.nom) + '</button>').join('') +
    '<button class="subtab add' + (mode === 'ajout' ? ' active' : '') + '" data-m="__ajout">➕ Ajouter</button>' +
    '<button class="subtab' + (mode === 'gerer' ? ' active' : '') + '" data-m="__gerer">👁 ' + (mode === 'gerer' ? 'Terminer' : 'Gérer') + '</button>' +
    '</div></div>';
}

/* Formulaire d'ajout : bâtir un sous-onglet exactement comme Blast.
 * Les valeurs tapées survivent aux erreurs (pas de re-rendu en cas d'erreur). */
function formAjoutMedia() {
  return '<div class="summary-card media-form"><h2>➕ Ajouter un média</h2>' +
    '<p class="meta-count">Un nouveau sous-onglet construit comme Blast : les articles du média, en continu.</p>' +
    '<label>Nom du média<input id="mf-nom" type="text" autocomplete="off" placeholder="Mediapart"></label>' +
    '<label>Emoji (facultatif)<input id="mf-emoji" type="text" maxlength="8" placeholder="📰"></label>' +
    '<label>Adresse du flux RSS<input id="mf-flux" type="url" inputmode="url" placeholder="https://www.mediapart.fr/rss2/articles.xml"></label>' +
    '<label>Fenêtre d’affichage, en heures<input id="mf-fenetre" type="number" min="1" max="168" value="24"></label>' +
    '<p class="form-erreur" id="mf-erreur" hidden></p>' +
    '<div class="form-actions">' +
    '<button class="filter-btn" id="mf-annuler">Annuler</button>' +
    '<button class="filter-btn active" id="mf-valider">Ajouter ce média</button></div>' +
    '<p class="hint">Enregistré sur cet appareil, comme ton thème. Pour l’avoir sur tous tes écrans, il faut l’ajouter à data/medias.json.</p>' +
    '</div>';
}

/* Gestion : afficher/masquer chaque média ; supprimer les médias ajoutés ici. */
function gestionMedias() {
  const masques = getStore('mediasMasques', {});
  const persoIds = getStore('mediasPerso', []).map(p => p.id);
  return '<div class="summary-card"><h2>👁 Médias affichés dans l’onglet</h2>' +
    '<ul id="medias-editor">' + state.medias.map(m =>
      '<li><span>' + esc(m.emoji || '📰') + '</span><span class="name">' + esc(m.nom) +
      (persoIds.includes(m.id) ? ' <span class="badge-perso">ajouté ici</span>' : '') + '</span>' +
      '<label><input type="checkbox" data-id="' + esc(m.id) + '"' + (masques[m.id] ? '' : ' checked') + '> affiché</label>' +
      (persoIds.includes(m.id) ? '<button class="mini-btn" data-sup="' + esc(m.id) + '" aria-label="Supprimer">🗑</button>' : '') +
      '</li>').join('') + '</ul>' +
    '<p class="hint">Les médias ajoutés ici se suppriment (🗑) ; ceux de la config serveur se masquent simplement.</p></div>';
}

function vueMedias() {
  const view = $('#view');
  majMedias();
  const medias = state.medias;
  const masques = getStore('mediasMasques', {});
  const visibles = medias.filter(m => !masques[m.id]);
  let mode = state.mediasMode || null;
  if (mode !== 'ajout' && mode !== 'gerer') mode = null;
  if (!visibles.length && mode !== 'ajout') mode = 'gerer'; /* tout masqué → gestion */
  if (!visibles.some(m => m.id === state.activeMedia)) state.activeMedia = visibles[0]?.id || null;

  let html = sousOngletsMedias(visibles, mode);
  if (mode === 'ajout') {
    html += formAjoutMedia();
  } else if (mode === 'gerer') {
    html += (visibles.length ? '' : '<div class="empty">Tous les médias sont masqués — réaffiche-en au moins un ci-dessous. 🌱</div>');
    html += gestionMedias();
  } else if (state.activeMedia) {
    const m = medias.find(x => x.id === state.activeMedia);
    const d = state.mediaData[m.id];
    const fenetre = m.fenetreHeures ?? 24;
    html += '<div class="summary-card"><h2>' + (m.emoji ? m.emoji + ' ' : '') + esc(m.nom) + '</h2>' +
      '<p class="meta-count">' + (d
        ? (d.articles.length + ' article(s) · ' + d.ok + '/' + d.total + ' flux actifs · actualisé à ' + fmtHeure(d.time) +
          (d.stale ? ' (dernier état connu, flux injoignable)' : ''))
        : 'Récupération du flux…') + '</p></div>' +
      (d && d.articles.length ? d.articles.map(articleHtml).join('')
        : '<div class="empty">' + (d
          ? 'Aucun article publié dans les dernières ' + fenetre + ' h. 🌙'
          : 'Première récupération du flux ' + esc(m.nom) + ' — un instant…') + '</div>');
  }
  view.innerHTML = html;

  /* Sous-onglets : média actif, formulaire d'ajout, gestion */
  [...document.querySelectorAll('.subtab')].forEach(b =>
    b.onclick = () => {
      const id = b.dataset.m;
      if (id === '__ajout') state.mediasMode = state.mediasMode === 'ajout' ? null : 'ajout';
      else if (id === '__gerer') state.mediasMode = state.mediasMode === 'gerer' ? null : 'gerer';
      else { state.activeMedia = id; state.mediasMode = null; }
      renderView();
    });

  /* Formulaire d'ajout — erreurs affichées sans re-rendu (les valeurs tapées restent) */
  const bVal = $('#mf-valider');
  if (bVal) {
    $('#mf-annuler').onclick = () => { state.mediasMode = null; renderView(); };
    const erreur = msg => { const p = $('#mf-erreur'); p.hidden = false; p.textContent = '⚠️ ' + msg; };
    bVal.onclick = () => {
      const nom = ($('#mf-nom').value || '').trim();
      const emoji = ($('#mf-emoji').value || '').trim();
      const flux = ($('#mf-flux').value || '').trim();
      let fenetre = parseInt($('#mf-fenetre').value, 10);
      if (!nom) return erreur('Donne un nom à ton média.');
      if (!/^https?:\/\/\S+$/.test(flux)) return erreur('L’adresse du flux doit commencer par http(s):// — l’adresse RSS du média, pas son site.');
      const id = slugMedia(nom);
      if (state.medias.some(m => m.id === id)) return erreur('Ce média existe déjà — choisis un autre nom.');
      if (!Number.isFinite(fenetre) || fenetre < 1 || fenetre > 168) fenetre = 24;
      const perso = getStore('mediasPerso', []);
      perso.push({ id, nom, emoji, flux: [flux], fenetreHeures: fenetre });
      setStore('mediasPerso', perso);
      const masq = getStore('mediasMasques', {});
      delete masq[id];
      setStore('mediasMasques', masq);
      majMedias();
      state.activeMedia = id;
      state.mediasMode = null;
      renderView();
    };
  }

  /* Gestion : bascule affichage, suppression d'un média ajouté ici */
  [...document.querySelectorAll('#medias-editor input')].forEach(cb =>
    cb.onchange = () => {
      const masq = getStore('mediasMasques', {});
      masq[cb.dataset.id] = !cb.checked;
      setStore('mediasMasques', masq);
      const vis = state.medias.filter(m => !masq[m.id]);
      if (!vis.some(m => m.id === state.activeMedia)) state.activeMedia = vis[0]?.id || null;
      renderView();
    });
  [...document.querySelectorAll('#medias-editor .mini-btn')].forEach(b =>
    b.onclick = () => {
      const id = b.dataset.sup;
      setStore('mediasPerso', getStore('mediasPerso', []).filter(p => p.id !== id));
      delete state.mediaData[id];
      const masq = getStore('mediasMasques', {});
      delete masq[id];
      setStore('mediasMasques', masq);
      majMedias();
      if (state.activeMedia === id) state.activeMedia = state.medias.find(m => !masq[m.id])?.id || null;
      renderView();
    });

  /* Chargement à la demande du média actif (TTL 20 min), sans bloquer l'affichage */
  if (!mode && state.activeMedia) {
    const m = medias.find(x => x.id === state.activeMedia);
    const d = state.mediaData[m.id];
    if (!d || Date.now() - d.time > 20 * 60e3) {
      chargerMedia(m).then(() => {
        if (state.activeTab === 'medias' && state.activeMedia === m.id && !state.mediasMode) renderView();
      }).catch(() => {});
    }
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
