#!/usr/bin/env node
/* tools/elnino-indices.js — Automate quotidien des indices El Niño.
 * Fetch les trois fichiers texte officiels NOAA CPC :
 *   - https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt  (SEAS YR ANOM, depuis 1950)
 *   - https://www.cpc.ncep.noaa.gov/data/indices/Rnino34.ascii.txt (YR MTH ANOM, mois NUMERIQUES)
 *   - https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt    (SEAS YR TOTAL ANOM, anomalie = 4e colonne)
 * Garde les 12 dernières entrées de chaque série, CHRONOLOGIQUES (la plus
 * ancienne en premier) ; la valeur de tête de chaque indice est la DERNIÈRE
 * entrée (la plus récente).
 * Recalcule le classement sur la série RONI COMPLÈTE : épisodes = saisons
 * consécutives >= 0,5 ; top8Precedents = épisodes clos triés par pic
 * décroissant ; episodeEnCours = dernier épisode s'il contient la dernière
 * saison. Re-génère data/elnino-indices.json AU MÊME SCHÉMA, en conservant
 * les blocs non rafraîchis (sstNino34, probabilitesForce, outlookRoni) et,
 * en cas d'échec d'une source, le bloc existant de cette source.
 * Sortie : log "DONNEES MODIFIEES" si le contenu (hors date maj) change,
 * "DONNEES INCHEMANGEES" sinon — l'appelant ne commit QUE sur modification.
 * Mode test : node tools/elnino-indices.js --check valide le JSON existant.
 * Correctif du 14/10/2026 (la v121 du 13/10 inversait les séries et lisait
 * la plus ANCIENNE valeur comme courante, laissait nino34Relatif vide — regex
 * \w{3} sur des mois numériques — et vidait top8Precedents en ne voyant que
 * 12 saisons d'historique).
 * Node >= 18, zéro dépendance.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FICHIER_SORTIE = path.join(__dirname, '..', 'data', 'elnino-indices.json');

/* URLs officielles NOAA CPC */
const URL_RONI = 'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt';
const URL_RNINO34 = 'https://www.cpc.ncep.noaa.gov/data/indices/Rnino34.ascii.txt';
const URL_ONI = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

/* User Agent pour éviter les blocages */
const UA = 'Mozilla/5.0 (compatible; NewsletterPWA/1.0; +https://diyeah24.fr)';

/* Format de date jj/mm/aaaa */
function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

/* Ordre des saisons dans l'année (DJF ouvre l'année dans ces fichiers) */
const ORDRE_SAISONS = { DJF: 0, JFM: 1, FMA: 2, MAM: 3, AMJ: 4, MJJ: 5, JJA: 6, JAS: 7, ASO: 8, SON: 9, OND: 10, NDJ: 11 };

/* Parse une ligne RONI "SEAS YR ANOM" -> { saison, annee, valeur } */
function parseLigneRoni(ligne) {
  const m = ligne.trim().match(/^([A-Z]{3})\s+(\d{4})\s+([-+]?\d+\.?\d*)$/);
  if (!m) return null;
  return { saison: m[1], annee: parseInt(m[2], 10), valeur: parseFloat(m[3]) };
}

/* Parse une ligne Rnino34 "YR MTH ANOM" (mois NUMERIQUE 1-12) -> { annee, mois, valeur } */
function parseLigneRnino34(ligne) {
  const m = ligne.trim().match(/^(\d{4})\s+(\d{1,2})\s+([-+]?\d+\.?\d*)$/);
  if (!m) return null;
  return { annee: parseInt(m[1], 10), mois: parseInt(m[2], 10), valeur: parseFloat(m[3]) };
}

/* Parse une ligne ONI "SEAS YR TOTAL ANOM" -> { saison, annee, total, valeur } */
function parseLigneOni(ligne) {
  const m = ligne.trim().match(/^([A-Z]{3})\s+(\d{4})\s+([-+]?\d+\.?\d*)\s+([-+]?\d+\.?\d*)$/);
  if (!m) return null;
  return { saison: m[1], annee: parseInt(m[2], 10), total: parseFloat(m[3]), valeur: parseFloat(m[4]) };
}

/* Label "SAISON YYYY" */
function labelSaison(saison, annee) {
  return saison + ' ' + annee;
}

/* Fetch avec timeout */
async function fetchAvecDelai(url, delaiMs) {
  const delai = delaiMs || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), delai);
  try {
    const reponse = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: controller.signal
    });
    if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
    return await reponse.text();
  } finally {
    clearTimeout(timer);
  }
}

/* Parse un fichier texte en série chronologique complète.
 * parseLigne : fonction de parse d'une ligne ; triDefensif : tri chronologique. */
