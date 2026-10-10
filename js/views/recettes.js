/* views/recettes.js — onglet 🍲 Recettes WiP (v1)
 * Trois sous-onglets : 💡 Idées recettes, 📺 Chaînes suivies, ❤️ Favorites.
 * Pattern : tout texte externe passe par esc(), tout lien par urlSure(). */
import { $, state, esc, getStore, setStore, norm, urlSure, JOURS } from '../core.js';
import { renderView } from './common.js';

/* --- Constantes --- */
const FAMILLES_EVITER = ['viande', 'porc', 'poisson', 'fruits-de-mer', 'gluten', 'produits-laitiers', 'oeufs', 'fruits-a-coque', 'arachide', 'sucre'];
const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const TYPES_REPAS = ['petit-dej', 'dejeuner', 'gouter', 'diner'];
const LABELS_REPAS = { 'petit-dej': '🌅 Petit-déjeuner', dejeuner: '🍽️ Déjeuner', gouter: '🍪 Goûter', diner: '🌙 Dîner' };
const EMOJIS_REPAS = { 'petit-dej': '🌅', dejeuner: '🍽️', gouter: '🍪', diner: '🌙' };
const LABELS_FAMILLES = {
  'viande': 'Viande',
  'porc': 'Porc',
  'poisson': 'Poisson',
  'fruits-de-mer': 'Fruits de mer',
  'gluten': 'Gluten',
  'produits-laitiers': 'Produits laitiers / lactose',
  'oeufs': 'Œufs',
  'fruits-a-coque': 'Fruits à coque',
  'arachide': 'Arachide',
  'sucre': 'Sucre'
};
const PLATEFORMES = { youtube: '📺 YouTube', instagram: '📸 Instagram', site: '🍽️ Sites de cuisine' };

/* --- Helpers --- */

/* Générer un ID unique slug depuis un nom */
function slug(id) {
  return norm(id).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'recette';
}

