const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getDb } = require('./db');
const mediaRoutes = require('./routes/media');
const collectionRoutes = require('./routes/collections');
const keyStatus = require('./services/keyStatus');
const auth = require('./auth');

const app = express();
const PORT = config.PORT;

// Same-origin deployment (server serves the client), so cookies stay first-party.
app.use(cors());
// Larger limit so base64 cover uploads fit
app.use(express.json({ limit: '25mb' }));

// Open the SQLite catalog (creates + migrates from settings.json on first run).
getDb();

// --- Auth (open) endpoints -------------------------------------------------
app.get('/api/auth/status', (req, res) => {
  res.json({ authRequired: auth.authEnabled(), authenticated: auth.isAuthed(req) });
});

app.post('/api/auth/login', (req, res) => {
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
  const segments = relativePath.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));

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

  // Cache posters/media on the client so grid scrolls don't re-hit the Pi's CPU + SD.
  return res.sendFile(targetPath, { maxAge: '7d' });
});

app.use('/api/media', auth.requireAuth, mediaRoutes);
app.use('/api/collections', auth.requireAuth, collectionRoutes);

// API-key status for the Settings page (configured/valid + OpenSubtitles remaining).
app.get('/api/keys/status', auth.requireAuth, async (req, res) => {
  try {
    res.json(await keyStatus.all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve built React client in production
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  // Vite emits content-hashed asset filenames, so long-cache them; index.html stays fresh.
  app.use(express.static(clientDistPath, { maxAge: '30d', index: false }));
  app.use((req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
