#!/usr/bin/env node
/* tools/feedback.js — Résumé dynamique des messages de feedback (v88).
 * Étape 1 de l'agent de maintenance (tools/maintenance.js) : ce script
 * lit le résumé global persistant (data/feedback.json), récupère les
 * NOUVEAUX messages Supabae (watermark du dernier traité) et les FUSIONNE :
 * chaque message enrichit un thème existant (mots-clés communs) ou crée le
 * sien, et ses intentions (demande, problème, encouragement, question)
 * sont comptées au fil de l'eau — le résumé évolue, il ne se remplace pas.
 * Les demandes extraites des messages vivent dans « en_attente » ; quand un
 * commit du dépôt les réalise (rapprochement par mots-clés sur les commits
 * des 14 derniers jours), elles passent dans « mises_en_place » et quittent
 * le résumé — au fur et à mesure des mises en place réelles.
 * STRICTEMENT factuel : thèmes par mots fréquents, comptages exacts,
 * demandes citées verbatim tronquées. Rien n'est inventé ni reformulé.
 * Écrit data/feedback.json (network-first : effet immédiat, pas de bump CACHE)
 * et imprime un JSON de pilotage sur stdout pour maintenance.js.
 * Aucune dépendance : fetch natif (Node >= 18).
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE, GITHUB_REPOSITORY (optionnel). */
'use strict';

const fs = require('fs');
const path = require('path');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const REPO = process.env.GITHUB_REPOSITORY || 'maxjeandon-cmyk/newsletter-pwa';
const FICHIER = path.join(__dirname, '..', 'data', 'feedback.json');

/* ————— Outils texte : normalisation, racines, intentions ————— */

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, ' ').replace(/[^a-z0-9?!]+/g, ' ').replace(/\s+/g, ' ').trim();
const racine = w => (w.length > 7 ? w.slice(0, 7) : w);

const MOTS_VIDES = new Set(('le la les un une des de du au aux et ou mais donc or ni car que qui quoi dont a en dans sur pour par avec sans sous plus moins pas tres trop est sont etre avoir fait faire ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles se ne y cest dun dune sil jai aussi alors quand puis parce comme bien faut soit g j c n s l d qu m t')
  .split(' ').map(racine));

const MARQUEURS = {
  problemes: ['marche pas', 'pa march', 'bug', 'panne', 'plante', 'crash', 'erreur', 'casse', 'lent', 'lenteur', 'bloque', 'probleme', 'introuvable', 'impossible', 'blanc', 'galere', 'pas genial', 'pa genial', 'pas super', 'pa super', 'complique', 'pas trouve', 'pa trouve', 'trouve pas'],
  demandes: ['peux tu', 'peut etre', 'pourrait', 'pourrais', 'serait bien', 'faudrait', 'il faudrait', 'ajoute', 'ajouter', 'supprime', 'supprimer', 'renomme', 'renommer', 'change', 'changer', 'modifie', 'modifier', 'nettoyer', 'enleve', 'enlever', 'ameliorer', 'optimiser', 'automatise', 'automatiser', 'voudrais', 'aimerais', 'idee', 'possible de', 'mets', 'rajoute', 'rajouter', 'retire', 'retirer', 'remplace', 'remplacer', 'corrige', 'corriger'],
  satisfactions: ['super', 'genial', 'top', 'bravo', 'cool', 'adore', 'aime', 'merci', 'bien joue', 'parfait', 'nickel', 'excellent', 'reussi', 'magnifique', 'tres bien', 'tres bon'],
  questions: ['comment', 'pourquoi', 'est ce que', 'quelle', 'quel', 'quand', 'combien', 'ou trouver', 'ou est']
};

/* Intentions d'un message : chaque marqueur trouvé compte une intention,
 * sauf précédé d'une négation proche (« pas génial » reste un problème). */
const NEGATION = /(?:^|\s)(pas|pa|aucun|jamais|rien|n)\s/;
function intentionsMessage(n) {
  const res = new Set();
  for (const [nom, mots] of Object.entries(MARQUEURS)) {
    for (const m of mots) {
      let i = n.indexOf(m);
      while (i !== -1) {
        const avant = n.slice(Math.max(0, i - 12), i);
        if (!NEGATION.test(avant)) res.add(nom);
        i = n.indexOf(m, i + 1);
      }
    }
  }
  if (/\?\s*$/.test(n)) res.add('questions');
  return res;
}

/* Racines significatives d'un texte normalisé. */
function racines(n) {
  const vus = new Set();
  for (const mot of n.split(' ')) {
    if (mot.length < 4 || MOTS_VIDES.has(racine(mot)) || MOTS_VIDES.has(mot)) continue;
    vus.add(racine(mot));
  }
  return [...vus];
}

const condenser = (t, max = 140) => { const s = (t || '').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max) + '…' : s; };

/* Phrase-demande : la première phrase contenant un marqueur de demande,
 * sinon le message condensé. Citation verbatim tronquée (factuel). */
function phraseDemande(message, n) {
  const phrases = message.split(/[.!?]/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const p of phrases) {
    if (MARQUEURS.demandes.some(m => norm(p).includes(m))) return condenser(p);
  }
  return condenser(message);
}

