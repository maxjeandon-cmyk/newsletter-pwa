#!/usr/bin/env node
/* tools/etudiants.js — Relevé automatique 6 h de la chronique « Version des étudiants »
 * (onglet ✊ Lycéens 2026, sous-onglet Version des étudiants).
 * Appelé par tools/maintenance.js à chaque run (3 h, 9 h, 15 h, 21 h Paris) :
 *   1. Moissonne les flux RSS de la presse (même catalogue que lyceens.js)
 *      et ne retient que les items du mouvement lycéen/étudiant.
 *   2. Construit UN paragraphe « relevé automatique » NARRATIF pour les
 *      dernières 6 h : accroche temporelle + dateline + items regroupés en
 *      volets avec entames tournantes. Les titres restent la matière
 *      première (verbatim, tronqués), jamais reformulés — la rédaction
 *      narrative enrichie reste le travail des éditions de la newsletter.
 *      Champ "auto": true dans le paragraphe.
 *   3. Ajoute le paragraphe au dernier chapitre de data/etudiants/chapitres/ ;
 *      si ce chapitre dépasse 28 Ko, un nouveau chapitre est créé.
 *   4. Met à jour data/etudiants/index.json (maj, compteurs, octets).
 * data/ est network-first : pas de bump de CACHE du service worker.
 * Sortie stdout : JSON { date, modifie, ajoutes, items, erreur? } pour
 * maintenance.js. Aucune dépendance : fetch natif (Node >= 18). */
'use strict';

const fs = require('fs');
const path = require('path');

const DOSSIER = path.join(__dirname, '..', 'data', 'etudiants');
const FICHIER_INDEX = path.join(DOSSIER, 'index.json');
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const FENETRE_HEURES = 7;   /* fenêtre de fraîcheur : les dernières ~6 h (+1 de marge) */
const MAX_OCTETS_CHAPITRE = 28000; /* au-delà, nouveau fichier chapitre */

/* Flux RSS vérifiés (catalogue data/flux-rss.json, testés le 04/10/2026). */
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

/* ————— Texte : entités, normalisation ————— */
const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ocirc: 'ô', ucirc: 'û',
  icirc: 'î', acirc: 'â', ugrave: 'ù', ccedil: 'ç', euml: 'ë',
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
const norm = s => texte(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* Signature de dédoublonnage : racines hors sujet + chiffres significatifs. */
const STOP = new Set([
  'lycee', 'lyceen', 'lyceens', 'eleve', 'eleves', 'etudiant', 'etudiants',
  'blocus', 'blocage', 'blocages', 'etablissem', 'manifesta', 'mobilisa',
  'mouvement', 'national', 'education', 'enseigna', 'professeu', 'ministre',
  'gouvernem', 'france', 'paris', 'video', 'videos', 'direct', 'actu', 'actus',
  'info', 'jeunesse', 'jeunes', 'apres', 'selon', 'contre', 'sous', 'sur',
  'dans', 'pour', 'avec', 'fait', 'faits', 'jour', 'journee', 'revolte', 'greve'
]);
const racines = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w)).map(w => w.slice(0, 7));
const signature = s => racines(s).slice(0, 4).sort().join('|') + '#' + (norm(s).match(/\d{3,}/g) || []).filter(n => +n < 2000 || +n > 2100).sort().join(',');

/* Filtres : sujet du mouvement, anti-bruit (sport, émissions). */
const RE_MOUVEMENT = /lyceen|lycee|blocus|blocage|parcoursup|etudiant|acte (trois|iii)/i;
const RE_BRUIT = /(football|rugby|basket|handball|volley|championnat|brevet des colleges|bac de francai)/i;
const RE_EMISSION = /(bonjour chez vous|l.heure des pros|edition speciale|grand entretien|la revue de presse|le direct|replay|podcast|l.interview)/i;
const estMouvement = (t, d) => RE_MOUVEMENT.test(t) || RE_MOUVEMENT.test(d);
const estBruit = (t, d) => RE_BRUIT.test(t) || RE_EMISSION.test(t);