async function parserSerie(url, parseLigne) {
  const texte = await fetchAvecDelai(url);
  const serie = [];
  for (const ligne of texte.split('\n')) {
    const p = parseLigne(ligne);
    if (p) serie.push(p);
  }
  if (serie.length === 0) throw new Error('aucune ligne exploitable pour ' + url);
  return serie;
}

/* Épisodes El Niño d'une série saisonnière CHRONOLOGIQUE :
 * saisons consécutives de valeur >= 0,5. */
function trouverEpisodes(serie) {
  const episodes = [];
  let courant = null;
  for (const item of serie) {
    if (item.valeur >= 0.5) {
      if (!courant) courant = { saisons: [] };
      courant.saisons.push(item);
    } else if (courant) {
      episodes.push(courant);
      courant = null;
    }
  }
  if (courant) episodes.push(courant);
  return episodes;
}

/* Label d'épisode "AAAA-AA". Convention ENSO : les deux années de référence.
 * Épisode contenu dans une seule année : AAAA-(AAAA+1) (un épisode en cours
 * ou clos en cours d'année est rattaché à l'année ENSO suivante). */
function labelEpisode(ep) {
  const premiere = ep.saisons[0];
  const derniere = ep.saisons[ep.saisons.length - 1];
  const debut = premiere.annee;
  const fin = derniere.annee === debut ? debut + 1 : derniere.annee;
  return debut + '-' + String(fin).slice(-2);
}

/* Saison du pic d'un épisode (première saison atteignant le pic). */
function saisonDuPic(ep) {
  let pic = null;
  let saison = null;
  for (const s of ep.saisons) {
    if (pic === null || s.valeur > pic) {
      pic = s.valeur;
      saison = s;
    }
  }
  return { pic: pic, saison: saison };
}

/* Classement historique depuis la série RONI COMPLÈTE :
 * episodeEnCours = dernier épisode S'IL contient la dernière saison de la
 * série ; tous les autres épisodes sont clos et classés par pic décroissant. */
function genererClassement(serieRoni) {
  const episodes = trouverEpisodes(serieRoni);
  if (episodes.length === 0) return { top8Precedents: [], episodeEnCours: null };
  const derniereSaison = serieRoni[serieRoni.length - 1];
  const dernierEp = episodes[episodes.length - 1];
  const enCours = dernierEp.saisons.some(s => s.saison === derniereSaison.saison && s.annee === derniereSaison.annee);

  const clos = enCours ? episodes.slice(0, -1) : episodes.slice();
  clos.sort((a, b) => saisonDuPic(b).pic - saisonDuPic(a).pic);

  const top8 = clos.slice(0, 8).map(ep => {
    const p = saisonDuPic(ep);
    return { episode: labelEpisode(ep), pic: p.pic, saison: labelSaison(p.saison.saison, p.saison.annee) };
  });

  let episodeEnCours = null;
  if (enCours) {
    const p = saisonDuPic(dernierEp);
    episodeEnCours = {
      episode: labelEpisode(dernierEp),
      pic: p.pic,
      saison: labelSaison(p.saison.saison, p.saison.annee)
    };
  }
  return { top8Precedents: top8, episodeEnCours: episodeEnCours };
}

