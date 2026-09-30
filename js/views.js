/* views.js — rendu des onglets (v16). Chaque onglet a sa fonction vue*(), appelée par renderView().
 * Règle d'hygiène : tout texte externe (flux RSS, éditions) passe par esc() avant innerHTML. */

import { $, state, esc, getStore, setStore, fmtDate, fmtDateHour, fmtHeure, fmtMonth, nomJourEdition, weekKeyOf, norm }
  from './core.js';
import { estAFP, chargerMedia, chargerChapitres, trouverFlux } from './feeds.js';
import { jetonPresent, publierMedia, enregistrerJeton, oublierJeton } from './github.js';

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

/* --- 🗄️ Archives (v20) : éditions quotidiennes, récaps hebdo + archives thématiques --- */
function openArchive(html) {
  state.archiveSel = html; renderView(); window.scrollTo(0, 0);
}

/* Sous-onglets : éditions complètes, chapitre Droit du jour, chapitre Économie du jour.
 * Les chapitres thématiques sont archivés à chaque édition (editions/archives/) pour
 * pouvoir y revenir — l'index porte des titres datés et liés au contenu. */
const SOUS_ONGLETS_ARCHIVES = () => [
  { id: 'editions', nom: '📰 Éditions' },
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

function vueArchives() {
  const view = $('#view');
  if (state.archiveSel) {
    view.innerHTML =
      '<button class="back-btn" id="btn-back-archives">← Retour aux archives</button>' +
      '<iframe class="edition-frame" src="' + esc(state.archiveSel) + '" title="Newsletter archivée"></iframe>';
    $('#btn-back-archives').onclick = () => { state.archiveSel = null; renderView(); window.scrollTo(0, 0); };
    return;
  }
  const sub = SOUS_ONGLETS_ARCHIVES().some(x => x.id === state.archiveSub) ? state.archiveSub : 'editions';

  /* Sous-onglet thématique : le chapitre Droit (ou Économie) de chaque édition, archivé */
  if (sub !== 'editions') {
    const estDroit = sub === 'droit';
    const meta = estDroit
      ? { emoji: '⚖️', nom: 'Droit pour les nuls', chapitre: 'de droit' }
      : { emoji: '💰', nom: 'Économie pour les nuls', chapitre: 'd\u2019économie' };
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

/* Visibilité d'un média (v19) : masqué localement (👁), ou — si la config
 * serveur le marque « masque » (masqué par défaut) — affiché seulement
 * s'il a été explicitement réaffiché sur cet appareil (« nl.mediasAffiches »). */
export function mediaVisible(m, masques, affiches) {
  return !masques[m.id] && (!m.masque || !!affiches[m.id]);
}

/* Identifiant stable depuis le nom : minuscules, sans accents ni espaces. */
const slugMedia = nom => norm(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'media';

/* Recherche automatique du flux RSS (v18) : l'utilisateur donne le site,
 * l'app trouve le flux. Une seule recherche à la fois ; le résultat s'écrit
 * dans le champ « flux », qui reste la seule source de vérité du formulaire. */
let rechercheEnCours = null;
let derniereRecherche = null;
function lancerRecherche() {
  if (rechercheEnCours) return rechercheEnCours;
  const saisie = ($('#mf-flux')?.value || '').trim();
  if (!saisie) return Promise.resolve(null);
  derniereRecherche = saisie;
  const statut = $('#mf-statut');
  const choix = $('#mf-choix');
  if (statut) statut.textContent = '🔎 Recherche du flux en cours… (jusqu’à une trentaine de secondes, je fouille partout)';
  if (choix) choix.hidden = true;
  rechercheEnCours = (async () => {
    try {
      const r = await trouverFlux(saisie);
      if (statut) {
        if (!r.trouves.length) {
          statut.textContent = r.erreur === 'adresse'
            ? 'Entre l’adresse du site (ex. liberation.fr) — ou colle directement l’adresse du flux RSS.'
            : 'Aucun flux trouvé tout seul — vérifie l’adresse, ou colle le flux RSS à la main (souvent …/feed ou …/rss.xml).';
        } else if (r.trouves.length === 1) {
          statut.textContent = 'Flux trouvé ✓ ' + r.trouves[0].articles + ' articles — ' + r.trouves[0].url;
        } else {
          statut.textContent = r.trouves.length + ' flux trouvés — choisis celui qui te plaît :';
          choix.innerHTML = r.trouves.map((t, i) =>
            '<option value="' + esc(t.url) + '"' + (i === 0 ? ' selected' : '') + '>' +
            esc(t.articles + ' articles — ' + t.url) + '</option>').join('');
          choix.hidden = false;
          choix.onchange = () => { $('#mf-flux').value = choix.value; };
        }
      }
      if (r.trouves.length) {
        $('#mf-flux').value = r.trouves[0].url;
        const p = $('#mf-erreur');
        if (p) p.hidden = true;
      }
      return r;
    } finally { rechercheEnCours = null; }
  })();
  return rechercheEnCours;
}

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

/* Catalogue de flux RSS vérifiés (v21) : médias francophones et anglophones
 * classés par catégorie — un choix ici préremplit tout le formulaire. */
function blocCatalogue() {
  if (!state.fluxCatalogue.length) return '';
  const cats = [];
  state.fluxCatalogue.forEach(e => { if (!cats.includes(e.categorie)) cats.push(e.categorie); });
  return '<label>Piocher un média dans le catalogue <select id="mf-catalogue" class="month-select">' +
    '<option value="">— ' + state.fluxCatalogue.length + ' flux vérifiés au choix…</option>' +
    cats.map(c =>
      '<optgroup label="' + esc(c) + '">' +
      state.fluxCatalogue.filter(e => e.categorie === c)
        .map(e => '<option value="' + esc(e.id) + '">' + esc((e.emoji ? e.emoji + ' ' : '') + e.nom) + '</option>').join('') +
      '</optgroup>').join('') +
    '</select></label>';
}

/* Formulaire d'ajout : bâtir un sous-onglet exactement comme Blast.
 * Les valeurs tapées survivent aux erreurs (pas de re-rendu en cas d'erreur). */
function formAjoutMedia() {
  return '<div class="summary-card media-form"><h2>➕ Ajouter un média</h2>' +
    '<p class="meta-count">Un nouveau sous-onglet construit comme Blast : les articles du média, en continu.</p>' +
    '<label>Nom du média<input id="mf-nom" type="text" autocomplete="off" placeholder="Mediapart"></label>' +
    '<label>Emoji (facultatif)<input id="mf-emoji" type="text" maxlength="8" placeholder="📰"></label>' +
    '<label>Adresse du site ou du flux RSS<input id="mf-flux" type="text" inputmode="url" autocomplete="off" placeholder="blast-info.fr ou https://…/rss.xml"></label>' +
    blocCatalogue() +
    '<div class="form-actions"><button class="filter-btn" id="mf-chercher">🔎 Trouver le flux tout seul</button></div>' +
    '<p class="meta-count" id="mf-statut" aria-live="polite"></p>' +
    '<select id="mf-choix" class="month-select" hidden></select>' +
    '<label>Fenêtre d’affichage, en heures<input id="mf-fenetre" type="number" min="1" max="168" value="24"></label>' +
    '<label style="margin:12px 0 0"><input id="mf-masque" type="checkbox" style="display:inline;width:auto;margin-right:6px">' +
    'Masqué par défaut (chacun pourra l’afficher depuis 👁 Gérer)</label>' +
    '<p class="form-erreur" id="mf-erreur" hidden></p>' +
    '<div class="form-actions">' +
    '<button class="filter-btn" id="mf-annuler">Annuler</button>' +
    '<button class="filter-btn active" id="mf-valider">Ajouter ce média</button></div>' +
    '<p class="hint">' + (jetonPresent()
      ? '🔑 Publication pour tous les écrans prête — ce média ira dans la config du site (data/medias.json).'
      : 'Sans jeton GitHub, le média restera sur cet appareil. Pour le publier à tous les écrans : 👁 Gérer → 🔑.') + '</p>' +
    '</div>';
}

/* Gestion : afficher/masquer chaque média ; supprimer les médias ajoutés ici.
 * v19 : un média « masqué par défaut » (config serveur) se réaffiche ici,
 * appareil par appareil — réversibilité douce, le défaut ne bouge jamais. */
function gestionMedias() {
  const masques = getStore('mediasMasques', {});
  const affiches = getStore('mediasAffiches', {});
  const persoIds = getStore('mediasPerso', []).map(p => p.id);
  const pub = state.publie
    ? '<p class="meta-count">✓ ' + esc(state.publie.nom) + ' publié pour tous les écrans' +
      (state.publie.masque ? ' — masqué par défaut, réaffiche-le ici.' : '.') + '</p>'
    : '';
  return '<div class="summary-card"><h2>👁 Médias affichés dans l’onglet</h2>' + pub +
    '<ul id="medias-editor">' + state.medias.map(m =>
      '<li><span>' + esc(m.emoji || '📰') + '</span><span class="name">' + esc(m.nom) +
      (persoIds.includes(m.id) ? ' <span class="badge-perso">ajouté ici</span>' : '') +
      (m.masque ? ' <span class="badge-perso">masqué par défaut</span>' : '') + '</span>' +
      '<label><input type="checkbox" data-id="' + esc(m.id) + '"' +
      (mediaVisible(m, masques, affiches) ? ' checked' : '') + '> affiché</label>' +
      (persoIds.includes(m.id) ? '<button class="mini-btn" data-sup="' + esc(m.id) + '" aria-label="Supprimer">🗑</button>' : '') +
      '</li>').join('') + '</ul>' +
    '<p class="hint">Les médias ajoutés ici se suppriment (🗑) ; ceux de la config serveur se masquent simplement.</p></div>' +
    zoneJeton();
}

/* 🔑 Publication pour tous les écrans : le jeton GitHub vit sur cet appareil.
 * Fine-grained, « Contents : Read and write », sur le seul dépôt newsletter-pwa. */
function zoneJeton() {
  const ok = jetonPresent();
  return '<div class="summary-card"><h2>🔑 Publication pour tous les écrans</h2>' +
    '<p class="meta-count">' + (ok
      ? 'Jeton GitHub enregistré sur cet appareil — les médias ajoutés depuis ➕ se publient dans la config du site.'
      : 'Sans jeton, un média ajouté reste visible sur cet appareil seulement.') + '</p>' +
    (ok
      ? '<div class="form-actions"><button class="filter-btn" id="jt-oublier">Oublier le jeton</button></div>'
      : '<label>Jeton d’accès GitHub<input id="jt-jeton" type="password" autocomplete="off" placeholder="github_pat_…"></label>' +
        '<div class="form-actions"><button class="filter-btn active" id="jt-enregistrer">Enregistrer le jeton</button></div>' +
        '<p class="hint">À créer sur GitHub : Settings → Developer settings → Personal access tokens → Fine-grained. ' +
        'Accès au seul dépôt newsletter-pwa, permission « Contents : Read and write ». Il reste sur cet appareil.</p>') +
    '</div>';
}

function vueMedias() {
  const view = $('#view');
  majMedias();
  const medias = state.medias;
  const masques = getStore('mediasMasques', {});
  const affiches = getStore('mediasAffiches', {});
  const visibles = medias.filter(m => mediaVisible(m, masques, affiches));
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
    $('#mf-chercher').onclick = () => { lancerRecherche(); };
    const selCat = $('#mf-catalogue');
    if (selCat) selCat.onchange = () => {
      const e = state.fluxCatalogue.find(x => x.id === selCat.value);
      if (!e) return;
      $('#mf-nom').value = e.nom;
      $('#mf-emoji').value = e.emoji || '';
      $('#mf-flux').value = e.flux[0] || '';
      const p = $('#mf-erreur'); if (p) p.hidden = true;
      const st = $('#mf-statut');
      if (st) st.textContent = '✓ ' + e.nom + ' prérempli depuis le catalogue — ajuste si tu veux, puis « Ajouter ce média ».';
    };
    $('#mf-flux').onblur = () => {
      const val = ($('#mf-flux').value || '').trim();
      if (val && val !== derniereRecherche) lancerRecherche();
    };
    const erreur = msg => { const p = $('#mf-erreur'); p.hidden = false; p.textContent = '⚠️ ' + msg; };
    bVal.onclick = async () => {
      const nom = ($('#mf-nom').value || '').trim();
      const emoji = ($('#mf-emoji').value || '').trim();
      const flux = ($('#mf-flux').value || '').trim();
      let fenetre = parseInt($('#mf-fenetre').value, 10);
      const masqueDefaut = !!($('#mf-masque')?.checked);
      if (!nom) return erreur('Donne un nom à ton média.');
      let fluxFinal = /^https?:\/\/\S+$/.test(flux) ? flux : '';
      if (!fluxFinal) {
        erreur('Adresse incomplète — je cherche le flux tout seul, un instant…');
        const r = await lancerRecherche();
        const val = ($('#mf-flux').value || '').trim();
        if (r && r.trouves && r.trouves.length && /^https?:\/\/\S+$/.test(val)) fluxFinal = val;
        else return erreur('Aucun flux trouvé automatiquement — colle l’adresse RSS du média (souvent …/feed ou …/rss.xml).');
      }
      const id = slugMedia(nom);
      if (state.medias.some(m => m.id === id)) return erreur('Ce média existe déjà — choisis un autre nom.');
      if (!Number.isFinite(fenetre) || fenetre < 1 || fenetre > 168) fenetre = 24;
      const media = { id, nom, emoji, flux: [fluxFinal], fenetreHeures: fenetre };
      if (masqueDefaut) media.masque = true;

      /* v19 : jeton présent → publication dans la config du site (tous les écrans). */
      if (jetonPresent()) {
        const statut = $('#mf-statut');
        if (statut) statut.textContent = '🔑 Publication dans la config du site…';
        bVal.disabled = true;
        const r = await publierMedia(media);
        bVal.disabled = false;
        if (r.ok) {
          state.mediasBase = r.medias;   /* la réponse porte la config à jour */
          state.publie = { nom, masque: masqueDefaut };
          majMedias();
          state.activeMedia = id;
          state.mediasMode = masqueDefaut ? 'gerer' : null; /* masqué → montrer où le réafficher */
          renderView();
          return;
        }
        if (r.erreur === 'existe') {
          bVal.disabled = false;
          return erreur('Ce média existe déjà dans la config du site — rafraîchis (⟳) ou choisis un autre nom.');
        }
        const motif = r.erreur === 'jeton' ? 'jeton GitHub refusé — vérifie-le dans 👁 Gérer → 🔑'
          : r.erreur === 'conflit' ? 'la config vient d’être modifiée — retente'
          : r.erreur === 'format' ? 'la config du site est illisible'
          : 'GitHub est injoignable pour l’instant';
        erreur('Publication impossible (' + motif + ') — en attendant, le média est enregistré sur cet appareil.');
      }

      /* Repli local (pas de jeton ou publication ratée) : jamais perdu —
       * et visible d'office ici : « masqué par défaut » n'a de sens que côté site. */
      const local = { ...media };
      delete local.masque;
      const perso = getStore('mediasPerso', []);
      perso.push(local);
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

  /* Gestion : bascule affichage (masque local ou réaffichage d'un « masqué par défaut »),
   * suppression d'un média ajouté ici, jeton de publication. */
  [...document.querySelectorAll('#medias-editor input')].forEach(cb =>
    cb.onchange = () => {
      const id = cb.dataset.id;
      const m = state.medias.find(x => x.id === id);
      const masq = getStore('mediasMasques', {});
      const aff = getStore('mediasAffiches', {});
      if (cb.checked) { delete masq[id]; if (m?.masque) aff[id] = true; else delete aff[id]; }
      else if (m?.masque) delete aff[id];
      else masq[id] = true;
      setStore('mediasMasques', masq);
      setStore('mediasAffiches', aff);
      const vis = state.medias.filter(x => mediaVisible(x, masq, aff));
      if (!vis.some(x => x.id === state.activeMedia)) state.activeMedia = vis[0]?.id || null;
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
      const aff = getStore('mediasAffiches', {});
      delete aff[id];
      setStore('mediasAffiches', aff);
      majMedias();
      if (state.activeMedia === id) state.activeMedia = state.medias.find(m => mediaVisible(m, masq, aff))?.id || null;
      renderView();
    });
  const bJtOk = $('#jt-enregistrer');
  if (bJtOk) {
    bJtOk.onclick = () => {
      const v = ($('#jt-jeton').value || '').trim();
      if (!v) return;
      enregistrerJeton(v);
      renderView();
    };
  }
  const bJtOub = $('#jt-oublier');
  if (bJtOub) bJtOub.onclick = () => { oublierJeton(); renderView(); };

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
