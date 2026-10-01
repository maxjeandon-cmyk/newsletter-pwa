/* lecture.js — agent de recherche de documentation numérique (v18).
 * Trouve les formats numériques d'un maximum d'ouvrages : livres, magazines,
 * revues de presse et revues scientifiques — et pose une alerte paywall.
 * Sources (gratuites, sans clé, CORS ouvert — aucun backend nécessaire) :
 *  - Livres : Open Library / Internet Archive — le champ ebook_access dit si
 *    une version numérique existe : public (lisible en ligne), borrowable
 *    (emprunt gratuit avec compte), sinon papier seulement.
 *  - Revues scientifiques : DOAJ — annuaire mondial des revues en accès ouvert,
 *    tout y est libre par définition ; affine la détection paywall de Crossref.
 *  - Revues scientifiques & presse : Crossref — une licence Creative Commons
 *    ouverte dans la réponse vaut accès libre, son absence vaut paywall probable.
 *  - Patrimoine francophone : Gallica / BnF — livres, revues et presse numérisés,
 *    consultation libre (domaine public ou communicable).
 *  - Prépublications scientifiques : arXiv — physique, maths, info, éco… libre par définition.
 *  - Archive ouverte française : HAL — dépôts français, souvent libres (openAccess_bool).
 *  - Biomédecine : Europe PMC — résumés systématiques, libre si isOpenAccess.
 * Résultats doux : [] en cas d'échec — jamais d'exception, comme feeds.js. */

const TIMEOUT = 9000;

async function getJson(url, timeout = TIMEOUT) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

/* --- Livres, magazines numérisés (Open Library / Internet Archive) --- */
export async function chercherLivres(q) {
  const j = await getJson('https://openlibrary.org/search.json?limit=24&q=' + encodeURIComponent(q) +
    '&fields=key,title,author_name,first_publish_year,ebook_access');
  const docs = j?.docs || [];
  return docs.map(d => ({
    titre: d.title || '',
    auteurs: (d.author_name || []).slice(0, 3),
    annee: d.first_publish_year || null,
    source: 'Open Library',
    acces: d.ebook_access === 'public' ? 'ouvert'
      : d.ebook_access === 'borrowable' ? 'emprunt'
      : 'papier',
    lien: 'https://openlibrary.org' + (d.key || ''),
    type: 'livre'
  })).filter(x => x.titre);
}

