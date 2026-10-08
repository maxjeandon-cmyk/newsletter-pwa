# DiY/H24 — Newsletter PWA

PWA statique hébergée sur GitHub Pages : l'édition quotidienne « Des infos, y'en a H24 » y est générée chaque nuit vers minuit (Europe/Paris) et publiée automatiquement, le site agrège en continu les flux RSS des médias suivis, la chronique lycéenne et les relevés d'ONG se mettent à jour tout seuls, et les notifications push arrivent sur les appareils abonnés — PC comme iPhone.

Site : https://diyeah24.fr

## Architecture (v104)

```
index.html          Coquille unique — tout le rendu se fait côté client en ES modules
js/core.js          État global (state), store localStorage (clés préfixées "nl."), échappement HTML (esc), dates
js/onglets.js       Source unique des 8 onglets (ids figés — les renommages ne touchent que nom/emoji)
js/router.js        Routeur URL : l'onglet ouvert vit dans le hash (#edition?c=…, #medias/blast…),
                    liens profonds partageables, bouton retour fonctionnel
js/feeds.js         Couche réseau : RSS direct → relais JSON/XML, dédup par URL, caches TTL 20 min
js/github.js        Publication des médias dans data/medias.json via l'API GitHub (jeton fine-grained local)
js/compte.js        Comptes Supabase : inscription/connexion, jeton rafraîchi (jetonActif),
                    synchronisation des préférences entre appareils (site 100 % utilisable sans compte)
js/push.js          Notifications Web Push : souscription (recréée à chaque activation, clé VAPID courante),
                    enregistrement vérifié EN TABLE côté serveur, guides par navigateur
                    (Firefox iPhone impossible, Firefox Android = notifs seulement app ouverte)
js/meteo.js         Météo du jour (Open-Meteo, gratuit, sans clé) + tendance matin/soirée, ville au choix
js/views/          Vues des onglets (edition, articles, videos, medias, archives, climat→newsletters,
                    lyceens, reglages, sources, common)
js/app.js           Bootstrap : wiring des boutons, chargement data/*.json, service worker
sw.js               Service worker : coquille cache-first (CACHE = 'newsletter-v111'),
                    editions/ et data/ network-first — bump de CACHE à chaque livraison de code
styles.css          Thème sombre/clair, variables CSS

data/               Config et données network-first (flux RSS, médias, chapitres, newsletters/ONG,
                    compte.json avec push.cle_publique VAPID) — modifiable sans bump de cache
data/etudiants/     Chronique « Version des étudiants » : index.json + chapitres (NN.json),
                    paragraphes {id, texte, sources, auto?} — les relevés auto 6 h s'y ajoutent
editions/           Contrat figé : YYYY-MM-DD.html/.json, latest.json, semaines/, archives/
supabase/schema.sql Tables preferences / abonnements_push + politiques RLS
```

Sans framework, sans build : le site est 100 % statique, servi par le CDN GitHub Pages ; le service worker rend la coquille disponible hors ligne.

## Les 8 onglets

✊ Lycéens 2026 (version des Lycéens : chronique puis chapitres transverses — c10-c14 et c16 reçoivent toutes les 6 h un volet automatique « relevé auto », poli lors des éditions, c15 manuel ; version du gouvernement + faits multisources + chronologie résumée des jalons) · 📄 Édition du jour (chapitres déroulants, partage par chapitre, météo du jour) · 🔥 Articles du jour · 📺 Vidéos du jour · 🎬 Médias suivis · 🗄️ Archives · 🗞️ Newsletters (bulletin Copernicus + relevés auto de 10 ONG) · ⚙️ Réglages.

L'ordre d'affichage est réglable par chaque utilisateur (Réglages) ; ids d'onglets jamais renommés (routing + ordres sauvegardés).

## Automatisations (GitHub Actions)

