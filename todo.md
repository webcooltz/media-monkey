# Done (2026-08-24)

- [x] File picker for Settings paths (server-side dir browser) — FolderPicker.tsx + /api/media/browse
- [x] Refresh-only updates: normal load adds new items, keeps existing; "Refresh" in folder kebab does full rescan + prune
- [x] Image lookup — TMDB poster fallback (stubbed until TMDB_API_KEY set)
- [x] SQLite catalog (node:sqlite) replaces settings.json — server/db.js, services/catalog.js (migrates old settings.json on first run)
- [x] .env file — server/config.js via process.loadEnvFile; server/.env.example
- [x] Docker — Dockerfile + docker-compose.yml (node+react+ffmpeg+cleanvid), optional
- [x] Collection folders (no year) → descend to child movies (already existed)
- [x] Seasons + show/season pages (already existed)
- [x] Compare data to IMDB/other DB — TMDB/OMDb metadata (rating, overview, year, IMDB link); stubbed until key set
- [x] Subtitle finder/importer — OpenSubtitles search (stubbed until OPENSUBTITLES_API_KEY set; import wiring pending)
- [x] cleanvid integration — endpoint + button; stubbed until CLEANVID_ENABLED=true (needs python+ffmpeg)

- [x] Cover upload + in-app adjust — CoverEditor.tsx (pan/zoom crop to 2:3), saves poster.jpg into the item's on-disk folder via POST /:sid/:folder/:title/cover; catalog image_url updated (cache-busted)
- [x] URL routing — react-router; every page has a slash route (/item/:sid/:folder/:title, /item/.../season/:season, /folder/..., /play, /settings). Refresh restores the page (SPA fallback in vite dev + express prod)

# Follow-ups / not finished

- Subtitle IMPORT/download from OpenSubtitles (needs login-token flow) — search works, download stubbed
- cleanvid: run as async job + progress UI (currently synchronous request)
- Persist seasons/episodes/collection children in DB (currently scanned on-demand each request)
- Real API keys: add TMDB_API_KEY / OMDB_API_KEY / OPENSUBTITLES_API_KEY to server/.env to activate live lookups
- Migrate off the legacy server/data/settings.json file entirely (kept only for one-time seed)
