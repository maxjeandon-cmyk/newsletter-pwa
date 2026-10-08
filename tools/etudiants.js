#!/usr/bin/env node
/* v114 (08/10/2026) : fin des actes numérotés — « Acte N » est RÉSERVÉ aux
 * journées de mobilisation nationales (acte 1 : 29/09, acte 2 : 01/10,
 * acte III : 06/10) ; un jour de suivi ordinaire n'est plus « Acte IV/V… ».
 * Le nouveau chapitre du jour reçoit un titre placeholder « Le fil continue —
 * <date> » que l édition du matin (07h00) RETITRE selon son contenu.
 * romain() et index.prochainActe supprimés. */
/* v113 (08/10/2026) : retrait de Le Figaro, La Croix et BFMTV du catalogue presse
 * de la chronique (demande de Maxime) — 11 flux restants ; tools/lyceens.js garde
 * son propre catalogue, ce changement ne concerne QUE la chronique étudiants. */
/* v112 (lot 6) : voix des réseaux — flux RSS Reddit (r/etudiants, r/enseignants, r/france)
 * dans le relevé de la chronique UNIQUEMENT : volet final « voix des élèves et des
 * enseignants », cap 4 items réseaux par relevé, échec Reddit SILENCIEUX (le relevé
 * presse n'est jamais bloqué ni réduit), raccrochage aux événements presse en mention ;
 * les items Reddit ne partent JAMAIS dans les faits vérifiés (data/lyceens.js) et ne
 * comptent JAMAIS dans nbSources de corroboration — le badge ✅ reste presse uniquement. */
/* v110 (lot 2) : moisson enrichie — apercu nettoye (tronc 180) par item ; UN SEUL apercu par evenement dans le paragraphe ; texte des faits peut utiliser l apercu. */
/* v109 (lot 1) : anti-bruit, titre doit matcher le mouvement ; nettoyerTitre applique a l assemblage et aux faits, jamais sur les signatures. */
/* tools/etudiants.js — Relevé automatique 6 h de la chronique « Version des étudiants »
 * (onglet ✊ Lycéens 2026, sous-onglet Version des étudiants).
 * Appelé par tools/maintenance.js à chaque run (3 h, 9 h, 15 h, 21 h Paris) :
 *   1. Moissonne les flux RSS de la presse (catalogue propre à la chronique,
 *      11 flux — Figaro, La Croix, BFMTV retirés le 08/10/2026, cf. v113)
 *      et ne retient que les items du mouvement lycéen/étudiant.
 *   2. Construit UN paragraphe « relevé automatique » NARRATIF pour les
 *      dernières 6 h : accroche temporelle + dateline + items regroupés en
 *      volets avec entames tournantes. Les titres restent la matière
 *      première (verbatim, tronqués), jamais reformulés — la rédaction
 *      narrative enrichie reste le travail des éditions de la newsletter.
 *      Champ "auto": true dans le paragraphe.
 *   3. Ajoute le paragraphe au chapitre DU JOUR de data/etudiants/chapitres/
 *      (index.chapitreJour) ; un nouveau chapitre d acte est créé à chaque
 *      changement de jour (suivi quotidien), jamais par taille — le seuil
 *      28 Ko devient un simple garde-fou consigné en avertissement.
 *   4. Met à jour data/etudiants/index.json (maj, compteurs, octets).
 * data/ est network-first : pas de bump de CACHE du service worker.
 * Sortie stdout : JSON { date, modifie, ajoutes, items, erreur? } pour
 * maintenance.js. Aucune dépendance : fetch natif (Node >= 18). */
'use strict';

const fs = require('fs');
const path = require('path');
const { nettoyerTitre } = require('./titres.js');
const { corroborer } = require('./corroboration.js');

const DOSSIER = path.join(__dirname, '..', 'data', 'etudiants');
const FICHIER_INDEX = path.join(DOSSIER, 'index.json');
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const FENETRE_HEURES = 7;   /* fenêtre de fraîcheur : les dernières ~6 h (+1 de marge) */
const MAX_OCTETS_CHAPITRE = 28000; /* garde-fou : avertissement seulement, jamais de scission (v108) */

/* Flux RSS vérifiés (catalogue data/flux-rss.json, testés le 04/10/2026) ;
 * v113 : chronique = 11 flux (sans Figaro, La Croix, BFMTV). */
