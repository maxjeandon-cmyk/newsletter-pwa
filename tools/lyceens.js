#!/usr/bin/env node
/* v110 (lot 2) : moisson enrichie — le texte des nouveaux faits prefere la description (apercu) au titre quand elle est plus informative. */
/* v109 (lot 1) : anti-bruit, titre doit matcher le mouvement ; nettoyerTitre applique au representant de groupe, jamais sur les signatures. */
/* tools/lyceens.js — Relevé automatique du mouvement lycéen (onglet ✊ Lycéens 2026).
 * Appelé par tools/maintenance.js à chaque run (toutes les 6 h) : moissonne les
 * flux RSS de la presse française, ne retient que les items du mouvement lycéen
 * (fenêtre de 8 jours), classe chaque item par « camp » (lycéens / gouvernement /
 * neutre) via des marqueurs, et corrobore : une info est « vérifiée » quand au
 * moins deux médias distincts la rapportent. Le relevé est FUSIONNÉ dans
 * data/lyceens.json : les items existants sont mis à jour (corroboration,
 * sources), les nouveaux ajoutés — aucun titre ni texte n'est reformulé, tout
 * est repris verbatim des flux (troncature seulement). Les items neutres
 * non corroborés sont écartés : mieux vaut moins d'infos que du bruit.
 * Aucun flux RSS officiel du gouvernement n'est accessible (Cloudflare) : la
 * « version du gouvernement » est relevée via les dépêches qui rapportent
 * ses déclarations. Écrit data/lyceens.json (network-first, pas de bump CACHE).
 * Sortie stdout : JSON { date, modifie, nouvelles, fusionnees, par_camp, echecs }
 * pour maintenance.js. Aucune dépendance : fetch natif (Node >= 18). */
'use strict';

const fs = require('fs');
const path = require('path');
const { nettoyerTitre } = require('./titres.js');

const FICHIER = path.join(__dirname, '..', 'data', 'lyceens.json');
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const FENETRE_JOURS = 8;   /* fenêtre de fraîcheur des items retenus */
const GARDE_JOURS = 30;    /* les items plus vieux que ça quittent le relevé */
const CAPS = { version_gouvernement: 12, faits: 10 };

/* Flux RSS vérifiés (catalogue data/flux-rss.json, testés le 04/10/2026).
 * camp: 'presse' — la classification vient des mots du titre/description,
 * pas de l'origine (AFP relaie les deux versions). */