/* Vérifier si une recette est conforme au filtre courant */
function recetteConforme(recette, filtre) {
  if (!filtre) return true;
  const f = filtre.familles || {};
  const libre = (filtre.libre || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  
  // Vérifier les familles cochées
  for (const [famille, cocher] of Object.entries(f)) {
    if (cocher && recette.eviter && recette.eviter.includes(famille)) {
      return false;
    }
  }
  
  // Vérifier les mots libres
  if (libre.length > 0) {
    const texte = norm(recette.nom + ' ' + (recette.ingredients || []).join(' '));
    for (const mot of libre) {
      if (texte.includes(norm(mot))) {
        return false;
      }
    }
  }
  
  return true;
}

/* Obtenir les raisons pour lesquelles une recette n'est pas conforme */
function raisonsNonConforme(recette, filtre) {
  const raisons = [];
  if (!filtre) return raisons;
  const f = filtre.familles || {};
  const libre = (filtre.libre || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  
  for (const [famille, cocher] of Object.entries(f)) {
    if (cocher && recette.eviter && recette.eviter.includes(famille)) {
      raisons.push(LABELS_FAMILLES[famille] || famille);
    }
  }
  
  if (libre.length > 0) {
    const texte = norm(recette.nom + ' ' + (recette.ingredients || []).join(' '));
    for (const mot of libre) {
      if (texte.includes(norm(mot))) {
        raisons.push(mot);
      }
    }
  }
  
  return raisons;
}

/* Obtenir les recettes conformes pour un type donné */
function recettesConformesParType(type, filtre) {
  return (state.recettesCatalogue || []).filter(
    r => r.type === type && recetteConforme(r, filtre)
  );
}

/* Générer une semaine de recettes */
function genererSemaine(filtre) {
  const semaine = { jours: {}, genere: new Date().toISOString() };
  
  for (const jour of JOURS_SEMAINE) {
    semaine.jours[jour] = {};
    for (const type of TYPES_REPAS) {
      const pool = recettesConformesParType(type, filtre);
      
      if (pool.length === 0) {
        semaine.jours[jour][type] = null;
        continue;
      }
      
      // Filtrer les recettes déjà utilisées cette semaine pour ce type
      const dejaUtilisees = [];
      for (const j of JOURS_SEMAINE) {
        if (semaine.jours[j] && semaine.jours[j][type]) {
          dejaUtilisees.push(semaine.jours[j][type]);
        }
      }
      
      const disponibles = pool.filter(r => !dejaUtilisees.includes(r.id));
      
      let recette;
      if (disponibles.length > 0) {
        // Choix aléatoire parmi les disponibles
        recette = disponibles[Math.floor(Math.random() * disponibles.length)];
      } else if (pool.length >= 7) {
        // Si pool >= 7, on doit avoir des doublons entre jours - ne devrait pas arriver
        recette = pool[Math.floor(Math.random() * pool.length)];
      } else {
        // Pool < 7 : doublons autorisés entre jours
        recette = pool[Math.floor(Math.random() * pool.length)];
      }
      
      semaine.jours[jour][type] = recette.id;
    }
  }
  
  return semaine;
}

/* Obtenir la recette par ID */
function recetteParId(id) {
  return (state.recettesCatalogue || []).find(r => r.id === id);
}

/* --- Gestion du filtre --- */

function filtreRecettes() {
  return getStore('recettesEviter', { familles: {}, libre: '' });
}

function sauvegarderFiltre(filtre) {
  setStore('recettesEviter', filtre);
}

/* --- Gestion des favorites --- */

function favoritesRecettes() {
  return getStore('recettesFav', []);
}

function sauvegarderFavorites(favs) {
  setStore('recettesFav', favs);
}

function toggleFavorite(recetteId) {
  const favs = favoritesRecettes();
  const recette = recetteParId(recetteId);
  if (!recette) return favs;
  
  const index = favs.findIndex(f => f.recette.id === recetteId);
  if (index >= 0) {
    favs.splice(index, 1);
  } else {
    favs.push({ recette: { ...recette }, ajoute: new Date().toISOString() });
  }
  
  sauvegarderFavorites(favs);
  return favs;
}

function estFavorite(recetteId) {
  return favoritesRecettes().some(f => f.recette.id === recetteId);
}

/* --- Gestion des chaînes personnelles --- */

function chainesPerso() {
  return getStore('chainesPerso', []);
}

function sauvegarderChainesPerso(chaines) {
  setStore('chainesPerso', chaines);
}

function ajouterChaine(nom, emoji, plateforme, url) {
  const chaines = chainesPerso();
  const id = slug(nom + '-' + plateforme);
  
  if (chaines.some(c => c.id === id)) {
    return { ok: false, message: 'Cette chaîne existe déjà.' };
  }
  
  chaines.push({ id, nom, emoji: emoji || '', plateforme, url, ligne: '' });
  sauvegarderChainesPerso(chaines);
  return { ok: true, chaine: { id, nom, emoji: emoji || '', plateforme, url, ligne: '' } };
}

function supprimerChaine(id) {
  const chaines = chainesPerso().filter(c => c.id !== id);
  sauvegarderChainesPerso(chaines);
}

/* --- Gestion de la semaine --- */

function semaineRecettes() {
  return getStore('recettesSemaine', null);
}

function sauvegarderSemaine(semaine) {
  setStore('recettesSemaine', semaine);
}

/* --- Rendu --- */

/* Rendre le filtre des aliments à éviter */
function renduFiltre() {
  const filtre = filtreRecettes();
  const aAuMoinsUn = Object.values(filtre.familles || {}).some(v => v) || (filtre.libre || '').trim() !== '';
  
  let html = '<details class="summary-card recettes-filtre"' + (aAuMoinsUn ? ' open' : '') + '>' +
    '<summary>🥗 Aliments à éviter</summary>' +
    '<div class="recettes-familles">' +
    FAMILLES_EVITER.map(famille => {
      const cocher = (filtre.familles || {})[famille] || false;
      return '<label><input type="checkbox" data-famille="' + esc(famille) + '"' + (cocher ? ' checked' : '') + '> ' + esc(LABELS_FAMILLES[famille] || famille) + '</label>';
    }).join('') +
    '</div>' +
    '<label style="margin-top:10px;display:block">Autres aliments à éviter (séparés par des virgules)<input type="text" id="recettes-libre" value="' + esc(filtre.libre || '') + '" placeholder="ex: coriandre, huître"></label>' +
    '</details>';
  
  return html;
}

/* Rendre la grille des idées recettes */
function renduIdeesRecettes() {
  const semaine = semaineRecettes();
  const filtre = filtreRecettes();
  
  // Générer si nécessaire
  if (!semaine) {
    const nouvelleSemaine = genererSemaine(filtre);
    sauvegarderSemaine(nouvelleSemaine);
    return renduIdeesRecettes();
  }
  
  // Calculer le lundi de la semaine courante
  const aujourdhui = new Date();
  const jourSemaine = aujourdhui.getDay(); // 0 = dimanche, 1 = lundi...
  const lundi = new Date(aujourdhui);
  lundi.setDate(aujourdhui.getDate() - (jourSemaine === 0 ? 6 : jourSemaine - 1));
  
  const dateLundi = lundi.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateGenere = semaine.genere ? new Date(semaine.genere).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }) : 'inconnue';
  
  let html = '<div class="recettes-en-tete">' +
    '<h2>Semaine du ' + esc(dateLundi) + '</h2>' +
    '<button class="filter-btn" id="recettes-regenerer">🎲 Régénérer la semaine</button>' +
    '<span class="meta-count">générée le ' + esc(dateGenere) + '</span>' +
    '</div>' +
    renduFiltre();
  
  // Vérifier si catalogue est vide
  if ((state.recettesCatalogue || []).length === 0) {
    return html + '<div class="empty">Catalogue de recettes vide — <button class="filter-btn" id="recettes-reessayer">Réessayer</button></div>';
  }
  
  // Rendre chaque jour
  const jourCourant = JOURS_SEMAINE[aujourdhui.getDay() === 0 ? 6 : aujourdhui.getDay() - 1];
  
  for (const jour of JOURS_SEMAINE) {
    const estJourCourant = jour === jourCourant;
    const recettesJour = semaine.jours[jour] || {};
    
    let cartesRepas = '';
    for (const type of TYPES_REPAS) {
      const recetteId = recettesJour[type];
      const recette = recetteParId(recetteId);
      
      if (!recette) {
        cartesRepas += '<div class="recettes-slot empty">Aucune recette ne respecte ton filtre — élargis-le. 🌱</div>';
        continue;
      }
      
      const raisons = raisonsNonConforme(recette, filtre);
      const badgeContient = raisons.length > 0 
        ? '<span class="badge-contient">⚠️ contient : ' + esc(raisons.join(', ')) + '</span>'
        : '';
      
      const estFav = estFavorite(recetteId);
      const coeur = estFav ? '🧡' : '❤️';
      
      cartesRepas += '<div class="recettes-repas" data-id="' + esc(recetteId) + '">' +
        '<span class="recettes-repas-emoji">' + esc(EMOJIS_REPAS[type] || '') + '</span>' +
        '<span class="recettes-repas-nom">' + esc(recette.nom) + '</span>' +
        '<span class="recettes-repas-ingredients">' + esc((recette.ingredients || []).join(', ')) + '</span>' +
        '<a href="' + esc(urlSure(recette.lien)) + '" target="_blank" rel="noopener">Voir la recette ↗</a>' +
        '<button type="button" class="recette-fav" data-id="' + esc(recetteId) + '" aria-pressed="' + (estFav ? 'true' : 'false') + '">' + coeur + '</button>' +
        badgeContient +
        '</div>';
    }
    
    const open = estJourCourant ? ' open' : '';
    html += '<details class="summary-card recettes-jour"' + open + '>' +
      '<summary>' + esc(jour.charAt(0).toUpperCase() + jour.slice(1)) + ' ' + 
      lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + '</summary>' +
      cartesRepas +
      '</details>';
    
    // Ajouter le lundi pour les jours suivants
    lundi.setDate(lundi.getDate() + 1);
  }
  
  return html;
}

