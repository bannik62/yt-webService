# Plan : téléchargements via worker local (IP résidentielle)

Objectif : quand le **proxy WebShare** est indisponible ou le **VPS est bloqué** par YouTube, déléguer les **téléchargements** à un **worker** chez l’utilisateur (FTTH / futur Raspberry), puis livrer le fichier comme aujourd’hui depuis le VPS.

Les **tendances / recherche** restent sur le flux actuel (proxy si dispo, sinon IP VPS avec repli déjà en place quand applicable).

---

## Prérequis

- Machine locale : **yt-dlp**, **ffmpeg**, même logique **MP3 / MP4** que `backend/src/ripper/runDownload.js`.
- Connexion **sortante** stable (ta fibre ~125 Mb/s ↑ suffit pour des fichiers unitaires raisonnables).
- **Secret partagé** (`WORKER_INGEST_SECRET` ou équivalent) entre worker et VPS.
- Pas besoin d’**IPv4 entrante** sur la box : le flux principal est **worker → VPS** (POST fichier).

---

## Dépôt vs machine (bundle worker)

Le dossier **`serveurLocal/`** dans le dépôt git est un **modèle à copier** sur la machine où tu exécutes le worker (FTTH, Raspberry, etc.) — ce n’est pas censé être ton dossier de travail quotidien du site. Les commandes `docker compose` et le fichier **`.env`** se font **sur la copie** (là où tu déploies le bundle, ex. `C:\yt\…`), pas obligatoirement depuis le clone du repo sur ta machine de dev.

---

## Phase 1 — Worker local (prioritaire)

1. **Bundle worker** (`serveurLocal/` dans le dépôt, copié sur la machine hôte) : **Fastify** + `docker-compose.yml` pour **Docker Desktop (Windows)** ou Linux. Santé : `GET /health` (optionnellement ping l’API via `VPS_HEALTH_URL`). L’API principale expose `GET /api/worker-local/health` si `WORKER_LOCAL_URL` pointe vers ce service.
   - **Tunnel SSH au runtime** : si `ENABLE_SSH_TUNNEL=true`, l’**entrypoint** du conteneur lance `ssh -N -R` vers le VPS — secrets uniquement dans **`.env` sur la copie** (modèle : `.env.example` du bundle) — **pas** au **build** Docker. Défauts d’exemple : utilisateur **`ubuntu`**, port SSH **`2222`** (`SSH_REMOTE_PORT`). Auth : **`SSH_PASSWORD`** (sshpass) ou clé dans **`ssh/id_worker`** (dossier `ssh/` à côté de `docker-compose` sur la copie) → `SSH_PRIVATE_KEY_FILE=/run/ssh/id_worker`. **API dans Docker + `WORKER_LOCAL_URL=http://host.docker.internal:SSH_RPORT`** : le forward **ne peut pas** rester sur **`127.0.0.1` côté VPS seul** (timeout) — utiliser **`SSH_REMOTE_BIND=0.0.0.0`** sur le worker (défaut du compose modèle) et **`GatewayPorts clientspecified`** (ou `yes`) dans **`sshd_config`**, sans ouvrir `SSH_RPORT` au public. Vérifier : depuis le shell du VPS, `curl -sS http://127.0.0.1:SSH_RPORT/health` ; et depuis le conteneur `api`, la route `/api/worker-local/health` ou les logs connectivity. Mot de passe : `PasswordAuthentication` côté sshd.
2. Suite : **yt-dlp** / `POST` job + secret, comme dans le plan initial (`local-worker/` pouvant être fusionné avec ce dossier plus tard).
3. Test manuel : une URL connue → fichier OK sur disque.

**Critère de succès** : même résultat qu’un `runDownload` local sans passer par le VPS.

---

## Phase 2 — Ingestion sur le VPS

1. **Implémenté** : routes Fastify (fichier `backend/src/routes/workerIngest.js`, préfixe `/api/worker`) :
   - **`POST /api/worker/jobs/reserve`** — JSON optionnel `{ "output": "video" | "audio" }` ; réponse `{ jobId }`. Header **`Authorization: Bearer <WORKER_INGEST_SECRET>`**.
   - **`POST /api/worker/ingest/:jobId`** — multipart, champ **`file`** (extensions : `.mp3` `.mp4` `.webm` `.mkv` `.m4a` `.opus`). Même Bearer. Finalise le job (`GET /api/jobs/:id/file/:idx` inchangé).
   - **`GET /api/worker/delegations/next`** — tâche **téléchargement** (`jobId`, `url`, `output`, `noPlaylist`) ou, en priorité, **analyse Ripper** après 402 proxy : `{ "kind": "probe", "probeId", "url", "noPlaylist" }`. Le worker exécute `yt-dlp` en `--dump-single-json` (sans proxy WebShare) puis **`POST /api/worker/probe-delegation/:probeId/complete`** avec `{ "ok": true, "dump": <objet JSON yt-dlp> }` ou `{ "ok": false, "error": "…" }`.
2. Variable d’environnement **`WORKER_INGEST_SECRET`** obligatoire sur l’API pour ces routes (sinon **503** sur reserve/ingest).
3. **`WORKER_INGEST_MAX_IDLE_MS`** (défaut **900000** = 15 min ; **`0`** désactive la garde) — si **`WORKER_LOCAL_URL`** est définie, l’API doit réussir un **GET** `{WORKER_LOCAL_URL}/health` dans ce délai ; sinon **`POST`** reserve/ingest renvoient **503** avec message explicite dans les logs (**`workerIngestGate.js`**).
4. Test local : réserver un `jobId`, envoyer un petit fichier avec `curl -F file=@...`, puis `GET /api/jobs/:jobId/file/0`.

**Critère de succès** : fichier récupérable via la même API qu’aujourd’hui.

---

## Phase 3 — Intégration métier (`JobManager` / download)

1. Règle : **si proxy utilisable** (pool non vide, pas 402) → comportement actuel sur le VPS.
2. **Sinon** (ou flag `FORCE_LOCAL_WORKER`) : ne pas lancer `runDownload` sur le VPS ; soit :
   - **A.** Appeler le worker via **HTTP(S)** (URL configurable `LOCAL_WORKER_URL` si exposé), **ou**
   - **B.** Mettre le job en « waiting worker » et le **worker poll** `GET /api/jobs/pending-for-worker` (à définir).
3. À la réception du fichier (ingest), marquer le job **completed** et **émettre SSE** comme aujourd’hui.

**Critère de succès** : depuis le site hébergé sur le VPS, un téléchargement **aboutit** avec le worker maison lancé.

---

## Phase 4 — Durcissement

- Timeouts, **taille max** upload, **rate limit** (Redis plus tard si besoin).
- Logs : erreur brute serveur, message utilisateur via `formatDownloadErrorForUser` côté job.
- Tunnel **SSH `-R`** : déjà prévu en **option** dans le bundle worker (démarrage conteneur) pour que le VPS joigne le worker sans IPv4 entrante sur la box ; avec **push worker → VPS** seul, pas strictement nécessaire en v1.

---

## Pistes d’évolution

- Worker sur **Raspberry Pi 5** : même image Docker, `docker compose up -d`.
- Retry WebShare gratuit **1 Go/mois** en complément sans supprimer l’intégration actuelle.

---

## Fichiers / dossiers (git)

Voir `.gitignore` : **`serveurLocal/`** entier ignoré (copie locale / tests, pas de push du bundle) ; répertoires `local-worker/`, `home-worker/`, `*.local.worker.env`. Pour re-versionner le modèle worker plus tard, retirer `serveurLocal/` du `.gitignore`.