const dateFr = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date(iso || Date.now()));

/* ————— Fusion des thèmes (mots-clés communs) ————— */

/* Deux textes se rapprochent à partir de 2 racines communes
 * (1 suffit si l'un des deux en a très peu). */
function rapprocher(r1, r2) {
  const shared = r1.filter(x => r2.includes(x)).length;
  return shared >= 2 || (shared >= 1 && r2.length <= 2);
}

function fusionThemes(themes, message, n, intents) {
  const rs = racines(n);
  let theme = rs.length ? themes.find(t => rapprocher(Object.keys(t.racines), rs)) : null;
  if (rs.length && !theme) {
    theme = { label: '', messages: 0, intentions: {}, racines: {} };
    themes.push(theme);
  }
  if (theme) {
    theme.messages += 1;
    for (const r of rs) theme.racines[r] = (theme.racines[r] || 0) + 1;
    for (const i of intents) theme.intentions[i] = (theme.intentions[i] || 0) + 1;
  }
  /* Absorption : deux thèmes qui partagent 2 racines ne font qu'un. */
  for (let i = 0; i < themes.length; i++) {
    for (let j = themes.length - 1; j > i; j--) {
      if (rapprocher(Object.keys(themes[i].racines), Object.keys(themes[j].racines))) {
        themes[i].messages += themes[j].messages;
        for (const [r, c] of Object.entries(themes[j].racines)) themes[i].racines[r] = (themes[i].racines[r] || 0) + c;
        for (const [k, c] of Object.entries(themes[j].intentions)) themes[i].intentions[k] = (themes[i].intentions[k] || 0) + c;
        themes.splice(j, 1);
      }
    }
  }
}

/* Le libellé d'un thème suit ses racines les plus fréquentes (dynamique). */
function themeLabel(theme) {
  if (!theme) return;
  const top = Object.entries(theme.racines).sort((a, b) => b[1] - a[1]);
  if (top.length) theme.label = top.slice(0, 3).map(e => e[0]).join(' ');
  const triees = {};
  for (const [r, c] of top.slice(0, 20)) triees[r] = c;
  theme.racines = triees;
}

/* ————— Demandes : extraction, fusion, passage en « mise en place » ————— */

function fusionDemande(enAttente, texte, n, cree) {
  const rs = racines(n);
  const existante = enAttente.find(d => rapprocher(racines(norm(d.texte)), rs));
  if (existante) {
    existante.messages += 1;
    if (new Date(cree) < new Date(existante.cree)) {
      existante.cree = cree; existante.depuis = dateFr(cree); existante.texte = texte;
    }
    return existante;
  }
  const d = { id: 'd' + Date.now().toString(36) + '-' + enAttente.length, texte, depuis: dateFr(cree), cree, messages: 1 };
  enAttente.push(d);
  return d;
}

/* Rapprochement demande ↔ commit : préfixes de racines (5 lettres —
 * « nettoyer » rejoint « nettoyage »), au moins 2 racines partagées dont
 * le verbe d'action de la demande (sauf évidence large : 3 racines).
 * Prudent : au doute, la demande reste en attente (un déplacement reste
 * visible et corrigeable à la main dans data/feedback.json). */
const memePrefixe = (a, b) => a.slice(0, 5) === b.slice(0, 5);
function commitRealise(nCommit, nDemande) {
  const rc = racines(nCommit);
  const rd = racines(nDemande);
  const shared = rd.filter(r => rc.some(c => memePrefixe(r, c)));
  if (shared.length < 2) return false;
  const verbeAction = rd.length > 0 && rc.some(c => memePrefixe(rd[0], c));
  return verbeAction || shared.length >= 3;
}

/* Commits récents (14 jours) — repo public, pas de jeton nécessaire. */
async function commitsRecents() {
  try {
    const depuis = new Date(Date.now() - 14 * 24 * 3600e3).toISOString();
    const r = await fetch('https://api.github.com/repos/' + REPO + '/commits?since=' + depuis + '&per_page=100', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'newsletter-maintenance' }
    });
    if (!r.ok) return [];
    const js = await r.json();
    return (Array.isArray(js) ? js : []).map(c => ({
      sha: (c.sha || '').slice(0, 7),
      date: c.commit ? c.commit.author.date : '',
      message: c.commit ? c.commit.message.split('\n')[0] : ''
    })).filter(c => c.message && !/^(resume feedback|releves ong|rapport de maintenance|icones png|maintenance :)/i.test(norm(c.message)));
  } catch (e) { return []; }
}

/* Les demandes réalisées par un commit quittent l'attente pour
 * « mises en place » — elles quittent donc le résumé au fur et à mesure. */