async function moissonSource(src, depuis) {
  const items = [];
  try {
    const rep = await fetch(src.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!rep.ok) throw new Error('HTTP ' + rep.status);
    const xml = await rep.text();
    const re = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const bloc = m[1] || m[2] || '';
      const titre = texte((bloc.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
      const desc = texte((bloc.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1]);
      const lien = texte((bloc.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1]);
      const dpub = (bloc.match(/<(pubDate|updated|published)[^>]*>([\s\S]*?)<\/\1>/) || [])[2];
      const date = dpub ? new Date(dpub.trim()) : null;
      if (!titre) continue;
      if (!date || isNaN(date)) continue;
      if (date < depuis) continue;
      if (estBruit(titre, desc)) continue;
      if (!estMouvement(titre, desc)) continue;
      items.push({ titre, desc, lien: lien || '', date: date.toISOString(), source: src.nom });
    }
  } catch (e) { return { items, erreur: src.id + ' : ' + e.message }; }
  return { items, erreur: null };
}

const tronc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const dateHeureFr = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(new Date());

/* Ajoute au tableau « faits » de data/lyceens.json les items corroborés
 * (≥ 2 médias distincts) du relevé : mêmes champs que lyceens.js (id
 * préfixé « a » = auto, jamais évincés par la curation épinglée), titre
 * verbatim tronqué, texte = description tronquée, badge verifie:true.
 * Dédoublonnage contre les faits existants (racines + chiffres, comme
 * lyceens.js) ; cap 10 en évitant du bout les seuls items préfixés « a ». */
async function verserFaitsCorrobores(uniques, journal) {
  const FIC_LYCEENS = path.join(__dirname, '..', 'data', 'lyceens.json');
  if (!fs.existsSync(FIC_LYCEENS)) return 0;
  const lycee = JSON.parse(fs.readFileSync(FIC_LYCEENS, 'utf8'));
  const faits = Array.isArray(lycee.faits) ? lycee.faits : [];
  const dejaLa = it => {
    const sig = signature(it.titre);
    return faits.some(f => {
      const s1 = racines(f.titre).slice(0, 4).sort();
      const s2 = racines(it.titre).slice(0, 4).sort();
      const communs = s1.filter(r => s2.includes(r)).length;
      const chiffres = (norm(it.titre).match(/\d{3,}/g) || []).some(c => (norm(f.titre).match(/\d{3,}/g) || []).includes(c));
      return sig === signature(f.titre) || communs >= 3 || (communs >= 1 && chiffres);
    });
  };
  let ajoutes = 0;
  const stamp = Date.now().toString(36);
  for (const it of uniques) {
    if (it.sources.length < 2) continue;      /* corroboré seulement */
    if (dejaLa(it)) continue;
    faits.unshift({
      id: 'aetu' + stamp + '-' + (ajoutes + 1),
      date: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date(it.date)),
      titre: tronc(it.titre, 200),
      texte: tronc(it.desc || it.titre, 280),
      source: it.sources.join(' / '),
      sources: it.sources.slice(),
      url: it.lien || '',
      verifie: true
    });
    ajoutes++;
  }
  if (ajoutes) {
    /* cap 10 : on retire par la fin uniquement les items automatiques. */
    while (faits.length > 10) {
      const i = faits.map((f, k) => k).reverse().find(k => /^a/.test(faits[k].id || ''));
      if (i === undefined) break;
      faits.splice(i, 1);
    }
    lycee.faits = faits;
    lycee.maj = journal;
    fs.writeFileSync(FIC_LYCEENS, JSON.stringify(lycee, null, 2) + '\n');
  }
  return ajoutes;
}

/* v106 : paragraphe « relevé automatique » NARRATIF — le fil continue d'un
 * relevé à l'autre. Trois ressorts de continuité :
 *   1. accroche temporelle : l'écart avec le relevé précédent est mémorisé
 *      dans l'index (releveDate) et relu à chaque run (« Six heures ont
 *      passé depuis le relevé précédent… ») ;
 *   2. dateline selon l'heure de Paris (« Dans la nuit du 6 au 7 octobre… ») ;
 *   3. items enfilés par VOLETS (mobilisation, répression, gouvernement,
 *      réactions, vie des lycées) avec des entames qui varient à chaque
 *      relevé (releveCompteur dans l'index) — fini le mur de tirets.
 * Les titres restent verbatim et tronqués, JAMAIS reformulés : c'est la
 * garantie d'exactitude du dispositif (un script sans LLM ne « raconte »
 * pas, il assemble). */
