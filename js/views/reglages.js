/* views/reglages.js — onglet Réglages (v24) : profil/compte, apparence (thème),
 * ordre des onglets, chapitres suivis, purge, installation.
 * Tout ce qui vivait dans l'ancien panneau flottant est ici, réorganisé,
 * consultable via #reglages (lien partageable, bouton retour fonctionnel).
 * Le bouton 👤 de la barre supérieure y mène directement. */
import { $, state, esc, getStore, setStore, applyTheme, applyTaille, THEMES } from '../core.js';
import { chargerChapitres } from '../feeds.js';
import { renderView } from './common.js';
import { inscrire, connecter, deconnecter, restaurerSession, synchroniserPrefs, envoyerPrefs, abonne, estConnecte, veutResterConnecte } from '../compte.js';

const ORDRE_DEFAUT = ['edition', 'sources', 'articles', 'medias', 'lecture', 'climat', 'archives', 'reglages'];
const NOMS = {
  edition: 'Édition du jour', sources: 'Sources', articles: 'Articles', medias: 'Médias',
  lecture: 'Lecture (WiP)', climat: 'Climat', archives: 'Archives', reglages: 'Réglages'
};

function ordreOnglets() {
  const pref = getStore('ordreOnglets', []);
  return ORDRE_DEFAUT.filter(id => !pref.includes(id)).length === ORDRE_DEFAUT.length - pref.filter(id => ORDRE_DEFAUT.includes(id)).length
    ? pref.filter(id => ORDRE_DEFAUT.includes(id)).concat(ORDRE_DEFAUT.filter(id => !pref.includes(id)))
    : ORDRE_DEFAUT;
}

const MSGS = {
  'existe': 'Un compte existe déjà avec cet e-mail — connecte-toi plutôt.',
  'identifiants': 'E-mail ou mot de passe incorrect.',
  'mdp-court': 'Mot de passe trop court : 6 caractères minimum.',
  'email-invalide': 'Cette adresse e-mail ne semble pas valide.',
  'trop-de-demandes': 'Trop de tentatives — patiente un instant et réessaie.',
  'configuration': 'Service de comptes pas encore configuré (voir README).',
  'reseau': 'Pas de réseau — réessaie quand tu es en ligne.',
  'indisponible': 'Service momentanément indisponible — réessaie plus tard.'
};