const SOURCES = [
  { id: '20-minutes', nom: '20 minutes', url: 'https://www.20minutes.fr/feeds/rss-une.xml' },
  { id: 'europe-1', nom: 'Europe 1', url: 'https://www.europe1.fr/rss.xml' },
  { id: 'public-senat', nom: 'Public Sénat', url: 'https://www.publicsenat.fr/rss' },
  { id: 'le-figaro', nom: 'Le Figaro', url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
  { id: 'bfm-tv', nom: 'BFMTV', url: 'https://www.bfmtv.com/rss/news-24-7/' },
  { id: 'france-tv-info', nom: 'franceinfo', url: 'https://www.francetvinfo.fr/france.rss' },
  { id: 'france-info', nom: 'France Inter', url: 'https://radiofrance.fr/franceinfo/rss' },
  { id: 'france-24', nom: 'France 24', url: 'https://www.france24.com/fr/rss' },
  { id: 'rfi', nom: 'RFI', url: 'https://www.rfi.fr/fr/rss' },
  { id: 'ouest-france', nom: 'Ouest-France', url: 'https://www.ouest-france.fr/rss.xml' },
  { id: 'la-croix', nom: 'La Croix', url: 'https://www.la-croix.com/rss.xml' },
  { id: 'l-humanite', nom: "L'Humanité", url: 'https://www.humanite.fr/feed' },
  { id: 'mediapart', nom: 'Mediapart', url: 'https://www.mediapart.fr/articles/feed' },
  { id: 'liberation', nom: 'Libération', url: 'https://www.liberation.fr/arc/outboundfeeds/rss-all/' }
];

/* ————— Texte : entités, normalisation, racines ————— */
const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ocirc: 'ô', ucirc: 'û',
  icirc: 'î', acirc: 'â', ugrave: 'ù', ccedil: 'ç', euml: 'ë', oacute: 'ó',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  hellip: '…', mdash: '—', ndash: '–', deg: '°', euro: '€'
};
function decoder(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (ENTITES[n.toLowerCase()] !== undefined ? ENTITES[n.toLowerCase()] : m));
}
const sansCdata = s => String(s || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
const texte = s => decoder(sansCdata(String(s || '')).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
/* Normalisation : minuscules, sans accents — pour les marqueurs et racines. */
const norm = s => texte(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/* Racines discriminantes : le vocabulaire du SUJET (lycées, blocus,
 * manifestation, gouvernement…) est commun à presque tous les items du
 * mouvement — comparer dessus fusionnerait des événements distincts.
 * On ne compare donc que les racines HORS sujet, tronquées à 8 caractères. */
const STOP = new Set([
  'lycee', 'lyceen', 'lyceens', 'eleve', 'eleves', 'blocus', 'blocage', 'blocages',
  'etablissem', 'manifesta', 'mobilisa', 'mouvement', 'national', 'education',
  'enseigna', 'professeu', 'ministre', 'gouvernem', 'interieu', 'prefectu',
  'rectorat', 'violenc', 'france', 'paris', 'video', 'videos', 'direct',
  'apres', 'selon', 'contre', 'actu', 'actus', 'info', 'jeunesse', 'jeunes',
  /* prénoms et mots du cadre politique : trop communs pour discriminer */
  'emmanuel', 'jean', 'luc', 'gabriel', 'edouard', 'sebastien', 'laurent',
  'fabien', 'pouria', 'raphael', 'bruno', 'yaell', 'president', 'premier',
  'candidat', 'presidentielle', 'campagne', 'election', 'bonjour', 'chez', 'vous'
]);
const racines = s => {
  const vues = new Set();
  for (const m of norm(s).split(/[^a-z0-9]+/)) {
    if (m.length >= 4 && !/^\d+$/.test(m)) vues.add(m.slice(0, 8));
  }
  return vues;
};
const racinesDisc = s => {
  const vues = new Set();
  for (const r of racines(s)) if (!STOP.has(r)) vues.add(r);
  return vues;
};
/* Chiffres significatifs d'un texte (1.747 et 1 747 donnent 1747) — les
 * années (19xx-20xx) sont exclues : présentes partout, elles ne discriminent
 * aucun événement. */
const chiffres = s => {
  const t = norm(s).replace(/(\d)[\s.,](\d)/g, '$1$2');
  return new Set((t.match(/\d{2,}/g) || []).filter(n => +n < 1900 || +n > 2100));
};
/* Deux TITRES racontent le même événement si :
 *  - ils partagent un chiffre significatif ET une racine discriminante, ou
 *  - au moins 3 racines discriminantes communes.
 * Garde-fous : deux items datés de plus de 3 jours d'écart ne décrivent
 * jamais le même événement ; et on ne compare QUE les titres — les
 * descriptions des dépêches syndiquées portent toutes le même paragraphe
 * de contexte (chiffres du bilan national), qui fusionnerait des
 * événements sans rapport. */
function memeEvenement(texteA, texteB, dateA, dateB) {
  const da = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(dateA || ''));
  const db = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(dateB || ''));
  if (da && db) {
    const ta = new Date(+da[3], +da[2] - 1, +da[1]).getTime();
    const tb = new Date(+db[3], +db[2] - 1, +db[1]).getTime();
    if (Math.abs(ta - tb) > 3 * 86400000) return false;
  }
  const ra = racinesDisc(texteA), rb = racinesDisc(texteB);
  let communes = 0;
  for (const r of ra) if (rb.has(r)) communes++;
  if (communes >= 3) return true;
  if (communes >= 1) {
    const ca = chiffres(texteA), cb = chiffres(texteB);
    for (const n of ca) if (cb.has(n)) return true;
  }
  return false;
}

/* Le mouvement : un item est retenu s'il parle de lycéens/lycées/blocus,
 * ou de Parcoursup, ou de Geffray/Lecornu en matière d'éducation. */
const RE_MOUVEMENT = /lyceen|lycee|blocus|blocage|parcoursup|acte deux/i;
const RE_GOUV_EDUC = /(geffray|lecornu).{0,60}(education|lyce|enseign|ecole)|((education|lyce|enseign|ecole).{0,60}(geffray|lecornu))/i;
const estMouvement = (t, d) => {
  const s = norm(t + ' ' + d);
  /* v109 (lot 1) : anti-bruit -- le TITRE doit matcher, la description ne suffit
   * plus seule (cas reels : « Guerre au Moyen-Orient », « Australie : mine de
   * charbon » passaient parce que seule la description mentionnait le mouvement).
   * La description ne peut que conforter via RE_GOUV_EDUC quand le titre parle
   * deja d education (geffray/lecornu), jamais declencher seule. */
  if (RE_MOUVEMENT.test(norm(t))) return true;
  if (RE_GOUV_EDUC.test(norm(t))) return true;
  return false;
};
/* Anti-bruit : résultats sportifs ou sujets scolaires hors mouvement,
 * et titres d'émissions/débats (le sujet y est commenté, pas rapporté). */
const RE_BRUIT = /(football|rugby|basket|handball|volley|cross|championnat|brevet des colleges|bac de francai)/i;
const RE_EMISSION = /(bonjour chez vous|l.heure des pros|edition speciale|grand entretien|la revue de presse|le direct|replay|podcast|l.interview)/i;
const estBruit = (t, d) => {
  const s = norm(t + ' ' + d);
  if (RE_EMISSION.test(norm(t))) return true;
  return RE_BRUIT.test(s) && !/(blocus|blocage|manifestation|interpellation|mobilisation|geffray|lecornu)/.test(s);
};

/* Marqueurs de camp, par ACTEURS (chaînes normales, sans accents) : un item
 * rejoint un camp si un acteur de ce camp y parle — pas parce qu'il parle
 * du sujet (les éditoriaux et sondages parlent du sujet sans être une
 * version de qui que ce soit : ils restent neutres, et seuls les neutres
 * CORROBORÉS entrent dans « faits »). */
const PERSONNES_GOUV = ['macron', 'geffray', 'lecorno', 'nunez', 'attal', 'retailleau', 'darmanin', 'pecresse'];
const MOTS_GOUV = ['geffray', 'lecorno', 'matignon', 'macron', 'gouvernement', 'ministre', 'ministere', 'rectorat', 'prefecture', 'prefet', 'elysee', 'attal', 'retailleau', 'nunez', 'darmanin', 'place beauvau', 'interieur', 'academie', 'budget', 'plateforme', 'cellule'];
const MOTS_LYC = ['revendication', 'revendiquent', 'appellent', 'appelent', 'syndicat', 'etudiant', 'unl', 'fidl', 'mnl', 'greve', 'exigent', 'demandent'];
function camp(texteComplet) {
  const s = norm(texteComplet);
  if (PERSONNES_GOUV.some(p => s.includes(p)) || MOTS_GOUV.some(m => s.includes(m))) return 'gouvernement';
  if (MOTS_LYC.some(m => s.includes(m))) return 'lyceens';
  return 'neutre';
}

/* ————— Moisson RSS ————— */
async function moissonSource(src) {
  const lire = async url => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally { clearTimeout(t); }
  };
  let xml;
  try { xml = await lire(src.url); }
  catch (e) {
    try { xml = await lire(src.url); } /* une seule tentative de plus */
    catch (e2) { throw new Error(src.nom + ' : ' + (e2.message || e.message)); }
  }
  const items = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const bloc = m[0];
    const p = balise => {
      const b = new RegExp('<' + balise + '[^>]*>([\\s\\S]*?)</' + balise + '>', 'i').exec(bloc);
      return b ? sansCdata(b[1]) : '';
    };
    const titre = texte(p('title'));
    if (!titre) continue;
    const lien = texte(p('link') || (/<link[^>]*href="([^"]+)"/.exec(bloc) || [])[1] || '');
    const description = texte(p('description') || p('summary'));
    const dateBrute = texte(p('pubDate') || p('updated') || p('published'));
    items.push({ titre, lien, description, dateBrute });
  }
  return items;
}