/* Rendre les chaînes suivies */
function renduChainesSuivies() {
  const toutesChaines = (state.chainesBase || []).concat(chainesPerso());
  const chainesParPlateforme = { youtube: [], instagram: [], site: [] };
  
  for (const chaine of toutesChaines) {
    const pf = chaine.plateforme || 'site';
    if (chainesParPlateforme[pf]) {
      chainesParPlateforme[pf].push(chaine);
    }
  }
  
  let html = '<div class="subtabs">' +
    '<button class="subtab' + (state.recettesSub === 'idees' ? ' active' : '') + '" data-sub="idees">💡 Idées recettes</button>' +
    '<button class="subtab' + (state.recettesSub === 'chaines' ? ' active' : '') + '" data-sub="chaines">📺 Chaînes suivies</button>' +
    '<button class="subtab' + (state.recettesSub === 'favorites' ? ' active' : '') + '" data-sub="favorites">❤️ Favorites</button>' +
    '</div>' +
    '<div class="recettes-chaines">';
  
  for (const [plateforme, chaines] of Object.entries(chainesParPlateforme)) {
    if (chaines.length === 0) continue;
    
    html += '<div class="recettes-plateforme">' +
      '<h3>' + esc(PLATEFORMES[plateforme] || plateforme) + '</h3>' +
      '<div class="recettes-chaines-liste">' +
      chaines.map(chaine => {
        const estPerso = chainesPerso().some(c => c.id === chaine.id);
        return '<a href="' + esc(urlSure(chaine.url)) + '" target="_blank" rel="noopener" class="recettes-chaine-carte">' +
          '<span class="recettes-chaine-emoji">' + esc(chaine.emoji || '') + '</span>' +
          '<span class="recettes-chaine-nom">' + esc(chaine.nom) + '</span>' +
          '<span class="recettes-chaine-ligne">' + esc(chaine.ligne || '') + '</span>' +
          (estPerso ? '<button type="button" class="mini-btn recettes-chaine-suppr" data-id="' + esc(chaine.id) + '">🗑</button>' : '') +
          '</a>';
      }).join('') +
      '</div></div>';
  }
  
  html += '</div>' +
    '<div class="recettes-ajout-chaine">' +
    '<button class="subtab add" id="recettes-ajout-chaine">➕ Ajouter une chaîne</button>' +
    '</div>' +
    '<form id="recettes-form-chaine" hidden>' +
    '<div class="summary-card">' +
    '<h2>➕ Ajouter une chaîne</h2>' +
    '<label>Nom*<input type="text" id="recettes-chaine-nom" required placeholder="Nom de la chaîne"></label>' +
    '<label>Emoji (facultatif)<input type="text" id="recettes-chaine-emoji" maxlength="8" placeholder="👨‍🍳"></label>' +
    '<label>Plateforme' +
    '<select id="recettes-chaine-plateforme">' +
    '<option value="youtube">YouTube</option>' +
    '<option value="instagram">Instagram</option>' +
    '<option value="site">Site de cuisine</option>' +
    '</select></label>' +
    '<label>Lien*<input type="url" id="recettes-chaine-url" required placeholder="https://..."></label>' +
    '<p class="form-erreur" id="recettes-chaine-erreur" hidden></p>' +
    '<div class="form-actions">' +
    '<button type="button" class="filter-btn" id="recettes-chaine-annuler">Annuler</button>' +
    '<button type="button" class="filter-btn active" id="recettes-chaine-valider">Ajouter</button>' +
    '</div>' +
    '</div>' +
    '</form>';
  
  return html;
}