export async function vueReglages() {
  const u = abonne();
  const theme = getStore('theme', 'dark');
  $('#view').innerHTML =
    '<section class="reglages">' +
    /* --- Profil / compte --- */
    '<div class="summary-card" id="carte-compte"><h2>👤 Profil</h2><div id="compte-bloc"></div></div>' +
    /* --- Apparence --- */
    '<div class="summary-card"><h2>🎨 Apparence</h2>' +
    '<label class="regl-label">Thème' +
    '<select id="sel-theme">' +
    '<optgroup label="Sobres">' + THEMES.sobres.map(t =>
      '<option value="' + t.id + '"' + (theme === t.id ? ' selected' : '') + '>' + esc(t.nom) + '</option>').join('') +
    '</optgroup>' +
    '<optgroup label="Colorés">' + THEMES.colores.map(t =>
      '<option value="' + t.id + '"' + (theme === t.id ? ' selected' : '') + '>' + esc(t.nom) + '</option>').join('') +
    '</optgroup>' +
    '<optgroup label="Automatique">' + THEMES.auto.map(t =>
      '<option value="' + t.id + '"' + (theme === t.id ? ' selected' : '') + '>' + esc(t.nom) + '</option>').join('') +
    '</optgroup>' +
    '</select></label>' +
    '<label class="regl-label">Taille du texte <span id="taille-val" class="hint"></span>' +
    '<input type="range" id="in-taille" min="0.85" max="1.3" step="0.05" value="' + (getStore('taillePolice', 1)) + '"/>' +
    '</label></div>' +
    /* --- Ordre des onglets --- */
    '<div class="summary-card"><h2>🧭 Ordre des onglets</h2>' +
    '<p class="meta-count">Réorganise la barre des chapitres — tes onglets préférés en premier.</p>' +
    '<ul id="ordre-liste" class="ordre-liste"></ul>' +
    '<button class="btn-sec" id="btn-reset-ordre">Rétablir l\u2019ordre par défaut</button></div>' +
    /* --- Chapitres suivis --- */
    '<div class="summary-card"><h2>🔥 Mes flux suivis</h2>' +
    '<ul id="chapters-editor" class="ordre-liste"></ul>' +
    '<button class="btn-sec" id="btn-reset-chapters">Tout suivre</button></div>' +
    /* --- Maintenance --- */
    '<div class="summary-card"><h2>🧰 Maintenance</h2>' +
    '<button id="btn-purge">Purger le cache</button>' +
    '<button id="btn-install-hint" class="btn-sec">Installer sur iPhone</button>' +
    '<p class="hint">Sur iPhone : bouton Partager ⬆️ puis « Sur l\u2019écran d\u2019accueil ».</p>' +
    '</div></section>';

  $('#sel-theme').onchange = e => { setStore('theme', e.target.value); applyTheme(e.target.value); };
  applyTaille(getStore('taillePolice', 1));
  $('#in-taille').oninput = e => {
    const v = applyTaille(e.target.value);
    setStore('taillePolice', v);
    $('#taille-val').textContent = Math.round(v * 100) + ' %';
  };
  $('#taille-val').textContent = Math.round(getStore('taillePolice', 1) * 100) + ' %';
  rendreOrdre();
  rendreCompte('', null);
  $('#btn-reset-ordre').onclick = () => { setStore('ordreOnglets', ORDRE_DEFAUT); rendreOrdre(); rendreBarre(); };
  $('#btn-reset-chapters').onclick = () => { setStore('masques', {}); rendreChapitres(); chargerChapitres().then(renderView).catch(() => {}); };
  $('#btn-purge').onclick = async () => {
    const b = $('#btn-purge'); b.disabled = true; b.textContent = 'Purge en cours…';
    try { if (window.caches) { const noms = await caches.keys(); await Promise.all(noms.map(n => caches.delete(n))); } } catch (e) { /* rien */ }
    location.reload();
  };
  $('#btn-install-hint').onclick = () => alert('Sur iPhone : bouton Partager ⬆️ en bas de Safari, puis « Sur l\u2019écran d\u2019accueil ». L\u2019app s\u2019ouvrira plein écran, comme une vraie app.');
  rendreChapitres();
}