const SOURCES = [
  { id: '20-minutes', nom: '20 minutes', url: 'https://www.20minutes.fr/feeds/rss-une.xml' },
  { id: 'europe-1', nom: 'Europe 1', url: 'https://www.europe1.fr/rss.xml' },
  { id: 'public-senat', nom: 'Public Sénat', url: 'https://www.publicsenat.fr/rss' },
  { id: 'france-tv-info', nom: 'franceinfo', url: 'https://www.francetvinfo.fr/france.rss' },
  { id: 'france-info', nom: 'France Inter', url: 'https://radiofrance.fr/franceinfo/rss' },
  { id: 'france-24', nom: 'France 24', url: 'https://www.france24.com/fr/rss' },
  { id: 'rfi', nom: 'RFI', url: 'https://www.rfi.fr/fr/rss' },
  { id: 'ouest-france', nom: 'Ouest-France', url: 'https://www.ouest-france.fr/rss.xml' },
  { id: 'l-humanite', nom: "L'Humanité", url: 'https://www.humanite.fr/feed' },
  { id: 'mediapart', nom: 'Mediapart', url: 'https://www.mediapart.fr/articles/feed' },
  { id: 'liberation', nom: 'Libération', url: 'https://www.liberation.fr/arc/outboundfeeds/rss-all/' }
];

/* v112 (lot 6) : flux Reddit (format Atom) — la voix des élèves et des enseignants
 * entre dans le relevé de la chronique (décision de Maxime, 07/10/2026 : les réseaux
 * sont le moyen de communication des jeunes, les enseignants sont avec eux).
 * Moisson séquentielle avec délai anti-429 ; l'échec d'un flux Reddit est
 * SILENCIEUX : le relevé presse n'est jamais bloqué ni réduit. Cap réseaux :
 * au plus CAP_RESEAUX items Reddit par relevé — la presse garde le fil. */
const SOURCES_REDDIT = [
  { id: 'reddit-etudiants', nom: 'Reddit — r/etudiants', url: 'https://www.reddit.com/r/etudiants/.rss' },
  { id: 'reddit-enseignants', nom: 'Reddit — r/enseignants', url: 'https://www.reddit.com/r/enseignants/.rss' },
  { id: 'reddit-france', nom: 'Reddit — r/france', url: 'https://www.reddit.com/r/france/.rss' }
];
const CAP_RESEAUX = 4;

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
/* v109 (lot 1) : anti-bruit -- le TITRE doit matcher le regex mouvement, la description
 * ne suffit plus seule (cas reels : « Guerre au Moyen-Orient », « Australie : mine de
 * charbon » passaient parce que seule la description mentionnait le mouvement). */
const estMouvement = (t, d) => RE_MOUVEMENT.test(t);
const estBruit = (t, d) => RE_BRUIT.test(t) || RE_EMISSION.test(t);

const tronc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);async function moissonSource(src, depuis) {
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
      items.push({ titre, desc, apercu: tronc(desc, 180), lien: lien || '', date: date.toISOString(), source: src.nom });
    }
  } catch (e) { return { items, erreur: src.id + ' : ' + e.message }; }
  return { items, erreur: null };
}

/* v112 (lot 6) : moisson d'un flux Reddit (Atom). Mêmes filtres que la presse
 * (estMouvement sur le TITRE, estBruit) ; items marqués reseau:true. Un échec
 * réseau (429 compris, après une relance) est SILENCIEUX : renvoyé dans
 * silencieux, jamais dans les échecs presse. */