async function deplacerRealisees(etat, journal) {
  if (!etat.en_attente || !etat.en_attente.length) return;
  const commits = await commitsRecents();
  if (!commits.length) return;
  const restantes = [];
  for (const d of etat.en_attente) {
    const c = commits.find(c => commitRealise(norm(c.message), norm(d.texte)));
    if (c) {
      etat.mises_en_place.unshift({
        id: d.id, texte: d.texte, depuis: d.depuis,
        realise: dateFr(c.date), via: c.sha + ' — ' + condenser(c.message, 80),
        rappels: d.rappels || 0
      });
      journal.push({ demande: condenser(d.texte, 80), via: c.sha + ' — ' + condenser(c.message, 80) });
    } else {
      restantes.push(d);
    }
  }
  etat.en_attente = restantes;
}

/* ————— Récupération Supabase ————— */

/* v88 : un horodatage Postgres revient avec un décalage « +00:00 ». Concatené
 * tel quel dans l'URL (created_at=gt.…+00:00), le « + » était décodé en
 * ESPACE par le serveur : Postgres rejetait « …695113 00:00 » (code 22007,
 * invalid input syntax for type timestamp with time zone) et CHAQUE run de
 * maintenance échouait sur la récupération du feedback (cas observé du 04 au
 * 05/10/2026 — l'erreur était persistante, pas transitoire). On encode
 * désormais la valeur dans l'URL, et on assainit les formes douteuses au
 * passage : suffixe « espace + HH:MM » (le décalage cassé tel qu'interprété
 * par le serveur) remis en forme, absence de zone = UTC (les created_at
 * Supabase sont en UTC). */
function horodatageValide(v) {
  let s = String(v || '').trim();
  s = s.replace(/\s+(\d{2}):(\d{2})$/, '+$1:$2'); /* « … 00:00 » → « …+00:00 » */
  if (!/[Zz]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
  return s;
}

async function apiSupabase(url) {
  const r = await fetch(url, { headers: { apikey: KEY, authorization: 'Bearer ' + KEY } });
  /* Le corps d'erreur aide au diagnostic (jeton expiré, projet erroné…) sans jamais contenir la clé. */
  if (!r.ok) throw new Error('Supabase ' + r.status + ' : ' + (await r.text()).slice(0, 200));
  return r.json();
}

/* ————— Main ————— */

async function main() {
  if (!URL || !KEY) {
    console.error('Il manque SUPABASE_URL ou SUPABASE_SERVICE_ROLE.');
    process.exit(1);
  }
  const base = URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

  let etat = { total: 0, watermark: '', themes: [], en_attente: [], mises_en_place: [], intentions: {} };
  try {
    const lu = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
    etat = {
      total: lu.total || 0,
      watermark: lu.watermark || '',
      themes: Array.isArray(lu.themes) ? lu.themes : [],
      en_attente: Array.isArray(lu.en_attente) ? lu.en_attente : [],
      mises_en_place: Array.isArray(lu.mises_en_place) ? lu.mises_en_place : [],
      intentions: lu.intentions || {}
    };
  } catch (e) { /* premier run : résumé global vierge */ }

  /* Nouveaux messages seulement (watermark = dernier created_at traité). */
  const filtre = etat.watermark ? '&created_at=gt.' + encodeURIComponent(horodatageValide(etat.watermark)) : '';
  const q = 'select=id,message,created_at&order=created_at.asc&limit=500' + filtre;
  const messages = (await apiSupabase(base + '/rest/v1/feedback?' + q)) || [];

  for (const m of messages) {
    const n = norm(m.message);
    const intents = intentionsMessage(n);
    etat.total += 1;
    for (const i of intents) etat.intentions[i] = (etat.intentions[i] || 0) + 1;
    fusionThemes(etat.themes, m.message, n, intents);
    /* Une demande devient un suivi ; une demande déjà réalisée est un rappel. */
    if (intents.has('demandes')) {
      const texte = phraseDemande(m.message, n);
      const dejaLa = etat.mises_en_place.find(mp => rapprocher(racines(norm(mp.texte)), racines(norm(texte))));
      if (dejaLa) dejaLa.rappels = (dejaLa.rappels || 0) + 1;
      else fusionDemande(etat.en_attente, texte, n, m.created_at);
    }
  }

  const journal = [];
  await deplacerRealisees(etat, journal);

  for (const t of etat.themes) themeLabel(t);
  etat.themes.sort((a, b) => b.messages - a.messages);
  etat.themes = etat.themes.slice(0, 10);
  etat.en_attente.sort((a, b) => new Date(a.cree) - new Date(b.cree));
  etat.mises_en_place.sort((a, b) => new Date(b.realise) - new Date(a.realise));
  etat.mises_en_place = etat.mises_en_place.slice(0, 50);

  if (messages.length) {
    /* v88 : on ne stocke que des horodatages ISO propres (voir horodatageValide). */
    etat.watermark = horodatageValide(messages[messages.length - 1].created_at);
  }
  etat.date = dateFr();
  etat.heure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date());

  fs.writeFileSync(FICHIER, JSON.stringify(etat, null, 2) + '\n');
  process.stdout.write(JSON.stringify({
    total: etat.total,
    nouveaux: messages.length,
    themes: etat.themes.length,
    en_attente: etat.en_attente.length,
    mises_en_place: etat.mises_en_place.length,
    deplacees: journal
  }) + '\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