/* ————— Groupes de corroboration : un item rejoint un groupe s'il
 * raconte le même événement qu'UN QUELCONQUE de ses membres (comparaison
 * item à item, jamais contre l'union des racines du groupe — sinon les
 * racines s'accumulent et finissent par tout fusionner). ————— */
function construireGroupes(items) {
  const groupes = [];
  for (const it of items) {
    const plein = it.titre;
    let g = null;
    for (const cand of groupes) {
      if (cand.items.some(m => memeEvenement(m.titre, plein, m.date, it.date))) { g = cand; break; }
    }
    if (!g) { g = { items: [] }; groupes.push(g); }
    g.items.push(it);
  }
  return groupes;
}

/* ————— Fusion dans data/lyceens.json ————— */
const dateFr = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(iso ? new Date(iso) : new Date());
const heureFr = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date());
const tronc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const numeroDate = s => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''));
  return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 99999999;
};
const vieux = (s, jours) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''));
  if (!m) return false;
  return Date.now() - new Date(+m[3], +m[2] - 1, +m[1]).getTime() > jours * 86400000;
};

const INTRO_DEFAUT = "Mouvement lycéen et étudiant : blocus des lycées, revendications sur les moyens de l'éducation, réponse du gouvernement. Deux relevés ici : ce que dit le gouvernement, et les seules informations corroborées par plusieurs médias indépendants. La parole des élèves vit dans la chronique « Version des étudiants ».";
const NOTE_DEFAUT = "Badge ✅ vérifié : information corroborée par au moins deux médias indépendants. Badge ⚠️ non vérifié : une seule source à ce stade — une piste, pas un fait. Les déclarations sont attribuées à leurs auteurs, jamais reformulées.";

