const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getDb } = require('./db');
const mediaRoutes = require('./routes/media');
const collectionRoutes = require('./routes/collections');
const systemRoutes = require('./routes/system');
const keyStatus = require('./services/keyStatus');
const profiles = require('./services/profiles');
const auth = require('./auth');

const app = express();

app.disable('x-powered-by');
if (config.TRUST_PROXY) app.set('trust proxy', true);

// Baseline security headers (no helmet dep needed for these).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Same-origin deployment (server serves the client), so cookies stay first-party.
// CORS is opt-in via CORS_ORIGIN for split dev setups.
if (config.CORS_ORIGIN) app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
// Larger limit so base64 cover uploads fit
app.use(express.json({ limit: '25mb' }));

// Open the SQLite catalog (creates + migrates from settings.json on first run).
getDb();

// Liveness probe for Docker / uptime monitors (no auth, no data).
app.get('/healthz', (req, res) => res.json({ ok: true }));

// --- Auth (open) endpoints -------------------------------------------------
app.get('/api/auth/status', (req, res) => {
  res.json({ authRequired: auth.authEnabled(), authenticated: auth.isAuthed(req) });
});

app.post('/api/auth/login', auth.loginLimiter, (req, res) => {
  if (!auth.authEnabled()) return res.json({ success: true });
  if (!auth.checkPassword(req.body && req.body.password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.setHeader('Set-Cookie', auth.sessionCookie(req));
  res.json({ success: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', auth.clearCookie());
  res.json({ success: true });
});

// Everything below requires a valid session (when auth is enabled).
// Serve raw media files. Resolves the folder's on-disk root from the catalog.
app.use('/media', auth.requireAuth, (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  const relativePath = req.path.replace(/^\/+/, '');
  let segments;
  try {
    segments = relativePath.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
  } catch {
    return res.status(400).send('Malformed media path');
  }

  if (segments.length < 2) {
    return res.status(404).send('Media file not found');
  }

  const [folderName, ...fileSegments] = segments;

  // Find any folder (across servers) matching this name.
  const folderRow = getDb().prepare('SELECT * FROM folders WHERE name = ?').get(folderName);
  if (!folderRow || !folderRow.media_location) {
    return res.status(404).send('Media folder not found');
  }

  const rootPath = path.resolve(folderRow.media_location);
  const targetPath = path.resolve(rootPath, ...fileSegments);

  if (!targetPath.startsWith(rootPath + path.sep) && targetPath !== rootPath) {
    return res.status(403).send('Invalid media path');
  }

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return res.status(404).send('Media file not found');
  }

  // ?download=1 → save-as attachment with the original filename (range requests still work).
  if (req.query.download) {
    return res.download(targetPath, path.basename(targetPath), { maxAge: '7d' });
  }

  // Cache posters/media on the client so grid scrolls don't re-hit the Pi's CPU + SD.
  return res.sendFile(targetPath, { maxAge: '7d' });
});

// Resolve the active profile (X-Profile-Id header) for everything under /api.
app.use('/api', profiles.middleware);

app.use('/api/media', auth.requireAuth, mediaRoutes);
app.use('/api/collections', auth.requireAuth, collectionRoutes);
app.use('/api', auth.requireAuth, systemRoutes);

// API-key status for the Settings page (configured/valid + OpenSubtitles remaining).
app.get('/api/keys/status', auth.requireAuth, async (req, res) => {
  try {
    res.json(await keyStatus.all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unknown API routes → JSON 404 (must precede the SPA fallback, which would answer them with index.html).
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve built React client in production
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  // Vite emits content-hashed asset filenames, so long-cache them; index.html stays fresh.
  app.use(express.static(clientDistPath, { maxAge: '30d', index: false }));
  app.use((req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Last-resort error handler: never leak stack traces to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  // Errors from express/send carry their own client-error status (416 bad Range, 404…).
  const status = err && (err.status || err.statusCode);
  if (status >= 400 && status < 500) {
    if (res.headersSent) return res.end();
    return res.status(status).json({ error: err.message || 'Request failed' });
  }
  console.error('[server] Unhandled error:', err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
