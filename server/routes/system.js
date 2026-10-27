const fs = require('fs');
const express = require('express');
const config = require('../config');
const catalog = require('../services/catalog');
const profiles = require('../services/profiles');
const autoscan = require('../services/autoscan');
const streaming = require('../services/streaming');

const router = express.Router();

// --- Search ---------------------------------------------------------------
// GET /api/search?q=matrix&limit=20
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 1) return res.json({ query: q, results: [] });
  res.json({ query: q, results: catalog.searchMedia(q, req.query.limit) });
});

// --- Profiles (no passwords; just per-person watch state) ------------------
router.get('/profiles', (req, res) => {
  res.json({ profiles: profiles.list(), current: req.profileId });
});

router.post('/profiles', (req, res) => {
  const result = profiles.create(req.body && req.body.name);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result);
});

router.patch('/profiles/:id', (req, res) => {
  const { name, primaryColor, secondaryColor } = req.body || {};
  const result = profiles.update(Number.parseInt(req.params.id, 10), { name, primaryColor, secondaryColor });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result);
});

router.delete('/profiles/:id', (req, res) => {
  const result = profiles.remove(Number.parseInt(req.params.id, 10));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result);
});

// --- Library scanning -------------------------------------------------------
router.get('/scan', (req, res) => res.json(autoscan.status()));

// Kick off a rescan in the background; poll GET /scan for progress.
router.post('/scan', (req, res) => {
  if (autoscan.status().running) return res.status(409).json({ error: 'A scan is already running', ...autoscan.status() });
  autoscan.scanAll().catch(e => console.error('[scan] failed:', e.message));
  res.status(202).json(autoscan.status());
});

// --- First-run setup --------------------------------------------------------
function folderExists(p) {
  try {
    return !!p && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// GET /api/setup/status — everything the setup wizard needs in one call.
router.get('/setup/status', (req, res) => {
  const folders = catalog.listFolders().map(f => ({
    serverId: f.server_id,
    serverName: f.server_name,
    name: f.name,
    mediaLocation: f.media_location,
    exists: folderExists(f.media_location),
    itemCount: f.item_count,
  }));
  const ffmpeg = streaming.ffmpegAvailable();
  res.json({
    needsSetup: !folders.some(f => f.mediaLocation),
    node: process.version,
    ffmpeg,
    keys: {
      tmdb: !!config.TMDB_API_KEY,
      omdb: !!config.OMDB_API_KEY,
      opensubtitles: !!config.OPENSUBTITLES_API_KEY,
    },
    authEnabled: !!config.AUTH_PASSWORD,
    autoScanMinutes: config.AUTO_SCAN_MINUTES,
    folders,
  });
});

module.exports = router;
