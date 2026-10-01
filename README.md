# Newsletter PWA

PWA statique hébergée sur GitHub Pages : l'édition quotidienne (générée chaque nuit à 23h59, Europe/Paris) y est publiée automatiquement, et le site agrège en continu les flux RSS des médias suivis.

Site : https://maxjeandon-cmyk.github.io/newsletter-pwa/

## Architecture (v18)

```
index.html          Coquille unique — tout le rendu se fait côté client en ES modules
js/core.js          État global (state), store localStorage (clés préfixées "nl."), échappement HTML (esc), dates
js/feeds.js         Couche réseau : RSS direct → relais rss2json (JSON) → relais XML (allorigins/codetabs),
                    dédup par URL, caches TTL 20 min (onglet Articles et onglet Médias)
js/lecture.js       Agent de documentation numérique (v19) : livres et magazines via Open Library /
                    Internet Archive, patrimoine francophone via Gallica / BnF, revues via Crossref et
                    DOAJ, prépublications via arXiv, archive ouverte française HAL, biomédecine Europe PMC —
                    badge paywall, résumés dans le lecteur intégré, recommandations (data/lecture-reco.json).
                    v20 : agent d'ouverture — « Ouvrir » deep-search les éditions numérisées (Internet Archive),
                    affiche le texte intégral paginé dans le lecteur intégré, ou les conditions d'emprunt
                    du premier ouvrage prêtable ; changeur de version (autant d'éditions que trouvées).
js/github.js        Publication des médias dans data/medias.json via l'API GitHub (jeton fine-grained
                    local, Contents Read/Write sur ce seul dépôt) — doux : { ok } ou { erreur }
js/router.js        Routeur URL (v17) : l'onglet ouvert vit dans le hash (#medias/blast, #archives/droit…) —
                    lien partageable, bouton retour du navigateur fonctionnel
js/views.js         Dispatcher des onglets : enregistre chaque vue et expose l'API (renderView, renderTabs)
js/views/common.js   Briques partagées (bloc article, registre des vues, sync du hash après chaque rendu)
js/views/edition.js  📄 Onglet Édition du jour
js/views/sources.js  📚 Onglet Sources de l'édition
js/views/archives.js 🗄️ Onglet Archives (sous-onglets Éditions / Droit / Économie, v20)
js/views/climat.js  🌡️ Onglet Climat (dernier bulletin Copernicus, v22)
js/views/articles.js 🔥 Onglet Articles d'aujourd'hui
js/views/medias.js   🎬 Onglet Médias (sous-onglets, formulaire d'ajout, gestion, jeton)
js/views/lecture.js 📖 Onglet Lecture : recherche 7 sources, recommandations par catégories, lecteur intégré
js/app.js           Bootstrap : wiring des boutons, chargement data/*.json, service worker
data/chapters.json  Chapitres de l'onglet Articles (flux + mots-clés + fenêtre horaire)
data/medias.json    Médias suivis dans l'onglet Médias (sous-onglets)
data/climat.json    Dernier bulletin Copernicus résumé dans l'onglet Climat (rafraîchi par la
                    maintenance quotidienne — maj/titre/resume/points/lien)
js/compte.js       Comptes utilisateurs (v23) : inscription/connexion Supabase (fetch direct, zéro
                    dépendance), synchronisation des préférences (theme, masques, mediasPerso…) entre
                    appareils — le site reste pleinement utilisable sans comptedata/compte.json    Config du service de comptes (url + anon_key du projet Supabase)
supabase/schema.sql Table preferences + politiques RLS à exécuter une fois dans la console Supabase
sw.js               Service worker : coquille cache-first, editions/ et data/ network-first
styles.css          Thème sombre/clair, variables CSS
```

Sans framework, sans build : le site est 100 % statique, servi par le CDN GitHub Pages — la montée en charge se réduit à incrémenter un compteur côté CDN, et le service worker rend la coquille disponible hors ligne.

## Ajouter un média (onglet Médias)

Deux façons complémentaires :

