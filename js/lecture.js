/* lecture.js — agent de recherche de documentation numérique (v18).
 * Trouve les formats numériques d'un maximum d'ouvrages : livres, magazines,
 * revues de presse et revues scientifiques — et pose une alerte paywall.
 * Sources (gratuites, sans clé, CORS ouvert — aucun backend nécessaire) :
 *  - Livres : Open Library / Internet Archive — le champ ebook_access dit si
 *    une version numérique existe : public (lisible en ligne), borrowable
 *    (emprunt gratuit avec compte), sinon papier seulement.
 *  - Revues scientifiques & presse : Crossref — une licence Creative Commons
 *    ouverte dans la réponse vaut accès libre, son absence vaut paywall probable.
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

/* --- Recherche unifiée : catégorie 'livres', 'publications' ou 'tout'.
 *     Le mode 'tout' interroge les deux sources en parallèle et fusionne. --- */
export async function chercher(categorie, q) {
  if (categorie === 'livres') return chercherLivres(q);
  if (categorie === 'publications') return chercherPublications(q);
  const [livres, publications] = await Promise.all([chercherLivres(q), chercherPublications(q)]);
  return livres.concat(publications);
}