async function moissonReddit(src, depuis) {
  const items = [];
  const tenter = async () => {
    const rep = await fetch(src.url, { headers: { 'user-agent': UA, 'accept': 'application/atom+xml, application/xml' }, signal: AbortSignal.timeout(15000) });
    if (!rep.ok) throw new Error('HTTP ' + rep.status);
    return rep.text();
  };
  try {
    let xml;
    try { xml = await tenter(); }
    catch (e1) {
      /* Reddit renvoie 429 aux requêtes trop rapprochées : une relance après
       * 4 s, puis on abandonne ce flux en silence. */
      await new Promise(r => setTimeout(r, 4000));
      try { xml = await tenter(); }
      catch (e2) { throw e2; }
    }
    const re = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const bloc = m[1] || '';
      const titre = texte((bloc.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
      const desc = texte((bloc.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1])
        || texte((bloc.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1]);
      const lien = texte((bloc.match(/<link[^>]*href="([^"]+)"/) || [])[1]);
      const dpub = (bloc.match(/<(updated|published)[^>]*>([\s\S]*?)<\/\1>/) || [])[2];
      const date = dpub ? new Date(dpub.trim()) : null;
      if (!titre || !date || isNaN(date)) continue;
      if (date < depuis) continue;
      if (estBruit(titre, desc)) continue;
      if (!estMouvement(titre, desc)) continue;
      items.push({ titre, desc, apercu: tronc(desc, 180), lien: lien || '', date: date.toISOString(), source: src.nom, reseau: true });
    }
  } catch (e) { return { items: [], silencieux: src.id + ' : ' + e.message }; }
  return { items, silencieux: null };
}


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
    if (it.reseau) continue;                   /* v112 (lot 6) : jamais dans les faits vérifiés */
    if (!corroborer(it).verifie) continue;      /* corroboré seulement (moteur v111) */
    if (dejaLa(it)) continue;
    faits.unshift({
      id: 'aetu' + stamp + '-' + (ajoutes + 1),
      date: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date(it.date)),
      titre: tronc(nettoyerTitre(it.titre), 200),
      /* v110 (lot 2) : l apercu (desc tronquee a 180) sert de texte des qu il
       * est plus informatif que le titre — tronc 280 inchange. */
      texte: tronc((it.apercu && it.apercu.length > (it.titre || '').length ? it.apercu : (it.desc || nettoyerTitre(it.titre))), 280),
      source: it.sources.join(' / '),
      sources: it.sources.slice(),
      url: it.lien || '',
      verifie: corroborer(it).verifie
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
  { id: 'vie', re: /cours en|visio|cyberblocage|etudier|antilles|examens|concours|etablissement|parisup|enfai/i, phrases: ["Dans la vie des établissements, la mobilisation s'invente au quotidien", "Côté cours, la routine a volé en éclats", "Dans les lycées, la semaine se réinvente"] },
  /* v112 (lot 6) : volet final des réseaux — jamais attribué par voletDe (les
   * items reseau:true y sont dirigés directement), d'où l'absence de re:. */
  { id: 'voix', phrases: ["Sur les réseaux, la parole des premiers concernés est directe", "Côté Reddit, élèves et enseignants parlent d'eux-mêmes", "Sur les réseaux, la journée se raconte de l'intérieur", "Dans les fils Reddit, les témoignages s'échangent sans intermédiaire"] }
];
const PHRASES_MOBILISATION = ["Sur le terrain, la mobilisation tient", "Dans la rue, le mouvement garde son souffle", "Côté mobilisation, l'élan ne retombe pas", "La vague, elle, continue d'avancer"];
const PHRASES_DATELINE = ["le mouvement poursuit sa route", "la chronique avance", "le fil du récit continue", "la journée s'écrit encore"];
/* Classification sur la forme normalisée (sans accents) pour ne rien rater. */
function voletDe(titre) { const n = norm(titre); for (const v of VOLETS) if (v.re && (v.re.test(n) || v.re.test(titre))) return v.id; return 'mobilisation'; }
/* v108 : ouverture d acte — quand le paragraphe ouvre le chapitre du jour
 * nouvellement créé, l accroche standard annonce la nouvelle journée. */
const ouvertureActe = (h) =>
  h + " heures ont passé depuis le relevé précédent ; une nouvelle journée de suivi s'ouvre, le fil continue.";

function construireParagraphe(uniques, relevePrecedent, compteur, dateRef, nouvelActe) {
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
    else if (h <= 12) phrases.push(nouvelActe ? ouvertureActe(h) : h + ' heures ont passé depuis le relevé précédent ; le fil continue.');
    else if (h <= 48) phrases.push('Près de ' + h + ' heures ont passé depuis le relevé précédent ; la chronique reprend son fil.');
    else phrases.push('Plusieurs jours ont passé depuis le relevé précédent ; la chronique reprend son fil.');
  }
  /* 2. Dateline. */
  phrases.push(dateline + ', ' + PHRASES_DATELINE[compteur % PHRASES_DATELINE.length] + '.');
  /* 3. Volets : regroupement + entames tournantes. */
  const parVolet = new Map();
  for (const it of uniques) {
    /* v112 (lot 6) : les items des réseaux vont TOUJOURS au volet « voix »,
     * quels que soient leurs mots-clés — ils sont la parole directe, pas un fil presse. */
    const v = it.reseau ? 'voix' : voletDe(it.titre);
    if (!parVolet.has(v)) parVolet.set(v, []);
    parVolet.get(v).push(it);
  }
  for (const volet of ['mobilisation', 'repression', 'gouvernement', 'reactions', 'vie', 'voix']) {
    const items = parVolet.get(volet);
    if (!items || !items.length) continue;
    const catalogue = volet === 'mobilisation' ? PHRASES_MOBILISATION : VOLETS.find(v => v.id === volet).phrases;
    /* v110 (lot 2) : UN SEUL apercu par evenement — jamais un par source. */
    let phraseVolet = catalogue[compteur % catalogue.length] + ' : ' +
      items.map(it => {
        /* v112 (lot 6) : un item réseau s'affiche à part — jamais comme un
         * média de plus dans la corroboration (badge ✅ presse uniquement). */
        if (it.reseau) {
          return tronc(nettoyerTitre(it.titre), 160) + ' (' + it.sources.join(', ') + ')';
        }
        /* v111 (lot 3) : compte de medias distincts par evenement, calcule par le moteur. */
        const { nbSources } = corroborer(it);
        const raccroche = (it.reseaux || []).length
          ? ' — repris aussi sur ' + it.reseaux.map(s => s.replace('Reddit — ', '')).join(', ')
          : '';
        return tronc(nettoyerTitre(it.titre), 160) + ' (' + nbSources + ' media' + (nbSources > 1 ? 's' : '') + ' : ' + it.sources.join(', ') + (nbSources >= 2 ? ' — corrobore' : ' — non corrobore') + raccroche + ')';
      }).join(' ; ');
    const avecApercu = items.find(it => it.apercu && it.apercu.length > 20);
    if (avecApercu) phraseVolet = phraseVolet + ' — detail : ' + tronc(avecApercu.apercu, 180).replace(/[.]+$/, '');
    phrases.push(phraseVolet + '.');
  }
  /* 4. Clôture : la promesse que le fil reprend, + trace horodatée. */
  phrases.push('Le prochain relevé reprendra le fil. (Relevé automatique du ' + fmt({ dateStyle: 'long', timeStyle: 'short' }) + ' — faits repris des titres de presse et des fils Reddit, non reformulés.)');
  /* v110 (lot 2) : garde-fou — le paragraphe complet reste < 8 Ko. */
  const complet = phrases.join(' ');
  return complet.length < 8000 ? complet : complet.slice(0, 7999) + '…';
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

  /* v112 (lot 6) : moisson Reddit — séquentielle avec délai anti-429 (Reddit
   * rate-limite les requêtes rapprochées), échec SILENCIEUX. Cap réseaux :
   * au plus CAP_RESEAUX items Reddit par relevé, la presse garde le fil.
   * Raccrochage : un post qui reprend un événement presse du même relevé le
   * rejoint en mention (« repris aussi sur r/enseignants ») sans compter
   * comme un média de plus ; les autres deviennent des événements réseaux
   * du volet « voix » — jamais des faits vérifiés, jamais dans nbSources. */
  const reseauxEchecs = [];
  const tousReddit = [];
  for (const src of SOURCES_REDDIT) {
    const m = await moissonReddit(src, depuis);
    if (m.silencieux) reseauxEchecs.push(m.silencieux);
    tousReddit.push(...m.items);
    await new Promise(r => setTimeout(r, 600));
  }
  const uniquesReddit = [];
  for (const it of tousReddit.sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (!uniquesReddit.some(u => memeEvenement(u, it) || signature(u.titre) === signature(it.titre))) uniquesReddit.push(it);
  }
  let raccroches = 0;
  const retenusReddit = uniquesReddit.slice(0, CAP_RESEAUX);
  for (const it of retenusReddit) {
    const existant = vus.find(v => !v.reseau && memeEvenement(v, it));
    if (existant) {
      existant.reseaux = [...new Set([...(existant.reseaux || []), it.source])];
      raccroches++;
    } else {
      vus.push({ ...it, sources: [it.source], reseau: true });
    }
  }
  /* Un post réseau peut être plus récent qu'un événement presse : on retrie
   * avant le cap — la chronologie reste la trame, le cap presse d'abord. */
  vus.sort((a, b) => (a.date < b.date ? 1 : -1));
  const uniques = vus.slice(0, 12);

  /* Idempotence : si le dernier relevé (stocké dans l'index) contenait
   * exactement les mêmes items, on ne publie rien — pas de commit fantôme
   * toutes les 6 h. Les items du relevé précédent mais disparus des flux
   * (fenêtre 7 h) ne relancent pas un paragraphe. */
  const indexAvant = fs.existsSync(FICHIER_INDEX)
    ? JSON.parse(fs.readFileSync(FICHIER_INDEX, 'utf8'))
    : { releveSigs: [] };
  const sigs = uniques.map(it => signature(it.titre) + ((it.reseaux || []).length ? '+' + it.reseaux.join('&') : '')).sort();
  const sigsPrecedents = (indexAvant.releveSigs || []).slice().sort();
  const identique = sigs.length === sigsPrecedents.length && sigs.every((s, i) => s === sigsPrecedents[i]);
  if (identique) {
    process.stdout.write(JSON.stringify({ date: aujourdhui, modifie: false, ajoutes: 0, items: uniques.length, echecs, reseaux: { items: retenusReddit.length, raccroches, echecs: reseauxEchecs } }) + '\n');
    return;
  }

  /* v108 : placement par JOUR — index.chapitreJour = { id, fichier, date }.
   * Si le relevé précédent date du même jour (heure de Paris), le paragraphe
   * rejoint le chapitre du jour ; sinon (nouveau jour ou champ absent) un
   * nouveau chapitre est créé : prochain fichier numérique libre,
   * id c<numero>, titre placeholder « Le fil continue — <date> » (v114) que
   * l édition du matin retitre selon le contenu de la journée. Les actes
   * numérotés (acte III…) restent réservés aux journées de mobilisation
   * nationales. */
  const fichiers = fs.readdirSync(path.join(DOSSIER, 'chapitres'))
    .filter(f => /^\d+\.json$/.test(f)).sort();
  const chapitreJour = indexAvant.chapitreJour || null;
  let dernierFichier;
  let chap;
  let numero;
  let nouveauChapitre = false;
  if (chapitreJour && chapitreJour.date === aujourdhui && chapitreJour.fichier) {
    dernierFichier = chapitreJour.fichier.replace(/^chapitres\//, '');
    chap = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'chapitres', dernierFichier), 'utf8'));
    numero = parseInt(dernierFichier, 10);
  } else {
    numero = (fichiers.length ? parseInt(fichiers[fichiers.length - 1], 10) : 0) + 1;
    dernierFichier = String(numero).padStart(2, '0') + '.json';
    const dateLongue = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' }).format(new Date());
    chap = {
      id: 'c' + numero,
      periode: dateLongue + ' — suivi de la journée',
      titre: 'Le fil continue — ' + dateLongue,
      paragraphes: []
    };
    nouveauChapitre = true;
  }
  const texteParagraphe = construireParagraphe(uniques, indexAvant.releveDate || null, indexAvant.releveCompteur || 0, null, nouveauChapitre && chap.paragraphes.length === 0);
  const sourcesParagraphe = [...new Set(uniques.flatMap(it => it.sources.map(s => s)))];

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
   * du suivant) et compteur (pour faire tourner les entames de volets).
   * Chaîne narrative GLOBALE : continus d'un chapitre/jour à l'autre. */
  index.releveDate = new Date().toISOString();
  index.releveCompteur = (indexAvant.releveCompteur || 0) + 1;
  /* v108 : mémoire du chapitre du jour (v114 : plus de prochainActe). */
  index.chapitreJour = { id: chap.id, fichier: 'chapitres/' + dernierFichier, date: aujourdhui };
  const octetsChapitre = fs.statSync(path.join(DOSSIER, 'chapitres', dernierFichier)).size;
  index.totalParagraphes = index.chapitres.reduce((a, c) => a + c.paragraphes, 0);
  const avertissement = octetsChapitre > MAX_OCTETS_CHAPITRE
    ? 'chapitre ' + chap.id + ' > ' + MAX_OCTETS_CHAPITRE + ' octets (' + octetsChapitre + ')'
    : null;
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
    avertissement,
    echecs,
    reseaux: { items: retenusReddit.length, raccroches, echecs: reseauxEchecs }
  }) + '\n');
}

main().catch(e => {
  process.stdout.write(JSON.stringify({ date: '', modifie: false, ajoutes: 0, items: 0, erreur: e.message }) + '\n');
  process.exitCode = 1;
});
