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

/* --- Recherche unifiée : catégorie 'livres', 'publications' ou 'tout'.
 *     Chaque catégorie interroge ses sources en parallèle et fusionne —
 *     une source injoignable ne bloque jamais les autres. --- */
export async function chercher(categorie, q) {
  if (categorie === 'livres') {
    const [ol, gallica] = await Promise.all([chercherLivres(q), chercherGallica(q)]);
    return ol.concat(gallica);
  }
  if (categorie === 'publications') {
    const [crossref, doaj] = await Promise.all([chercherPublications(q), chercherDoaj(q)]);
    return crossref.concat(doaj);
  }
  const [livres, gallica, crossref, doaj] = await Promise.all([
    chercherLivres(q), chercherGallica(q), chercherPublications(q), chercherDoaj(q)
  ]);
  return livres.concat(gallica, crossref, doaj);
}