async function main() {
  const aujourdhui = dateFr();
  /* Moisson parallèle : chaque flux est indépendant, un échec n'en arrête aucun. */
  const recoltes = await Promise.allSettled(SOURCES.map(moissonSource));
  const echecs = recoltes.filter(r => r.status === 'rejected').map(r => String(r.reason.message).slice(0, 120));
  const parMedia = new Map();
  let moissonnes = 0;
  recoltes.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const nom = SOURCES[i].nom;
    const vus = new Set();
    for (const it of r.value) {
      if (!estMouvement(it.titre, it.description) || estBruit(it.titre, it.description)) continue;
      const d = it.dateBrute ? new Date(it.dateBrute) : new Date();
      if (isNaN(d) || Date.now() - d.getTime() > FENETRE_JOURS * 86400000 || d.getTime() - Date.now() > 2 * 86400000) continue;
      const cle = norm(it.titre).slice(0, 80);
      if (vus.has(cle)) continue;   /* doublon interne au même média */
      vus.add(cle);
      if (!parMedia.has(nom)) parMedia.set(nom, []);
      parMedia.get(nom).push({ ...it, date: dateFr(isNaN(d) ? null : d.toISOString()) });
      moissonnes++;
    }
  });
  const items = [...parMedia.entries()].flatMap(([media, liste]) => liste.map(it => ({ ...it, media })));
  if (!moissonnes) {
    if (echecs.length >= SOURCES.length) {
      process.stdout.write(JSON.stringify({ date: aujourdhui, modifie: false, erreur: 'aucun flux accessible' }) + '\n');
      return;
    }
  }

  /* Groupes de corroboration, puis classement. Le représentant d'un groupe
   * est le titre le plus « central » (médoïde : celui qui partage le plus
   * de racines avec les autres membres) — jamais un titre d'émission ; la
   * date du groupe est la plus récente de ses couvertures. */
  const groupes = construireGroupes(items).map(g => {
    let mieux = g.items[0], score = -1;
    for (const cand of g.items) {
      const rc = racinesDisc(cand.titre);
      let sc = 0;
      for (const autre of g.items) {
        if (autre === cand) continue;
        const ra = racinesDisc(autre.titre);
        for (const r of rc) if (ra.has(r)) sc++;
      }
      if (sc > score || (sc === score && cand.titre.length > mieux.titre.length)) { score = sc; mieux = cand; }
    }
    const dateGroupe = g.items.map(i => i.date).sort((a, b) => numeroDate(b) - numeroDate(a))[0];
    const mediasG = [...new Set(g.items.map(i => i.media))];
    return {
      titre: tronc(nettoyerTitre(mieux.titre), 120),
      /* v110 (lot 2) : le texte prend la description (apercu) des qu elle est
       * plus longue que le titre — plus informative — sinon le titre. */
      texte: tronc(mieux.description && mieux.description.length > mieux.titre.length ? mieux.description : mieux.titre, 200),
      date: dateGroupe,
      url: mieux.lien || (g.items.find(i => i.lien) || {}).lien || '',
      medias: mediasG,
      verifie: mediasG.length >= 2,
      camp: camp(mieux.titre + ' ' + mieux.description)
    };
  });

  /* État existant : on préserve tout ce qui n'est pas une liste d'items. */
  let etat = { maj: aujourdhui + ' ' + heureFr(), titre: 'Révolte lycéenne — France 2026', intro: INTRO_DEFAUT, note: NOTE_DEFAUT, contexte: [], version_gouvernement: [], faits: [] };
  if (fs.existsSync(FICHIER)) {
    try {
      const lu = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
      for (const k of ['maj', 'titre', 'intro', 'note', 'prochaine_echeance', 'contexte']) {
        if (lu[k] !== undefined) etat[k] = lu[k];
      }
      for (const k of ['version_gouvernement', 'faits']) {
        if (Array.isArray(lu[k])) etat[k] = lu[k];
      }
    } catch (e) { /* fichier illisible : on repart des listes vides */ }
  }

  const toutes = [...etat.version_gouvernement, ...etat.faits];
  const proches = g => toutes.filter(e =>
    memeEvenement((e.titre || '') + ' ' + (e.texte || ''), g.titre, e.date, g.date));

  let nouvelles = 0, fusionnees = 0;
  const parCamp = { gouvernement: 0, faits: 0 };
  for (const g of groupes) {
    const existants = proches(g);
    if (existants.length) {
      /* Mise à jour : corroboration, sources, lien — sans dupliquer et
       * SANS toucher au texte existant (la curation est vérifiée à la
       * main ; le badge suit l'union des médias distincts). */
      for (const e of existants.slice(0, 1)) {
        const unionSources = [...new Set([...(e.sources || (e.source ? [e.source] : [])), ...g.medias])].slice(0, 6);
        e.sources = unionSources;
        e.source = unionSources.join(' / ');
        e.verifie = !!e.verifie || g.verifie || unionSources.length >= 2;
        if (!e.url && g.url) e.url = g.url;
        if (!e.texte) e.texte = g.texte;
      }
      fusionnees++;
      continue;
    }
    /* Nouveau : seuls les items CORROBORÉS entrent (le sous-onglet
     * « Faits vérifiés uniquement » n'accepte que du corroboré ; le
     * camp « lyceens » n'a plus sa liste propre — la parole des élèves
     * vit dans la chronique « Version des étudiants », ses items
     * corroborés rejoignent les faits comme les neutres). */
    if (!g.verifie) continue;
    const item = {
      id: 'a' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      date: g.date,
      titre: g.titre,
      texte: g.texte,
      source: g.medias.join(' / '),
      sources: g.medias,
      url: g.url || null,
      verifie: g.verifie
    };
    const cible = g.camp === 'gouvernement' ? 'version_gouvernement' : 'faits';
    etat[cible].push(item);
    parCamp[g.camp === 'gouvernement' ? 'gouvernement' : 'faits']++;
    nouvelles++;
  }

  /* Nettoyage : fenêtre de garde, caps, tri du plus récent au plus ancien.
   * Les items curatés à la main (id sans préfixe « a ») sont épinglés :
   * le flux 6 h remplit les slots restants sans jamais les évincer. */
  for (const k of ['version_gouvernement', 'faits']) {
    etat[k] = etat[k].filter(i => !vieux(i.date, GARDE_JOURS));
    const curats = etat[k].filter(i => !String(i.id || '').startsWith('a'));
    const autos = etat[k].filter(i => String(i.id || '').startsWith('a'))
      .sort((a, b) => numeroDate(b.date) - numeroDate(a.date))
      .slice(0, Math.max(0, CAPS[k] - curats.length));
    etat[k] = curats.concat(autos).sort((a, b) => numeroDate(b.date) - numeroDate(a.date));
  }

  /* « Modifié » = le fichier produit diffère du fichier précédent (hors
   * horodatage) : la maintenance ne publie que si quelque chose a vraiment
   * bougé — pas de commit fantôme toutes les 6 h. */
  const precedentBrut = fs.existsSync(FICHIER) ? fs.readFileSync(FICHIER, 'utf8') : '';
  let idsPrecedents = new Set();
  try {
    const precedent = JSON.parse(precedentBrut);
    for (const k of ['version_gouvernement', 'faits']) {
      (precedent[k] || []).forEach(i => idsPrecedents.add(i.id));
    }
  } catch (e) { /* pas de fichier précédent lisible */ }
  const nouvellesUtile = [...etat.version_gouvernement, ...etat.faits]
    .filter(i => String(i.id || '').startsWith('a') && !idsPrecedents.has(i.id)).length;
  const corpsSansMaj = JSON.stringify({ ...etat, maj: '' }, null, 2);
  const precedentSansMaj = (() => {
    try { return JSON.stringify({ ...JSON.parse(precedentBrut), maj: '' }, null, 2); }
    catch (e) { return null; }
  })();
  const modifie = precedentSansMaj === null || corpsSansMaj !== precedentSansMaj;
  if (modifie) {
    etat.maj = aujourdhui + ' ' + heureFr();
    fs.writeFileSync(FICHIER, JSON.stringify(etat, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify({
    date: aujourdhui,
    modifie,
    nouvelles: nouvellesUtile,
    fusionnees,
    moissonnes,
    par_camp: parCamp,
    total: etat.version_gouvernement.length + etat.faits.length,
    echecs
  }) + '\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