1. **Depuis l'app** (bouton « ➕ Ajouter » de l'onglet Médias) : nom, emoji, adresse du site ou du flux (le flux RSS est cherché automatiquement : liens <link rel="alternate"> de la page, chemins usuels /feed /rss /rss.xml…, validation du flux trouvé), fenêtre horaire, case « Masqué par défaut » — le sous-onglet est bâti exactement comme Blast.

   - **Catalogue de flux vérifiés (v21, v23)** : le formulaire propose aussi un menu déroulant alimenté par le catalogue de flux RSS (`data/flux-rss.json` + `data/flux-rss-2.json` reliés par le champ `suite`, chaque fichier sous la barre des ~32 Ko) — 180 flux francophones et anglophones vérifiés en direct (HTTP 200 + RSS/Atom valide + articles présents), classés en 15 catégories (presse généraliste, régionale, économie, travail & syndicats, tech, sciences, spatial, écologie & climat, sport, culture & idées, géopolitique & idées, droit & justice, Belgique/Suisse/Québec, Afrique francophone, anglophone) et couvrant tous les domaines et courants d'opinion, via des flux publics fournis par les éditeurs. **Chaque média affiche sa ligne éditoriale en quelques mots après son nom (champ `ligne`).** Choisir un média du catalogue préremplit nom, emoji et flux ; on peut tout ajuster avant de valider. Si le premier fichier est injoignable, le menu disparaît sans erreur ; si un shard manque, le reste s'affiche.

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

## Comptes utilisateurs (v23)

Le site propose des comptes facultatifs (Réglages > Mon compte) pour retrouver ses préférences
(médias, revues, thème) sur tous ses appareils. **Sans compte, tout fonctionne** via localStorage.

Mise en place (une seule fois) :
1. Créer un projet sur supabase.com (gratuit) ; noter `url` et `anon_key` (Settings > API).
2. Les renseigner dans `data/compte.json`.
3. Dans la console Supabase, exécuter `supabase/schema.sql` (éditeur SQL) — crée la table
   `preferences` et active les politiques RLS (chaque utilisateur ne voit que sa ligne).

Sécurité : les mots de passe sont hachés par l'API auth de Supabase (bcrypt), ils ne transitent
jamais par ce dépôt. La clé `anon` est publique par conception — la protection des données repose
sur le RLS, pas sur le secret de la clé. La table ne stocke que des préférences d'affichage,
aucune donnée personnelle au-delà de l'e-mail géré par l'auth.

## Règles de déploiement

1. **Chaque livraison de code** (js/, sw.js, index.html, styles.css) doit incrémenter `CACHE` dans `sw.js` (v16 → v17…) — sinon les clients gardent l'ancienne version en cache.
2. **Le contrat `editions/` est figé** : la génération nocturne pousse `editions/YYYY-MM-DD.html` + `.json`, `editions/latest.json`, `editions/semaines/` et `editions/archives/` (chapitres Droit & Économie archivés chaque édition) — ne jamais renommer ni supprimer l'historique.
3. `data/` est servi network-first : une modification de config y est visible immédiatement, sans bump de cache.
4. Ne pas pousser de fichier non-ASCII de plus de ~32 Ko via l'outillage d'automatisation (risque de double-encodage au transport) — pour l'HTML d'édition, publier en entités numériques.

## Outils repo

- `tools/validate-edition.js <json> <html>` : relecture d'une édition (25 contrôles, 27 pour les éditions récentes ; date-aware : 11 chapitres avant le 29/09/2026, 13 pour le 29/09, 14 avec le chapitre Spatial à partir du 30/09) ;
- `tools/build-edition-json.js <html> <date>` : génère le JSON d'édition depuis le HTML ;
- `tools/build-archives.js <html> <date> "<titre-droit>" "<titre-eco>"` : archive les chapitres Droit & Économie de l'édition dans `editions/archives/` + index ;
- `tools/validate-latest.js` : valide les 3 dernières éditions (utilisé par la CI) ;
- `tools/check-site.js` : état des flux et fichiers ;
- CI `.github/workflows/validate.yml` : validation automatique à chaque push.