const VOLETS = [
  { id: 'repression', re: /polic|interpell|gaz lacrymo|mortier|arresta|blesse|garde a vue|violences|ordre public|armee|disper/i, phrases: ["Côté forces de l'ordre, les tensions ne faiblissent pas", "La répression, elle, continue de nourrir la colère", "Côté répression, la journée a laissé des traces"] },
  { id: 'gouvernement', re: /ministre|gouvernement|macron|elysee|assemblee|beauvau|parcoursup|lecornu|senat|depute|porte-parole|premier ministre|calan|nunez|geffray|retailleau|berge|executif/i, phrases: ["Côté gouvernement, les réponses s'égrènent", "Du côté du pouvoir, chacun prend position", "À Beauvau comme à l'Élysée, on ajuste le discours"] },
  { id: 'reactions', re: /raconte|observe|estime|declare|repond|aurait du|aurait dû|syndic|tizaoui|faure|troussel|corbiere|ramos|soutien|analyse|décrypt/i, phrases: ["Autour du mouvement, les voix se croisent", "Dans les réactions, le débat s'invite", "Les commentaires, eux, affluent"] },
  { id: 'vie', re: /cours en|visio|cyberblocage|etudier|antilles|examens|concours|etablissement|parisup|enfai/i, phrases: ["Dans la vie des établissements, la mobilisation s'invente au quotidien", "Côté cours, la routine a volé en éclats", "Dans les lycées, la semaine se réinvente"] }
];
const PHRASES_MOBILISATION = ["Sur le terrain, la mobilisation tient", "Dans la rue, le mouvement garde son souffle", "Côté mobilisation, l'élan ne retombe pas", "La vague, elle, continue d'avancer"];
const PHRASES_DATELINE = ["le mouvement poursuit sa route", "la chronique avance", "le fil du récit continue", "la journée s'écrit encore"];
/* Classification sur la forme normalisée (sans accents) pour ne rien rater. */
function voletDe(titre) { const n = norm(titre); for (const v of VOLETS) if (v.re.test(n) || v.re.test(titre)) return v.id; return 'mobilisation'; }
function construireParagraphe(uniques, relevePrecedent, compteur, dateRef) {
  const maintenant = dateRef ? new Date(dateRef) : new Date();
  const fmt = (o, d) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(d || maintenant);
  const dateLongue = fmt({ dateStyle: 'long' });
  const veilleLongue = fmt({ dateStyle: 'long' }, new Date(maintenant.getTime() - 24 * 3600 * 1000));
  /* v107 : en fr-FR, Intl formate l'heure « 05 h » (h collé) → + donne NaN
   * et toutes les datelines tombaient sur « Au soir ». On parse proprement. */
  const heure = parseInt(fmt({ hour: 'numeric', hourCycle: 'h23' }), 10) || 0;
  const dateline = heure < 6 ? 'Dans la nuit du ' + veilleLongue + ' au ' + dateLongue
    : heure < 12 ? 'Au matin du ' + dateLongue
    : heure < 18 ? "Dans l'après-midi du " + dateLongue
    : 'Au soir du ' + dateLongue;
  const phrases = [];
  /* 1. Accroche : écart avec le relevé précédent. */
  if (relevePrecedent) {
    const h = Math.round((maintenant - new Date(relevePrecedent)) / 3600000);
    if (h <= 2) phrases.push("Presque sans interruption, les nouvelles continuent d'arriver.");
    else if (h <= 12) phrases.push(h + ' heures ont passé depuis le relevé précédent ; le fil continue.');
    else if (h <= 48) phrases.push('Près de ' + h + ' heures ont passé depuis le relevé précédent ; la chronique reprend son fil.');
    else phrases.push('Plusieurs jours ont passé depuis le relevé précédent ; la chronique reprend son fil.');
  }
  /* 2. Dateline. */
  phrases.push(dateline + ', ' + PHRASES_DATELINE[compteur % PHRASES_DATELINE.length] + '.');
  /* 3. Volets : regroupement + entames tournantes. */
  const parVolet = new Map();
  for (const it of uniques) {
    const v = voletDe(it.titre);
    if (!parVolet.has(v)) parVolet.set(v, []);
    parVolet.get(v).push(it);
  }
  for (const volet of ['mobilisation', 'repression', 'gouvernement', 'reactions', 'vie']) {
    const items = parVolet.get(volet);
    if (!items || !items.length) continue;
    const catalogue = volet === 'mobilisation' ? PHRASES_MOBILISATION : VOLETS.find(v => v.id === volet).phrases;
    phrases.push(catalogue[compteur % catalogue.length] + ' : ' +
      items.map(it => tronc(it.titre, 160) + ' (' + it.sources.join(', ') + ')').join(' ; ') + '.');
  }
  /* 4. Clôture : la promesse que le fil reprend, + trace horodatée. */
  phrases.push('Le prochain relevé reprendra le fil. (Relevé automatique du ' + fmt({ dateStyle: 'long', timeStyle: 'short' }) + ' — faits repris des titres de presse, non reformulés.)');
  return phrases.join(' ');
}

