const express = require('express');
const cors = require('cors');
const mediaRoutes = require('./routes/media');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const settingsPath = path.join(__dirname, './data/settings.json');

// Create a default settings file on first run if one doesn't exist
if (!fs.existsSync(settingsPath)) {
  const defaultSettings = {
    servers: [
      {
        id: 'server1',
        name: 'Home Server',
        folders: [
          { name: 'Movies', mediaLocation: '/mnt/media/Movies' },
          { name: 'TV Shows', mediaLocation: '/mnt/media/TV Shows' },
          { name: 'Music', mediaLocation: '/mnt/media/Music' },
          { name: 'Audiobooks', mediaLocation: '/mnt/media/Audiobooks' },
        ],
      },
    ],
  };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf-8');
  console.log('[Setup] Created default settings.json — update your media paths in the Settings page.');
}

function loadMediaFolders() {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return settings.servers.flatMap(server =>
      server.folders.map(folder => ({
        folderName: folder.name,
        mediaLocation: folder.mediaLocation,
      }))
    );
  } catch {
    return [];
  }
}

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
  const mediaFolder = loadMediaFolders().find(folder => folder.folderName === folderName);

  if (!mediaFolder) {
    return res.status(404).send('Media folder not found');
  }

  const rootPath = path.resolve(mediaFolder.mediaLocation);
  const targetPath = path.resolve(rootPath, ...fileSegments);

  if (!targetPath.startsWith(rootPath + path.sep) && targetPath !== rootPath) {
    return res.status(403).send('Invalid media path');
  }

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return res.status(404).send('Media file not found');
  }

  return res.sendFile(targetPath);
});

loadMediaFolders().forEach(folder => {
  console.log(`[Media Root] ${folder.folderName} -> ${folder.mediaLocation}`);
});

// Use media routes
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