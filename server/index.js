const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getDb } = require('./db');
const mediaRoutes = require('./routes/media');

const app = express();
const PORT = config.PORT;

app.use(cors());
// Larger limit so base64 cover uploads fit
app.use(express.json({ limit: '25mb' }));

// Open the SQLite catalog (creates + migrates from settings.json on first run).
getDb();

// Serve raw media files. Resolves the folder's on-disk root from the catalog.
app.use('/media', (req, res, next) => {
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

  return res.sendFile(targetPath);
});

app.use('/api/media', mediaRoutes);

// Serve built React client in production
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