async function main() {
  const aujourdhui = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date());
  const depuis = new Date(Date.now() - FENETRE_HEURES * 3600 * 1000);
  const echecs = [];
  const tous = [];
  const moissons = await Promise.all(SOURCES.map(s => moissonSource(s, depuis)));
  for (const m of moissons) {
    if (m.erreur) echecs.push(m.erreur);
    tous.push(...m.items);
  }
  if (!tous.length) {
    process.stdout.write(JSON.stringify({ date: aujourdhui, modifie: false, ajoutes: 0, items: 0, echecs }) + '\n');
    return;
  }
  /* Dédoublonnage par événement (rapprochement souple, comme lyceens.js) :
   * les médias formulent leurs titres différemment — on fusionne les items
   * partageant ≥ 3 racines discriminantes communes, ou ≥ 1 racine commune
   * ET un même chiffre significatif. Chaque événement garde toutes ses
   * sources (corroboration = sources.length >= 2). */
  const memeEvenement = (a, b) => {
    const r1 = racines(a.titre), r2 = racines(b.titre);
    const communs = r1.filter(r => r2.includes(r)).length;
    if (communs >= 3) return true;
    if (communs >= 1) {
      const c1 = (norm(a.titre).match(/\d{3,}/g) || []).filter(n => +n < 2000 || +n > 2100);
      const c2 = (norm(b.titre).match(/\d{3,}/g) || []).filter(n => +n < 2000 || +n > 2100);
      if (c1.some(c => c2.includes(c))) return true;
    }
    return false;
  };
  const vus = [];
  for (const it of tous.sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const existant = vus.find(v => memeEvenement(v, it));
    if (!existant) vus.push({ ...it, sources: [it.source] });
    else if (!existant.sources.includes(it.source)) existant.sources.push(it.source);
  }
  const uniques = vus.slice(0, 12);

  /* Idempotence : si le dernier relevé (stocké dans l'index) contenait
   * exactement les mêmes items, on ne publie rien — pas de commit fantôme
   * toutes les 6 h. Les items du relevé précédent mais disparus des flux
   * (fenêtre 7 h) ne relancent pas un paragraphe. */
  const indexAvant = fs.existsSync(FICHIER_INDEX)
    ? JSON.parse(fs.readFileSync(FICHIER_INDEX, 'utf8'))
    : { releveSigs: [] };
  const sigs = uniques.map(it => signature(it.titre)).sort();
  const sigsPrecedents = (indexAvant.releveSigs || []).slice().sort();
  const identique = sigs.length === sigsPrecedents.length && sigs.every((s, i) => s === sigsPrecedents[i]);
  if (identique) {
    process.stdout.write(JSON.stringify({ date: aujourdhui, modifie: false, ajoutes: 0, items: uniques.length, echecs }) + '\n');
    return;
  }

  /* Construction du paragraphe « relevé automatique » narratif (v106). */
  const texteParagraphe = construireParagraphe(uniques, indexAvant.releveDate || null, indexAvant.releveCompteur || 0);
  const sourcesParagraphe = [...new Set(uniques.flatMap(it => it.sources.map(s => s)))];

  /* Ajout au dernier chapitre (nouveau fichier si trop gros). */
  const fichiers = fs.readdirSync(path.join(DOSSIER, 'chapitres'))
    .filter(f => /^\d+\.json$/.test(f)).sort();
  let dernierFichier = fichiers[fichiers.length - 1];
  let chap = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'chapitres', dernierFichier), 'utf8'));
  let numero = parseInt(dernierFichier, 10);
  let nouveauChapitre = false;
  if (fs.statSync(path.join(DOSSIER, 'chapitres', dernierFichier)).size > MAX_OCTETS_CHAPITRE) {
    numero += 1;
    dernierFichier = String(numero).padStart(2, '0') + '.json';
    chap = {
      id: 'c' + numero,
      periode: 'Relevés automatiques — à partir du ' + aujourdhui,
      titre: 'La suite — relevés automatiques',
      paragraphes: []
    };
    nouveauChapitre = true;
  }
  const idPar = chap.id + 'p' + (chap.paragraphes.length + 1);
  chap.paragraphes.push({ id: idPar, texte: texteParagraphe, sources: sourcesParagraphe, auto: true });
  fs.writeFileSync(path.join(DOSSIER, 'chapitres', dernierFichier), JSON.stringify(chap, null, 2) + '\n');

  /* Mise à jour de l'index. */
  const index = JSON.parse(fs.readFileSync(FICHIER_INDEX, 'utf8'));
  if (nouveauChapitre) {
    index.chapitres.push({
      id: chap.id, fichier: 'chapitres/' + dernierFichier,
      periode: chap.periode, titre: chap.titre,
      paragraphes: chap.paragraphes.length,
      octets: fs.statSync(path.join(DOSSIER, 'chapitres', dernierFichier)).size
    });
  } else {
    const entree = index.chapitres.find(c => c.id === chap.id);
    if (entree) {
      entree.paragraphes = chap.paragraphes.length;
      entree.octets = fs.statSync(path.join(DOSSIER, 'chapitres', dernierFichier)).size;
    }
  }
  index.maj = aujourdhui;
  index.releveSigs = sigs;
  /* v106 : mémoire du fil — date du dernier relevé publié (pour l'accroche
   * du suivant) et compteur (pour faire tourner les entames de volets). */
  index.releveDate = new Date().toISOString();
  index.releveCompteur = (indexAvant.releveCompteur || 0) + 1;
  index.totalParagraphes = index.chapitres.reduce((a, c) => a + c.paragraphes, 0);
  /* v91 : l index porte des sections (chronique / complement) et la vue lit
   * uniquement sections[].chapitres. On met donc chaque section a jour a partir
   * de index.chapitres pour que les releves auto restent visibles cote client.
   * Un releve auto appartiendra toujours a la section chronique (les nouveaux
   * chapitres cibles sont numerotes, pas c10-c16) ; les sections conserve leur
   * ordre et leurs entrees existantes. */
  if (Array.isArray(index.sections)) {
    for (const section of index.sections) {
      const deja = Array.isArray(section.chapitres) ? section.chapitres : [];
      const ids = deja.map(c => c.id);
      const aJour = id => index.chapitres.find(c => c.id === id);
      let chapitres = ids.map(id => aJour(id) || deja.find(c => c.id === id)).filter(Boolean);
      if (section.id === 'chronique') {
        /* Les releves auto vont a la fin de la chronique (apres c17), jamais
         * dans le Complement (c10-c16). */
        const nouveaux = index.chapitres.filter(c => !ids.includes(c.id) && !/^c1[0-6]$/.test(c.id));
        chapitres = chapitres.concat(nouveaux);
      }
      section.chapitres = chapitres;
    }
  }
  fs.writeFileSync(FICHIER_INDEX, JSON.stringify(index, null, 2) + '\n');

  /* Versionnement croisé : les items corroborés (≥ 2 médias) du relevé
   * alimentent aussi le sous-onglet « ✅ Faits vérifiés » (data/lyceens.json). */
  const faitsAjoutes = await verserFaitsCorrobores(uniques, aujourdhui);

  process.stdout.write(JSON.stringify({
    date: aujourdhui,
    modifie: true,
    ajoutes: 1,
    items: uniques.length,
    faits: faitsAjoutes,
    chapitre: chap.id,
    fichier: 'data/etudiants/chapitres/' + dernierFichier,
    nouveauChapitre,
    echecs
  }) + '\n');
}

main().catch(e => {
  process.stdout.write(JSON.stringify({ date: '', modifie: false, ajoutes: 0, items: 0, erreur: e.message }) + '\n');
  process.exitCode = 1;
});