- **Génération nocturne** : l'édition HTML+JSON est produite vers minuit (Europe/Paris) et poussée dans `editions/` ; le squelette éditorial vit dans le validateur (`tools/validate-edition.js`, structure v15 : chapitres déroulants `<details>`, boutons de partage, ancres c-…).
- **Agent de maintenance** (`feedback.yml`, toutes les 6 h — 3 h/9 h/15 h/21 h Paris) : `tools/maintenance.js` orchestre les relevés ONG (`tools/ong-releve.js`, une fois par jour et par site), le relevé lycéens (`tools/lyceens.js`, 14 flux presse, badges ✅ corroboré ≥ 2 médias / ⚠️ une source), la chronique étudiante (`tools/etudiants.js`, qui verse toutes les 6 h un volet automatique « relevé auto » aussi dans les chapitres transverses c10-c14 et c16 — badge « relevé auto », caps élargies et aperçu détaillé par item, poli lors des éditions du matin ; le lexique c15 reste manuel ; sources réseaux : fils Reddit et invitations Discord découvertes dans les posts — API publique, jalons d'effectif arrondis au millier, jamais dans les faits vérifiés) et publie le tout dans `data/` — rapport dans `data/maintenance.json`.
- **Notifications push** (`notifier.yml`, toutes les heures) : `tools/notifier.js` lit les abonnements et préférences dans Supabase et envoie selon les toggles (édition / Copernicus / Lycéens 2026 / par média) ; journal de chaque envoi (domaine + statut HTTP + corps d'erreur) dans `data/notif-envois.json` ; purge automatique des abonnements morts (403/404/410).
  - Contact VAPID sur un vrai domaine (`mailto:contact@diyeah24.fr`) — Apple rejette les contacts non résolubles par 403 BadJwtToken.
  - Mode test : marqueur `data/notif-test.json` `{ "test": "token-frais" }` → 🔔 à chaque abonnement, puis supprimer le marqueur (mémo `notif_envoyees.test` par token).
- **Diagnostic notifs** (`notif-diag.yml` via `data/notif-diag-go.json`) : comptage des abonnements dans `data/notif-diag.json`.
- **CI** (`validate.yml`) : validation automatique des éditions à chaque push.

## Ajouter un média (onglet Médias)

1. **Depuis l'app** (bouton « ➕ Ajouter ») : nom, emoji, site ou flux (RSS cherché automatiquement), fenêtre horaire, « Masqué par défaut ». Le catalogue de flux vérifiés (`data/flux-rss.json` + shards, 123 flux en 11 catégories, ligne éditoriale affichée) préremplit le formulaire.
   - **Avec jeton GitHub fine-grained** (👁 Gérer → 🔑, portée minimale Contents Read/Write sur ce seul dépôt) : le média est publié dans `data/medias.json`, visible partout.
   - **Sans jeton** : repli local (`nl.mediasPerso`), visible depuis cet écran seulement — rien n'est jamais perdu.
2. **À la main** : ajouter une entrée dans `data/medias.json` —

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

## Comptes et notifications (Réglages)

Comptes facultatifs (Supabase) : mot de passe haché côté auth Supabase, clé anon publique par conception, protection par RLS, aucune donnée personnelle au-delà de l'e-mail. Sans compte, tout fonctionne via localStorage.

Notifications Web Push : la clé publique VAPID vit dans `data/compte.json` (`push.cle_publique`), la privée dans les secrets GitHub Actions (`VAPID_*`) ; l'app installée (Safari iPhone / navigateur desktop) s'abonne via les toggles de Réglages → 🔔, l'abonnement est enregistré dans Supabase (`abonnements_push`).

## Règles de déploiement

1. **Chaque livraison de code** (js/, sw.js, index.html, styles.css) doit incrémenter `CACHE` dans `sw.js` (v110 → v111…) — sinon les clients gardent l'ancienne version en cache.
2. **Le contrat `editions/` est figé** : ne jamais renommer ni supprimer l'historique.
3. `data/` est servi network-first : une modification y est visible immédiatement, sans bump de cache.
4. Ne pas pousser de fichier non-ASCII de plus de ~32 Ko via l'outillage d'automatisation (risque de double-encodage) — publier l'HTML d'édition en entités numériques ; messages de commit en ASCII.
5. Vérifier chaque livraison : SHA du commit relu octet par octet sur raw.githubusercontent, scan mojibake, CI Pages verte, contrôle live (curl du fichier servi).

## Outils repo

- `tools/validate-edition.js` / `tools/build-edition-json.js` / `tools/build-archives.js` / `tools/validate-latest.js` : édition (structure v15 date-aware) et CI ;
- `tools/maintenance.js` : orchestrateur des relevés 6 h (ONG, lycéens, étudiants) + publication ;
- `tools/etudiants.js` : relevé narratif de la chronique étudiante (accroches et datelines qui enchaînent d'un relevé à l'autre, items verbatim par volets) ;
- `tools/ong-releve.js` : relevé quotidien des sites ONG (règles d'extraction par site) ;
- `tools/notifier.js` / `tools/notif-diag.js` : envoi push et diagnostic ;
- `tools/check-site.js` : état des flux et fichiers.
