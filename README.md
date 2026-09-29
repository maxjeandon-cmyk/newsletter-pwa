# Newsletter PWA

PWA statique hébergée sur GitHub Pages : l'édition quotidienne (générée chaque nuit à 23h59, Europe/Paris) y est publiée automatiquement, et le site agrège en continu les flux RSS des médias suivis.

Site : https://maxjeandon-cmyk.github.io/newsletter-pwa/

## Architecture (v16)

```
index.html          Coquille unique — tout le rendu se fait côté client en ES modules
js/core.js          État global (state), store localStorage (clés préfixées "nl."), échappement HTML (esc), dates
js/feeds.js         Couche réseau : RSS direct → relais rss2json (JSON) → relais XML (allorigins/codetabs),
                    dédup par URL, caches TTL 20 min (onglet Articles et onglet Médias)
js/github.js        Publication des médias dans data/medias.json via l'API GitHub (jeton fine-grained
                    local, Contents Read/Write sur ce seul dépôt) — doux : { ok } ou { erreur }
js/views.js         Rendu des 5 onglets : Édition, Sources, Archives, Articles, Médias
js/app.js           Bootstrap : wiring des boutons, chargement data/*.json, service worker
data/chapters.json  Chapitres de l'onglet Articles (flux + mots-clés + fenêtre horaire)
data/medias.json    Médias suivis dans l'onglet Médias (sous-onglets)
sw.js               Service worker : coquille cache-first, editions/ et data/ network-first
styles.css          Thème sombre/clair, variables CSS
```

Sans framework, sans build : le site est 100 % statique, servi par le CDN GitHub Pages — la montée en charge se réduit à incrémenter un compteur côté CDN, et le service worker rend la coquille disponible hors ligne.

## Ajouter un média (onglet Médias)

Deux façons complémentaires :

1. **Depuis l'app** (bouton « ➕ Ajouter » de l'onglet Médias) : nom, emoji, adresse du site ou du flux (le flux RSS est cherché automatiquement : liens <link rel="alternate"> de la page, chemins usuels /feed /rss /rss.xml…, validation du flux trouvé), fenêtre horaire, case « Masqué par défaut » — le sous-onglet est bâti exactement comme Blast.

   - **Publication pour tous les écrans (v19)** : si un jeton d'accès GitHub *fine-grained* est enregistré sur l'appareil (👁 Gérer → 🔑 — portée minimale : Contents Read/Write sur le seul dépôt `newsletter-pwa`, stocké dans `nl.jeton`, jamais affiché), « Ajouter ce média » écrit directement dans `data/medias.json` via l'API GitHub : visible sur tous les écrans, survivant aux purges. La case « Masqué par défaut » publie le média avec `"masque": true` (invisible partout tant que chacun ne l'a pas réaffiché depuis 👁 Gérer — préférence locale `nl.mediasAffiches`).
   - **Sans jeton** (ou si GitHub est injoignable) : repli local — enregistré dans l'appareil (`nl.mediasPerso`), comme le thème, visible depuis cet écran seulement. Rien n'est jamais perdu.
   - Le bouton « 👁 Gérer » affiche/masque chaque média ; les médias ajoutés localement peuvent être supprimés (🗑), ceux de la config serveur seulement masqués. « Purger le cache » ne touche jamais à ces préférences (jeton compris).

2. **À la main, pour tous les visiteurs** : dans `data/medias.json`, ajoute une entrée —

```json
{
  "id": "blast",
  "nom": "Blast",
  "emoji": "🟥",
  "flux": ["https://api.blast-info.fr/rss_articles.xml"],
  "fenetreHeures": 24,
  "masque": true
}
```

- `id` : identifiant stable (lettres/tirets) ;
- `flux` : liste de flux RSS — la couche `js/feeds.js` essaie le direct, puis deux familles de relais gratuits ;
- `fenetreHeures` : fenêtre d'affichage des articles ;
- `masque` (facultatif) : média présent côté serveur mais masqué par défaut — chaque appareil peut le réafficher depuis 👁 Gérer.

## Ajouter / modifier un chapitre (onglet Articles)

Éditer `data/chapters.json` : `flux`, `motsCles` (`["*"]` = tout garder), `exclusion`, `fenetreHeures` (défaut 24 h). Les préférences de l'utilisateur (masquer un chapitre) sont stockées côté client (`nl.masques`) et survivent donc aux déploiements.

## Règles de déploiement

1. **Chaque livraison de code** (js/, sw.js, index.html, styles.css) doit incrémenter `CACHE` dans `sw.js` (v16 → v17…) — sinon les clients gardent l'ancienne version en cache.
2. **Le contrat `editions/` est figé** : la génération nocturne pousse `editions/YYYY-MM-DD.html` + `.json`, `editions/latest.json` et `editions/semaines/` — ne jamais renommer ni supprimer l'historique.
3. `data/` est servi network-first : une modification de config y est visible immédiatement, sans bump de cache.
4. Ne pas pousser de fichier non-ASCII de plus de ~32 Ko via l'outillage d'automatisation (risque de double-encodage au transport) — pour l'HTML d'édition, publier en entités numériques.

## Outils repo

- `tools/validate-edition.js <json> <html>` : 25 contrôles sur une édition ;
- `tools/check-site.js` : état des flux et fichiers ;
- CI `.github/workflows/validate.yml` : validation automatique à chaque push.
