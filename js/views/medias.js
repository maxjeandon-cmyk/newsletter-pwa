/* views/medias.js — 🎬 Médias (v17, extrait de views.js) : sous-onglets
 * (config data/medias.json + médias ajoutés sur l'appareil), formulaire d'ajout,
 * gestion, jeton de publication. */
import { $, state, esc, getStore, setStore, fmtHeure, norm } from '../core.js';
import { chargerMedia, trouverFlux, resoudreChaineYoutube } from '../feeds.js';
import { jetonPresent, publierMedia, enregistrerJeton, oublierJeton } from '../github.js';
import { articleHtml, renderView } from './common.js';

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

/* Un média « vidéo » expose un flux YouTube (chaîne) ; les autres sont des
 * sources d'articles. Séparation douce : un média hybride apparaît des deux côtés. */
const estVideo = m => (m.flux || []).some(f => /youtube\.com\/feeds\/videos\.xml/i.test(f));

/* Deux encarts — Articles 📰 et Vidéos 📺 — pour séparer les sources choisies. */
function sousOngletsMedias(visibles, mode) {
  const encart = (titre, emoji, liste, modeAjout, dataAjout, libelleAjout) =>
    '<div class="chapter-resume medias-encart"><h2>' + emoji + ' ' + titre + '</h2>' +
    '<div class="subtabs">' +
    (liste.length
      ? liste.map(x =>
        '<button class="subtab' + (x.id === state.activeMedia && !mode ? ' active' : '') + '" data-m="' + esc(x.id) + '">' +
        (x.emoji ? x.emoji + ' ' : '') + esc(x.nom) + '</button>').join('')
      : '<span class="meta-count">Aucune source suivie — ajoute-en une avec ➕.</span>') +
    '<button class="subtab add' + (mode === modeAjout ? ' active' : '') + '" data-m="' + dataAjout + '">' + libelleAjout + '</button>' +
    '</div></div>';
  const articles = visibles.filter(m => !estVideo(m));
  const videos = visibles.filter(estVideo);
  return encart('Articles', '📰', articles, 'ajout', '__ajout', '➕ Articles') +
    encart('Vidéos', '📺', videos, 'ajoutvideo', '__ajoutvideo', '➕ Vidéos') +
    '<div class="subtabs"><button class="subtab' + (mode === 'gerer' ? ' active' : '') + '" data-m="__gerer">👁 ' + (mode === 'gerer' ? 'Terminer la gestion' : 'Gérer') + '</button></div>';
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
        .map(e => '<option value="' + esc(e.id) + '">' + esc((e.emoji ? e.emoji + ' ' : '') + e.nom + (e.ligne ? ' — ' + e.ligne : '')) + '</option>').join('') +
      '</optgroup>').join('') +
    '</select></label>';
}

/* Formulaire d'ajout : bâtir un sous-onglet exactement comme Blast.
 * Les valeurs tapées survivent aux erreurs (pas de re-rendu en cas d'erreur). */