/* Rendre les favorites */
function renduFavorites() {
  const favs = favoritesRecettes();
  const filtre = filtreRecettes();
  
  if (favs.length === 0) {
    return '<div class="empty">Aucune recette favorite — ajoute-en depuis le menu de la semaine avec le ❤️.</div>';
  }
  
  // Trier par date décroissante
  favs.sort((a, b) => new Date(b.ajoute) - new Date(a.ajoute));
  
  let html = '<div class="recettes-favorites-liste">' +
    favs.map(fav => {
      const recette = fav.recette;
      const raisons = raisonsNonConforme(recette, filtre);
      const badgeContient = raisons.length > 0 
        ? '<span class="badge-contient">⚠️ contient : ' + esc(raisons.join(', ')) + '</span>'
        : '';
      
      return '<div class="recettes-repas recettes-fav" data-id="' + esc(recette.id) + '">' +
        '<span class="recettes-repas-emoji">' + esc(recette.emoji || '') + '</span>' +
        '<span class="recettes-repas-nom">' + esc(recette.nom) + '</span>' +
        '<span class="recettes-repas-ingredients">' + esc((recette.ingredients || []).join(', ')) + '</span>' +
        '<a href="' + esc(urlSure(recette.lien)) + '" target="_blank" rel="noopener">Voir la recette ↗</a>' +
        '<button type="button" class="recette-fav" data-id="' + esc(recette.id) + '" aria-pressed="true">🧡</button>' +
        badgeContient +
        '</div>';
    }).join('') +
    '</div>';
  
  return html;
}