/* --- Ordre des onglets : ↑ ↓ en place, persisté dans nl.ordreOnglets --- */
function rendreOrdre() {
  const ordre = ordreOnglets();
  $('#ordre-liste').innerHTML = ordre.map((id, i) =>
    '<li><span class="ordre-nom">' + esc(NOMS[id] || id) + '</span><span class="ordre-btns">' +
    '<button class="btn-sec" data-mons="1" data-id="' + id + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
    '<button class="btn-sec" data-moins="1" data-id="' + id + '"' + (i === ordre.length - 1 ? ' disabled' : '') + '>↓</button>' +
    '</span></li>').join('');
  [...document.querySelectorAll('#ordre-liste button')].forEach(b =>
    b.onclick = () => {
      const ordre = ordreOnglets();
      const i = ordre.indexOf(b.dataset.id);
      const j = b.dataset.mons ? i - 1 : i + 1;
      if (j < 0 || j >= ordre.length) return;
      [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
      setStore('ordreOnglets', ordre);
      rendreOrdre(); rendreBarre();
    });
}

function rendreBarre() {
  /* La barre d'onglets est re-rendue par views.js — on repasse par le routeur */
  import('../views.js').then(m => { m.renderTabs(); }).catch(() => {});
}

/* --- Chapitres suivis --- */
function rendreChapitres() {
  const masques = getStore('masques', {});
  $('#chapters-editor').innerHTML = state.chapters.filter(c => c.flux.length).map(c =>
    '<li><span class="ordre-nom">' + esc(c.emoji) + ' ' + esc(c.nom) + '</span>' +
    '<label class="switch"><input type="checkbox" data-id="' + esc(c.id) + '"' + (masques[c.id] ? '' : ' checked') + '/><span>suivi</span></label></li>').join('');
  [...document.querySelectorAll('#chapters-editor input')].forEach(cb =>
    cb.onchange = () => {
      const masq = getStore('masques', {});
      masq[cb.dataset.id] = !cb.checked;
      setStore('masques', masq);
      chargerChapitres().then(renderView).catch(() => {});
    });
}

/* --- Compte : formulaire si déconnecté, e-mail + actions si connecté --- */
function rendreCompte(msg) {
  const bloc = $('#compte-bloc');
  if (!bloc) return;
  const u = abonne();
  if (estConnecte() && u) {
    bloc.innerHTML = '<p class="hint">Connecté : ' + esc(u.email) + '</p>' +
      (msg ? '<p class="hint">' + esc(msg) + '</p>' : '') +
      '<button id="btn-sync-prefs" class="btn-sec">Synchroniser mes préférences</button>' +
      '<button id="btn-logout" class="btn-sec">Se déconnecter</button>';
    $('#btn-logout').onclick = async () => { await deconnecter(); state.compte = null; rendreCompte(''); };
    $('#btn-sync-prefs').onclick = async () => {
      const r = await envoyerPrefs();
      rendreCompte(r.ok ? 'Préférences enregistrées ✓' : 'Sync impossible pour le moment');
    };
  } else {
    bloc.innerHTML =
      '<p class="hint">Un compte enregistre tes médias, revues et réglages — retrouvés sur tous tes appareils. Le site marche aussi très bien sans compte.</p>' +
      '<label class="regl-label">E-mail <input type="email" id="in-email" autocomplete="email" placeholder="toi@exemple.fr"/></label>' +
      '<label class="regl-label">Mot de passe <input type="password" id="in-mdp" autocomplete="new-password" minlength="6" placeholder="6 caractères minimum"/></label>' +
      (msg ? '<p class="hint">' + esc(msg) + '</p>' : '') +
      '<label class="switch" style="margin:10px 0"><input type="checkbox" id="in-souvenir"' + (veutResterConnecte() ? ' checked' : '') + '/><span>Rester connecté sur cet appareil</span></label>' +
      '<button id="btn-inscrire">Créer un compte</button>' +
      '<button id="btn-connecter" class="btn-sec">Se connecter</button>';
    $('#btn-inscrire').onclick = async () => {
      const email = $('#in-email').value.trim();
      const mdp = $('#in-mdp').value;
      if (!email || mdp.length < 6) { rendreCompte('E-mail valide + mot de passe de 6 caractères minimum.'); return; }
      const r = await inscrire(email, mdp);
      if (r.erreur) { rendreCompte(MSGS[r.erreur] || 'Inscription impossible pour le moment.'); return; }
      if (r.confirmation) { rendreCompte('Compte créé ✓ — va vérifier ta boîte mail : un lien de confirmation t\u2019attend.'); return; }
      if (r.session) await connecter(email, mdp, $('#in-souvenir')?.checked);
      await finaliserConnexion();
    };
    $('#btn-connecter').onclick = async () => {
      const r = await connecter($('#in-email').value.trim(), $('#in-mdp').value, $('#in-souvenir')?.checked);
      if (r.erreur) { rendreCompte(MSGS[r.erreur] || 'Connexion impossible pour le moment.'); return; }
      await finaliserConnexion();
    };
  }
}

async function finaliserConnexion() {
  const u = await restaurerSession();
  if (!u) { rendreCompte('Connexion impossible pour le moment.'); return; }
  state.compte = { id: u.id, email: u.email };
  const syn = await synchroniserPrefs();
  rendreCompte(syn.ok ? 'Connecté ✓ — préférences synchronisées.' : 'Connecté ✓');
}