/* --- Revues scientifiques, magazines, presse (Crossref) --- */
export async function chercherPublications(q) {
  const j = await getJson('https://api.crossref.org/works?rows=24&query=' + encodeURIComponent(q) +
    '&select=DOI,title,author,issued,container-title,license');
  const items = j?.message?.items || [];
  return items.map(it => {
    /* Licence ouverte : Creative Commons, arXiv, domaine public — l'absence
     * de licence dans Crossref est le signe d'un paywall éditeur (probable). */
    const ouvert = (it.license || []).some(l =>
      /creativecommons|arxiv|publicdomain|openaccess|\/oa\//i.test(l.URL || ''));
    return {
      titre: (it.title || [])[0] || '',
      auteurs: (it.author || []).slice(0, 3).map(a => [a.given, a.family].filter(Boolean).join(' ')),
      annee: it.issued?.['date-parts']?.[0]?.[0] || null,
      revue: (it['container-title'] || [])[0] || '',
      source: 'Crossref',
      acces: ouvert ? 'ouvert' : 'paywall',
      lien: 'https://doi.org/' + (it.DOI || ''),
      type: 'publication'
    };
  }).filter(x => x.titre);
}

async function getText(url, timeout = TIMEOUT) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.text() : null;
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

/* --- DOAJ : revues scientifiques en accès ouvert — libre par définition --- */
export async function chercherDoaj(q) {
  const j = await getJson('https://doaj.org/api/v2/search/articles/' + encodeURIComponent(q) + '?pageSize=12');
  return (j?.results || []).map(r => {
    const b = r.bibjson || {};
    return {
      titre: (b.title || '').replace(/<[^>]*>/g, ''),
      auteurs: (b.author || []).slice(0, 3).map(a => a.name).filter(Boolean),
      annee: b.year || null,
      revue: b.journal?.title || '',
      source: 'DOAJ',
      acces: 'ouvert',
      lien: (b.link || []).find(l => l.type === 'fulltext')?.url || b.link?.[0]?.url || 'https://doaj.org',
      type: 'publication'
    };
  }).filter(x => x.titre);
}

/* --- Gallica / BnF : patrimoine francophone numérisé (SRU, XML léger) --- */
export async function chercherGallica(q) {
  const xml = await getText('https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2' +
    '&maximumRecords=12&query=' + encodeURIComponent('gallica all "' + q + '"'));
  if (!xml) return [];
  const extraire = (bloc, tag) => {
    const m = bloc.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
    return m ? m[1].trim() : '';
  };
  return [...xml.matchAll(/<srw:recordData>([\s\S]*?)<\/srw:recordData>/g)].slice(0, 12).map(m => {
    const bloc = m[1];
    const ark = (bloc.match(/https:\/\/gallica\.bnf\.fr\/ark:\/[^\s<"]+/) || [])[0] || '';
    return {
      titre: extraire(bloc, 'dc:title') || 'Sans titre',
      auteurs: extraire(bloc, 'dc:creator') ? [extraire(bloc, 'dc:creator')] : [],
      annee: (extraire(bloc, 'dc:date').match(/\d{4}/) || [])[0] || null,
      source: 'Gallica (BnF)',
      acces: 'ouvert',
      lien: ark,
      type: 'patrimoine'
    };
  }).filter(x => x.lien);
}

/* --- arXiv : prépublications scientifiques — libres par définition --- */
export async function chercherArxiv(q) {
  const xml = await getText('https://export.arxiv.org/api/query?search_query=' +
    encodeURIComponent('all:' + q) + '&max_results=12&sortBy=relevance');
  if (!xml) return [];
  const extraire = (bloc, tag) => (bloc.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')) || [])[1] || '';
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 12).map(m => {
    const bloc = m[1];
    const pdf = (bloc.match(/<link[^>]*href="([^"]+)"[^>]*title="pdf"/) || [])[1] || '';
    return {
      titre: extraire(bloc, 'title').replace(/\s+/g, ' ').trim(),
      auteurs: [...bloc.matchAll(/<name>([^<]+)<\/name>/g)].slice(0, 3).map(x => x[1]),
      annee: (extraire(bloc, 'updated').match(/\d{4}/) || [])[0] || null,
      source: 'arXiv',
      acces: 'ouvert',
      lien: (bloc.match(/<id>([^<]+)<\/id>/) || [])[1] || '',
      pdf: pdf,
      extrait: extraire(bloc, 'summary').replace(/\s+/g, ' ').trim().slice(0, 1200),
      type: 'publication'
    };
  }).filter(x => x.titre && x.lien);
}

/* --- HAL : archive ouverte française — livres, thèses, articles --- */
export async function chercherHal(q) {
  const j = await getJson('https://api.archives-ouvertes.fr/search/?q=' + encodeURIComponent(q) +
    '&wt=json&rows=12&fl=label_s,authFullName_s,producedDate_s,uri_s,openAccess_bool,abstract_s');
  return (j?.response?.docs || []).map(d => ({
    titre: (d.label_s || '').replace(/<[^>]*>/g, '').trim(),
    auteurs: (d.authFullName_s || []).slice(0, 3),
    annee: (d.producedDate_s || '').match(/\d{4}/)?.[0] || null,
    source: 'HAL',
    acces: d.openAccess_bool ? 'ouvert' : 'paywall',
    lien: d.uri_s || '',
    extrait: ((d.abstract_s && d.abstract_s[0]) || '').replace(/<[^>]*>/g, '').trim().slice(0, 1200),
    type: 'publication'
  })).filter(x => x.titre && x.lien);
}

/* --- Europe PMC : biomédecine — résumés systématiques, même paywall --- */
export async function chercherEpmc(q) {
  const j = await getJson('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=' +
    encodeURIComponent(q) + '&format=json&pageSize=12&resultType=core');
  return (j?.resultList?.result || []).map(it => ({
    titre: (it.title || '').replace(/<[^>]*>/g, ''),
    auteurs: (it.authorString || '').split(',').slice(0, 3).map(s => s.trim()),
    annee: it.pubYear || null,
    revue: it.journalInfo?.journal?.title || '',
    source: 'Europe PMC',
    acces: it.isOpenAccess === 'Y' ? 'ouvert' : 'paywall',
    lien: 'https://doi.org/' + (it.doi || '') || 'https://europepmc.org',
    extrait: (it.abstractText || '').replace(/<[^>]*>/g, '').trim().slice(0, 1500),
    type: 'publication'
  })).filter(x => x.titre);
}

/* --- Agent d'ouverture (v21) : « Ouvrir » cherche l'OUVRAGE NUMÉRIQUE (ebook)
 *     de l'œuvre — natif de préférence (Project Gutenberg : EPUB + texte plein,
 *     qualité native, pas d'OCR), puis les formats numériques d'Internet Archive,
 *     arrêt au premier ouvrage pertinent ET disponible trouvé.
 *     Livre sous droits : l'agent renvoie les conditions d'emprunt
 *     (deep-search métadonnées IA : EPUB chiffré = prêtable).
 *     Un changeur de version liste les autres éditions numériques. --- */

/* Gutendex (catalogue Project Gutenberg) : ebooks natifs libres.
 * Parfois lent — deux essais, et on n'insiste pas. */
async function gutendex(url) {
  for (let i = 0; i < 2; i++) {
    const j = await getJson(url, 14000);
    if (j) return j;
  }
  return null;
}

/* Lister les éditions NUMÉRIQUES (ebooks) d'une œuvre :
 * 1. ebooks natifs Gutenberg (texte plein + EPUB) — libres, qualité native ;
 * 2. éditions Internet Archive (via Open Library) avec formats numériques. */
async function editionsNumeriques(r) {
  const q = [r.titre].concat(r.auteurs || []).filter(Boolean).join(' ');
  const editions = [];
  const vus = new Set();
  const g = await gutendex('https://gutendex.com/books?search=' + encodeURIComponent(q));
  for (const b of g?.results || []) {
    const texte = b.formats?.['text/plain; charset=utf-8'] || b.formats?.['text/plain; charset=us-ascii'];
    if (!texte) continue;
    const cle = 'gut:' + b.id;
    if (vus.has(cle)) continue;
    vus.add(cle);
    editions.push({
      origine: 'gutenberg', id: String(b.id),
      titre: b.title || r.titre,
      acces: 'ouvert', format: 'ebook natif',
      texte, epub: b.formats?.['application/epub+zip'] || null,
      lien: 'https://www.gutenberg.org/ebooks/' + b.id
    });
  }
  const j = await getJson('https://openlibrary.org/search.json?limit=16&fields=key,title,ia,ebook_access&q=' +
    encodeURIComponent(q));
  for (const d of j?.docs || []) {
    for (const ocaid of d.ia || []) {
      if (vus.has(ocaid)) continue;
      vus.add(ocaid);
      editions.push({
        origine: 'ia', id: ocaid,
        titre: d.title || r.titre,
        acces: d.ebook_access === 'public' ? 'ouvert'
          : d.ebook_access === 'borrowable' ? 'emprunt' : null,
        format: 'ebook (OCR)',
        lien: 'https://archive.org/details/' + ocaid
      });
    }
  }
  return editions.filter(v => v.acces);
}

/* Texte d'un ebook : natif Gutenberg (propre), sinon OCR IA (variable). */
async function texteEbook(e) {
  if (e.origine === 'gutenberg' && e.texte) {
    const txt = await getText(e.texte, 20000);
    if (txt && txt.length > 1000) {
      const debut = txt.search(/\*\*\* ?START OF (THIS|THE) .*?\*\*\*/i);
      const corps = debut > 0 ? txt.slice(debut).replace(/^\*\*\*.*?\*\*\*/s, '') : txt;
      return { texte: corps, natif: true };
    }
    return null;
  }
  if (e.origine === 'ia') {
    const txt = await getText('https://archive.org/download/' + e.id + '/' + e.id + '_djvu.txt', 20000);
    if (!txt || txt.length < 500 || /<html|401 Authorization/i.test(txt.slice(0, 400))) return null;
    return { texte: txt, natif: false };
  }
  return null;
}

/* Conditions d'emprunt d'une édition IA : deep-search métadonnées —
 * EPUB chiffré (LCP) ou PDF protégé = prêtable ; collections de prêt. */
async function conditionsEmprunt(e) {
  const m = await getJson('https://archive.org/metadata/' + e.id);
  const meta = m?.metadata || {};
  const fichiers = (m?.files || []).map(f => f.name);
  const epubChiffre = fichiers.some(f => /_lcp\.epub$|_encrypted\.pdf$/i.test(f));
  const colls = Array.isArray(meta.collection) ? meta.collection : [meta.collection].filter(Boolean);
  return {
    id: e.id,
    pretable: epubChiffre || colls.includes('inlibrary') || colls.includes('internetarchivebooks') || !!meta.lending,
    formats: fichiers.filter(f => /\.(epub|pdf)$/i.test(f)).slice(0, 4),
    statut: meta.lending || null,
    collections: colls,
    lien: 'https://archive.org/details/' + e.id
  };
}

/* L'agent : ouvrir un résultat dans le lecteur — ebook natif prioritaire.
 * Renvoie doucement : { type: 'texte'|'emprunt'|'indisponible', ... } */
export async function ouvrirOuvrage(r) {
  if (!r || !r.titre) return { type: 'indisponible', raison: 'numerique', lien: '', titre: '' };
  if (r.source === 'Gallica (BnF)') {
    return { type: 'indisponible', raison: 'gallica', lien: r.lien, titre: r.titre };
  }
  const editions = await editionsNumeriques(r);
  if (!editions.length) {
    return { type: 'indisponible', raison: 'numerique', lien: r.lien, titre: r.titre };
  }
  const versions = editions.slice(0, 14);
  /* Deep-search : premier ebook pertinent et disponible — les natifs Gutenberg
   * d'abord (texte propre), puis les IA publics. Arrêt au premier trouvé. */
  for (const v of versions) {
    if (v.acces !== 'ouvert') continue;
    const res = await texteEbook(v);
    if (res) {
      return {
        type: 'texte', titre: v.titre, edition: v.id, natif: res.natif,
        texte: res.texte, versions, epub: v.epub || null,
        lien: v.lien
      };
    }
  }
  /* Aucun ebook libre : premier prêtable — conditions d'emprunt (confirmation). */
  for (const v of versions) {
    if (v.acces !== 'emprunt') continue;
    const cond = await conditionsEmprunt(v);
    if (cond.pretable) {
      return { type: 'emprunt', titre: v.titre, edition: v.id, conditions: cond, versions, lien: cond.lien };
    }
  }
  return { type: 'indisponible', raison: 'protege', lien: r.lien, titre: r.titre, versions };
}

/* Changement de version : charger une autre édition numérique dans le lecteur. */
export async function ouvrirVersion(v, versions) {
  if (v.acces === 'ouvert') {
    const res = await texteEbook(v);
    if (res) return { type: 'texte', titre: v.titre, edition: v.id, natif: res.natif, texte: res.texte, epub: v.epub || null, versions, lien: v.lien };
  }
  const cond = await conditionsEmprunt(v);
  return { type: 'emprunt', titre: v.titre, edition: v.id, conditions: cond, versions, lien: cond.lien };
}

/* --- Recherche unifiée : catégorie 'livres', 'publications' ou 'tout'.
 *     Chaque catégorie interroge ses sources en parallèle et fusionne —
 *     une source injoignable ne bloque jamais les autres. --- */
export async function chercher(categorie, q) {
  if (categorie === 'livres') {
    const [ol, gallica] = await Promise.all([chercherLivres(q), chercherGallica(q)]);
    return ol.concat(gallica);
  }
  if (categorie === 'publications') {
    const [crossref, doaj, arxiv, hal, epmc] = await Promise.all([
      chercherPublications(q), chercherDoaj(q), chercherArxiv(q), chercherHal(q), chercherEpmc(q)
    ]);
    return crossref.concat(doaj, arxiv, hal, epmc);
  }
  const [livres, gallica, crossref, doaj, arxiv, hal, epmc] = await Promise.all([
    chercherLivres(q), chercherGallica(q), chercherPublications(q), chercherDoaj(q),
    chercherArxiv(q), chercherHal(q), chercherEpmc(q)
  ]);
  return livres.concat(gallica, crossref, doaj, arxiv, hal, epmc);
}