/* Rendu principal */
export function vueRecettes() {
  if (state.activeTab !== 'recettes') return;
  
  let html = '<main class="recettes">';
  
  // Barre de sous-onglets (toujours visible)
  html += '<div class="subtabs recettes-subtabs">' +
    '<button class="subtab' + (state.recettesSub === 'idees' ? ' active' : '') + '" data-sub="idees">💡 Idées recettes</button>' +
    '<button class="subtab' + (state.recettesSub === 'chaines' ? ' active' : '') + '" data-sub="chaines">📺 Chaînes suivies</button>' +
    '<button class="subtab' + (state.recettesSub === 'favorites' ? ' active' : '') + '" data-sub="favorites">❤️ Favorites</button>' +
    '</div>';
  
  // Contenu selon le sous-onglet
  switch (state.recettesSub) {
    case 'chaines':
      html += renduChainesSuivies();
      break;
    case 'favorites':
      html += renduFavorites();
      break;
    default:
      html += renduIdeesRecettes();
  }
  
  html += '</main>';
  
  $('#main').innerHTML = html;
  
  // Wiring des événements
  wiringRecettes();
}

/* --- Wiring des événements --- */

function wiringRecettes() {
  // Sous-onglets
  [...document.querySelectorAll('.recettes-subtabs .subtab, .subtabs .subtab')].forEach(btn => {
    btn.onclick = () => {
      const sub = btn.dataset.sub;
      if (sub) {
        state.recettesSub = sub;
        renderView();
      }
    };
  });
  
  // Filtre - cases à cocher
  [...document.querySelectorAll('.recettes-familles input[type="checkbox"]')].forEach(cb => {
    cb.onchange = () => {
      const filtre = filtreRecettes();
      filtre.familles = filtre.familles || {};
      filtre.familles[cb.dataset.famille] = cb.checked;
      sauvegarderFiltre(filtre);
      // Re-rendre pour mettre à jour les badges
      renderView();
    };
  });
  
  // Filtre - champ libre
  const inputLibre = $('#recettes-libre');
  if (inputLibre) {
    inputLibre.onchange = () => {
      const filtre = filtreRecettes();
      filtre.libre = inputLibre.value;
      sauvegarderFiltre(filtre);
      renderView();
    };
    inputLibre.oninput = inputLibre.onchange;
  }
  
  // Bouton Régénérer la semaine
  const btnRegenerer = $('#recettes-regenerer');
  if (btnRegenerer) {
    btnRegenerer.onclick = () => {
      const filtre = filtreRecettes();
      const nouvelleSemaine = genererSemaine(filtre);
      sauvegarderSemaine(nouvelleSemaine);
      renderView();
    };
  }
  
  // Bouton Réessayer (catalogue vide)
  const btnReessayer = $('#recettes-reessayer');
  if (btnReessayer) {
    btnReessayer.onclick = async () => {
      // Recharger les données
      await chargerDonneesRecettes();
      renderView();
    };
  }
  
  // Boutons ❤️ sur les cartes recettes
  [...document.querySelectorAll('.recette-fav')].forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const recetteId = btn.dataset.id;
      const favs = toggleFavorite(recetteId);
      const estFav = favs.some(f => f.recette.id === recetteId);
      btn.textContent = estFav ? '🧡' : '❤️';
      btn.setAttribute('aria-pressed', estFav ? 'true' : 'false');
      
      // Si on est dans les favorites et qu'on retire, re-rendre
      if (state.recettesSub === 'favorites') {
        renderView();
      }
    };
  });
  
  // Ajouter une chaîne - bouton
  const btnAjoutChaine = $('#recettes-ajout-chaine');
  if (btnAjoutChaine) {
    btnAjoutChaine.onclick = () => {
      $('#recettes-form-chaine').hidden = false;
      btnAjoutChaine.hidden = true;
    };
  }
  
  // Ajouter une chaîne - annuler
  const btnAnnulerChaine = $('#recettes-chaine-annuler');
  if (btnAnnulerChaine) {
    btnAnnulerChaine.onclick = () => {
      $('#recettes-form-chaine').hidden = true;
      if (btnAjoutChaine) btnAjoutChaine.hidden = false;
      // Réinitialiser le formulaire
      $('#recettes-chaine-nom').value = '';
      $('#recettes-chaine-emoji').value = '';
      $('#recettes-chaine-url').value = '';
      $('#recettes-chaine-erreur').hidden = true;
    };
  }
  
  // Ajouter une chaîne - valider
  const btnValiderChaine = $('#recettes-chaine-valider');
  if (btnValiderChaine) {
    btnValiderChaine.onclick = () => {
      const nom = ($('#recettes-chaine-nom').value || '').trim();
      const emoji = $('#recettes-chaine-emoji').value || '';
      const plateforme = $('#recettes-chaine-plateforme').value;
      const url = ($('#recettes-chaine-url').value || '').trim();
      
      const erreur = $('#recettes-chaine-erreur');
      
      if (!nom) {
        if (erreur) { erreur.textContent = 'Le nom est obligatoire.'; erreur.hidden = false; }
        return;
      }
      
      if (!url) {
        if (erreur) { erreur.textContent = 'Le lien est obligatoire.'; erreur.hidden = false; }
        return;
      }
      
      const urlVerifiee = urlSure(url);
      if (urlVerifiee === '#') {
        if (erreur) { erreur.textContent = 'Le lien doit commencer par http:// ou https://'; erreur.hidden = false; }
        return;
      }
      
      const resultat = ajouterChaine(nom, emoji, plateforme, urlVerifiee);
      
      if (!resultat.ok) {
        if (erreur) { erreur.textContent = resultat.message; erreur.hidden = false; }
        return;
      }
      
      // Réinitialiser et re-rendre
      $('#recettes-form-chaine').hidden = true;
      if (btnAjoutChaine) btnAjoutChaine.hidden = false;
      $('#recettes-chaine-nom').value = '';
      $('#recettes-chaine-emoji').value = '';
      $('#recettes-chaine-url').value = '';
      if (erreur) erreur.hidden = true;
      
      renderView();
    };
  }
  
  // Supprimer une chaîne personnelle
  [...document.querySelectorAll('.recettes-chaine-suppr')].forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const chaineId = btn.dataset.id;
      supprimerChaine(chaineId);
      renderView();
    };
  });
}

/* Charger les données recettes et chaines */
async function chargerDonneesRecettes() {
  try {
    const recettes = await (await fetch('data/recettes.json', { cache: 'no-store' })).json();
    const shardsRecettes = await Promise.all((recettes.suite || []).map(u => 
      fetch(u, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ recettes: [] }))
    ));
    state.recettesCatalogue = shardsRecettes.reduce(
      (acc, s) => acc.concat(s.recettes || []),
      recettes.recettes || []
    );
    
    const chaines = await (await fetch('data/chaines.json', { cache: 'no-store' })).json();
    state.chainesBase = chaines.chaines || [];
  } catch (e) {
    console.error('Erreur chargement recettes/chaînes:', e);
  }
}