/* Main — génération complète */
async function generer() {
  const maj = fmtDate(new Date());

  /* Fichier existant : blocs conservés + repli en cas d'échec d'une source */
  let existant = {};
  try {
    existant = JSON.parse(fs.readFileSync(FICHIER_SORTIE, 'utf8'));
  } catch (e) {
    console.log('Fichier existant absent ou illisible, creation complete.');
  }

  /* Fetch et parse — un échec de source conserve le bloc existant */
  const [roniComplet, rnino34Complet, oniComplet] = await Promise.all([
    parserSerie(URL_RONI, parseLigneRoni).catch(e => { console.error('RONI: ' + e.message); return null; }),
    parserSerie(URL_RNINO34, parseLigneRnino34).catch(e => { console.error('Rnino34: ' + e.message); return null; }),
    parserSerie(URL_ONI, parseLigneOni).catch(e => { console.error('ONI: ' + e.message); return null; })
  ]);

  /* RONI est l'indice de référence : sans lui, pas de classement, pas de mise à jour */
  if (!roniComplet) {
    console.error('ERREUR: source RONI indisponible, abandon sans ecriture.');
    process.exit(1);
  }

  /* Blocs rafraîchis (12 dernières entrées, chronologiques) ou conservés */
  const bloc = (nom, serie, map) => {
    if (!serie) {
      if (!existant[nom]) return null;
      console.error('AVERTISSEMENT: source de ' + nom + ' indisponible, bloc existant conserve.');
      return existant[nom];
    }
    const derniers = serie.slice(-12).map(map);
    const dernier = derniers[derniers.length - 1];
    return { periode: dernier.periode, valeur: dernier.valeur, serie: derniers };
  };

  const roniNouveau = bloc('roni', roniComplet, r => ({ periode: labelSaison(r.saison, r.annee), valeur: r.valeur }));
  if (roniNouveau) {
    roniNouveau.unite = 'degC';
    roniNouveau.seuilElNino = 0.5;
    roniNouveau.seuilTresFort = 2.0;
    roniNouveau.source = 'NOAA CPC - RONI.ascii.txt';
  }
  const nino34Nouveau = bloc('nino34Relatif', rnino34Complet, r => ({ periode: r.mois + '/' + r.annee, valeur: r.valeur }));
  if (nino34Nouveau) nino34Nouveau.source = 'NOAA CPC - Rnino34.ascii.txt';
  const oniNouveau = bloc('oni', oniComplet, r => ({ periode: labelSaison(r.saison, r.annee), valeur: r.valeur }));
  if (oniNouveau) oniNouveau.source = 'NOAA CPC - oni.ascii.txt';

  const sortie = {
    maj: maj,
    roni: roniNouveau,
    nino34Relatif: nino34Nouveau,
    oni: oniNouveau,
    sstNino34: existant.sstNino34 || null,
    probabilitesForce: existant.probabilitesForce || null,
    outlookRoni: existant.outlookRoni || null,
    classementHistorique: genererClassement(roniComplet)
  };

  /* Validation minimale avant écriture */
  JSON.stringify(sortie);
  if (sortie.roni && (!Array.isArray(sortie.roni.serie) || sortie.roni.serie.length === 0)) {
    console.error('ERREUR: serie RONI vide, abandon sans ecriture.');
    process.exit(1);
  }

  /* Les données (hors date de maj) ont-elles changé ? */
  const sansMaj = o => { const c = Object.assign({}, o); delete c.maj; return JSON.stringify(c); };
  const inchange = existant && existant.maj && sansMaj(sortie) === sansMaj(existant);

  /* Écriture */
  fs.writeFileSync(FICHIER_SORTIE, JSON.stringify(sortie, null, 2) + '\n');
  console.log('Indices El Nino : maj quotidienne RONI/ONI — ' + maj);
  console.log(inchange ? 'DONNEES INCHANGEES (hors date de maj) — pas de commit necessaire'
                       : 'DONNEES MODIFIEES — commit requis');
  if (inchange) process.exit(0);
  process.exit(0);
}

/* Mode check — validation du fichier existant, sans réseau ni écriture */
function check() {
  let existant;
  try {
    existant = JSON.parse(fs.readFileSync(FICHIER_SORTIE, 'utf8'));
  } catch (e) {
    console.error('ERREUR: data/elnino-indices.json introuvable ou invalide');
    process.exit(1);
  }

  const erreurs = [];

  for (const champ of ['maj', 'roni', 'nino34Relatif', 'oni', 'classementHistorique']) {
    if (!(champ in existant)) erreurs.push('Champ manquant: ' + champ);
  }

  for (const [nom, requis] of [['roni', ['periode', 'valeur', 'unite', 'seuilElNino', 'seuilTresFort', 'serie', 'source']],
                                ['nino34Relatif', ['periode', 'valeur', 'serie', 'source']],
                                ['oni', ['periode', 'valeur', 'serie', 'source']]]) {
    if (existant[nom]) {
      for (const champ of requis) {
        if (!(champ in existant[nom])) erreurs.push(nom + '.' + champ + ' manquant');
      }
      if (!Array.isArray(existant[nom].serie) || existant[nom].serie.length === 0) {
        erreurs.push(nom + '.serie doit etre un tableau non vide');
      }
    } else {
      erreurs.push(nom + ' absent');
    }
  }

  const ch = existant.classementHistorique;
  if (ch) {
    if (!Array.isArray(ch.top8Precedents)) erreurs.push('classementHistorique.top8Precedents doit etre un tableau');
    else if (ch.top8Precedents.length !== 8) erreurs.push('AVERTISSEMENT: top8Precedents = ' + ch.top8Precedents.length + ' entree(s) au lieu de 8');
    if (!ch.episodeEnCours || !ch.episodeEnCours.episode || typeof ch.episodeEnCours.pic !== 'number') {
      erreurs.push('classementHistorique.episodeEnCours incomplet');
    }
  }

  if (erreurs.length > 0) {
    console.error('ERREURS de validation:');
    for (const e of erreurs) console.error('  - ' + e);
    process.exit(1);
  }

  console.log('OK: data/elnino-indices.json est valide');
  process.exit(0);
}

/* Point d'entrée */
const args = process.argv.slice(2);
if (args.includes('--check')) {
  check();
} else {
  generer().catch(e => { console.error('ERREUR: ' + e.message); process.exit(1); });
}