function formAjoutMedia() {
  return '<div class="summary-card media-form"><h2>➕ Ajouter un média (articles)</h2>' +
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


/* ➕ Vidéos : ajouter la chaîne YouTube d'un média — recherche par
 * @handle, URL ou identifiant UC ; la chaîne est stockée dans le même
 * modèle de média (flux RSS YouTube), visible dans l'onglet Vidéos. */
function formAjoutVideo() {
  return '<div class="summary-card media-form"><h2>➕ Ajouter un média (vidéos)</h2>' +
    '<p class="meta-count">La chaîne YouTube d\u2019un média — ses vidéos arrivent dans l\u2019onglet 📺 Vidéos.</p>' +
    '<label>Nom du média<input id="mv-nom" type="text" autocomplete="off" placeholder="Hugo Décrypte"></label>' +
    '<label>Emoji (facultatif)<input id="mv-emoji" type="text" maxlength="8" placeholder="📺"></label>' +
    '<label>Chaîne YouTube — @handle, lien ou identifiant<input id="mv-chaine" type="text" inputmode="url" autocomplete="off" placeholder="@hugodecrypte, youtube.com/@… ou UC…"></label>' +
    '<p class="meta-count" id="mv-statut" aria-live="polite"></p>' +
    '<p class="form-erreur" id="mv-erreur" hidden></p>' +
    '<div class="form-actions">' +
    '<button class="filter-btn" id="mv-annuler">Annuler</button>' +
    '<button class="filter-btn active" id="mv-valider">Ajouter cette chaîne</button></div>' +
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

export function vueMedias() {
  const view = $('#view');
  majMedias();
  const medias = state.medias;
  const masques = getStore('mediasMasques', {});
  const affiches = getStore('mediasAffiches', {});
  const visibles = medias.filter(m => mediaVisible(m, masques, affiches));
  let mode = state.mediasMode || null;
  if (mode !== 'ajout' && mode !== 'ajoutvideo' && mode !== 'gerer') mode = null;
  if (!visibles.length && mode !== 'ajout') mode = 'gerer'; /* tout masqué → gestion */
  if (!visibles.some(m => m.id === state.activeMedia)) state.activeMedia = visibles[0]?.id || null;
  let html = sousOngletsMedias(visibles, mode);
  if (mode === 'ajout') {
    html += formAjoutMedia();
  } else if (mode === 'ajoutvideo') {
    html += formAjoutVideo();
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
        : 'Récupération du flux…') + '</p>' +
      '<p class="hint">' + (m.flux || []).map(f =>
        (/youtube\.com/i.test(f) ? '📺 Chaîne YouTube — vidéos' : '📠 Articles — ' + esc(f))
      ).join('<br>') + '</p></div>' +
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
      else if (id === '__ajoutvideo') state.mediasMode = state.mediasMode === 'ajoutvideo' ? null : 'ajoutvideo';
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
      if (st) st.textContent = '✓ ' + e.nom + ' prémpli depuis le catalogue — ajuste si tu veux, puis « Ajouter ce média ».';
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
  /* ➕ Vidéos : résoudre la chaîne saisie, puis même mécanique que Articles */
  const bVid = $('#mv-valider');
  if (bVid) {
    $('#mv-annuler').onclick = () => { state.mediasMode = null; renderView(); };
    const erreurV = msg => { const p = $('#mv-erreur'); p.hidden = false; p.textContent = '⚠️ ' + msg; };
    bVid.onclick = async () => {
      const nom = ($('#mv-nom').value || '').trim();
      const emoji = ($('#mv-emoji').value || '').trim();
      const saisie = ($('#mv-chaine').value || '').trim();
      if (!nom) return erreurV('Donne un nom à ton média.');
      if (!saisie) return erreurV('Indique la chaîne YouTube (@handle, lien ou identifiant UC…).');
      const statut = $('#mv-statut');
      if (statut) statut.textContent = '🔎 Vérification de la chaîne…';
      bVid.disabled = true;
      const r = await resoudreChaineYoutube(saisie);
      bVid.disabled = false;
      if (!r.chaine) {
        if (statut) statut.textContent = '';
        return erreurV(r.erreur === 'introuvable'
          ? 'Chaîne introuvable — vérifie le @handle ou le lien (ex. youtube.com/@hugodecrypte).'
          : r.erreur === 'inactif'
            ? 'Cette chaîne semble sans vidéos — vérifie l\u2019identifiant.'
            : 'Réseau indisponible — retente dans un instant.');
      }
      if (statut) statut.textContent = '✓ Chaîne trouvée — ' + r.videos + ' vidéo(s) récentes.';
      const fluxYt = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + r.chaine;
      const id = slugMedia(nom);
      if (state.medias.some(m => m.id === id)) return erreurV('Ce média existe déjà — choisis un autre nom.');
      const media = { id, nom, emoji, flux: [fluxYt], fenetreHeures: 24 };
      if (jetonPresent()) {
        if (statut) statut.textContent = '🔑 Publication dans la config du site…';
        bVid.disabled = true;
        const pub = await publierMedia(media);
        bVid.disabled = false;
        if (pub.ok) {
          state.mediasBase = pub.medias;
          state.publie = { nom, masque: false };
          majMedias();
          state.activeMedia = id;
          state.mediasMode = null;
          renderView();
          return;
        }
        if (pub.erreur === 'existe') return erreurV('Ce média existe déjà dans la config du site — choisis un autre nom.');
        erreurV('Publication impossible — en attendant, la chaîne est enregistrée sur cet appareil.');
      }
      const perso = getStore('mediasPerso', []);
      perso.push(media);
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
     suppression d'un média ajouté ici, jeton de publication. */
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
