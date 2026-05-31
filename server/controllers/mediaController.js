const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '../data/settings.json');
const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
const playableExtensions = ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi', '.mp3', '.m4a', '.aac', '.wav', '.flac'];
const subtitleExtensions = ['.vtt', '.srt'];

function toSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildMediaUrl(folderName, pathSegments) {
  return `/media/${[folderName, ...pathSegments].map(segment => encodeURIComponent(segment)).join('/')}`;
}

function buildSubtitleUrl(serverId, folderName, pathSegments) {
  const searchParams = new URLSearchParams({
    serverId,
    folderName,
    path: pathSegments.join('/'),
  });
  return `/api/media/subtitles?${searchParams.toString()}`;
}

function buildImageUrl(folderName, pathSegments) {
  return buildMediaUrl(folderName, pathSegments);
}

function findImageFile(dir, folderName, pathSegments = [path.basename(dir)]) {
  try {
    const files = fs.readdirSync(dir);
    const imageFile = files.find(file => imageExtensions.includes(path.extname(file).toLowerCase()));
    return imageFile ? buildImageUrl(folderName, [...pathSegments, imageFile]) : null;
  } catch {
    return null;
  }
}

function findPlayableFile(dir, folderName, pathSegments = [path.basename(dir)]) {
  try {
    const files = fs.readdirSync(dir);
    const playableFile = files.find(file => playableExtensions.includes(path.extname(file).toLowerCase()));
    return playableFile ? buildMediaUrl(folderName, [...pathSegments, playableFile]) : null;
  } catch {
    return null;
  }
}

function findPlayableFileName(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.find(file => playableExtensions.includes(path.extname(file).toLowerCase())) || null;
  } catch {
    return null;
  }
}

function findSubtitleFiles(dir, serverId, folderName, pathSegments = [], mediaFileName = null, mediaTitle = null) {
  try {
    const files = fs.readdirSync(dir);
    const mediaSlug = mediaFileName ? toSlug(path.parse(mediaFileName).name) : null;
    const titleSlug = mediaTitle ? toSlug(mediaTitle) : null;

    return files
      .filter(file => subtitleExtensions.includes(path.extname(file).toLowerCase()))
      .filter(file => {
        const subtitleSlug = toSlug(path.parse(file).name);
        if (mediaSlug && (subtitleSlug === mediaSlug || subtitleSlug.startsWith(mediaSlug) || mediaSlug.startsWith(subtitleSlug))) {
          return true;
        }
        if (titleSlug && (subtitleSlug === titleSlug || subtitleSlug.startsWith(titleSlug) || titleSlug.startsWith(subtitleSlug))) {
          return true;
        }
        return !mediaSlug && !titleSlug;
      })
      .map(file => ({
        label: path.parse(file).name,
        fileName: file,
        url: buildSubtitleUrl(serverId, folderName, [...pathSegments, file]),
      }));
  } catch {
    return [];
  }
}

function toWebVtt(content) {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const converted = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${converted}`;
}

function isMovieCollection(name) {
  // A folder with no year (e.g. "Back to the Future") is a collection;
  // a folder with a year (e.g. "Bullet Train (2022)") is a single movie.
  return !/\b(19|20)\d{2}\b/.test(name);
}

function buildFolderMedia(serverId, folder) {
  const folderPath = folder.mediaLocation;

  if (folder.name.toLowerCase().includes('tv') || folder.name.toLowerCase().includes('movie')) {
    return getFoldersInDir(folderPath).map(name => {
      const subfolderPath = path.join(folderPath, name);
      const isMovieType = folder.name.toLowerCase().includes('movie');
      const isTvType = folder.name.toLowerCase().includes('tv');
      const collection = isMovieType && isMovieCollection(name);
      const playableFileName = isMovieType && !collection ? findPlayableFileName(subfolderPath) : null;
      return {
        title: name,
        type: isTvType ? 'show' : collection ? 'collection' : 'movie',
        imageUrl: findImageFile(subfolderPath, folder.name, [name]),
        mediaUrl: isMovieType && !collection ? findPlayableFile(subfolderPath, folder.name, [name]) : null,
        subtitles: isMovieType && !collection ? findSubtitleFiles(subfolderPath, serverId, folder.name, [name], playableFileName, name) : [],
      };
    });
  }

  if (folder.name.toLowerCase().includes('music') || folder.name.toLowerCase().includes('audiobook')) {
    return getFilesInDir(folderPath).map(name => {
      const ext = path.extname(name).toLowerCase();
      return {
        title: name.replace(/\.[^/.]+$/, ''),
        type: folder.name.toLowerCase().includes('music') ? 'music' : 'audiobook',
        imageUrl: imageExtensions.includes(ext) ? buildImageUrl(folder.name, [name]) : null,
        mediaUrl: playableExtensions.includes(ext) ? buildMediaUrl(folder.name, [name]) : null,
        subtitles: [],
      };
    });
  }

  return [];
}

function getSettings() {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

function findServerFolder(settings, serverId, folderName) {
  const server = settings.servers.find(s => s.id === serverId);
  if (!server) {
    return { error: 'Server not found' };
  }

  const folder = server.folders.find(f => f.name === folderName);
  if (!folder) {
    return { error: 'Folder not found' };
  }

  return { server, folder };
}

function buildShowSeasons(folder, showTitle) {
  const showPath = path.join(folder.mediaLocation, showTitle);
  return getFoldersInDir(showPath).map(name => {
    const seasonPath = path.join(showPath, name);
    return {
      title: name,
      type: 'season',
      imageUrl: findImageFile(seasonPath, folder.name, [showTitle, name]),
    };
  });
}

function buildCollectionMovies(serverId, folder, collectionTitle) {
  const collectionPath = path.join(folder.mediaLocation, collectionTitle);
  return getFoldersInDir(collectionPath).map(name => {
    const moviePath = path.join(collectionPath, name);
    const playableFileName = findPlayableFileName(moviePath);
    return {
      title: name,
      type: 'movie',
      imageUrl: findImageFile(moviePath, folder.name, [collectionTitle, name]),
      mediaUrl: findPlayableFile(moviePath, folder.name, [collectionTitle, name]),
      subtitles: findSubtitleFiles(moviePath, serverId, folder.name, [collectionTitle, name], playableFileName, name),
    };
  });
}

function buildSeasonEpisodes(serverId, folder, showTitle, seasonName) {
  const seasonPath = path.join(folder.mediaLocation, showTitle, seasonName);
  return getFilesInDir(seasonPath)
    .filter(name => playableExtensions.includes(path.extname(name).toLowerCase()))
    .map(name => ({
      title: name.replace(/\.[^/.]+$/, ''),
      type: 'episode',
      imageUrl: null,
      mediaUrl: buildMediaUrl(folder.name, [showTitle, seasonName, name]),
      subtitles: findSubtitleFiles(seasonPath, serverId, folder.name, [showTitle, seasonName], name, name.replace(/\.[^/.]+$/, '')),
    }));
}

function getFoldersInDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (e) {
    return [];
  }
}

function getFilesInDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(dirent => dirent.isFile())
      .map(dirent => dirent.name);
  } catch (e) {
    return [];
  }
}

exports.getAllMedia = (req, res) => {
  let settings;
  try {
    settings = getSettings();
  } catch (e) {
    return res.status(500).json({ error: 'Could not read settings' });
  }
  const updatedServers = settings.servers.map(server => ({
    ...server,
    folders: server.folders.map(folder => {
      const media = buildFolderMedia(server.id, folder);
      return {
        ...folder,
        media,
        children: media.map(m => m.title),
      };
    })
  }));
  try {
    fs.writeFileSync(settingsPath, JSON.stringify({ servers: updatedServers }, null, 2), 'utf-8');
  } catch (e) {}
  res.json({ servers: updatedServers });
};

exports.updateMediaSettings = (req, res) => {
  const newSettings = req.body;
  if (!newSettings || typeof newSettings !== 'object') {
    return res.status(400).json({ error: 'Invalid settings data' });
  }
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to write settings' });
  }
};

exports.getFolderMedia = (req, res) => {
  let settings;
  try {
    settings = getSettings();
  } catch (e) {
    return res.status(500).json({ error: 'Could not read settings' });
  }
  const { serverId, folderName } = req.params;
  const { folder, error } = findServerFolder(settings, serverId, folderName);
  if (error) return res.status(404).json({ error });
  const media = buildFolderMedia(serverId, folder);
  folder.media = media;
  folder.children = media.map(m => m.title);
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {}
  res.json({ media });
};

exports.getShowSeasons = (req, res) => {
  let settings;
  try {
    settings = getSettings();
  } catch (e) {
    return res.status(500).json({ error: 'Could not read settings' });
  }

  const { serverId, folderName, itemTitle } = req.params;
  const { folder, error } = findServerFolder(settings, serverId, folderName);
  if (error) return res.status(404).json({ error });

  const isMovieFolder = folder.name.toLowerCase().includes('movie');
  const media = isMovieFolder && isMovieCollection(itemTitle)
    ? buildCollectionMovies(serverId, folder, itemTitle)
    : buildShowSeasons(folder, itemTitle);
  res.json({ media });
};

exports.getSeasonEpisodes = (req, res) => {
  let settings;
  try {
    settings = getSettings();
  } catch (e) {
    return res.status(500).json({ error: 'Could not read settings' });
  }

  const { serverId, folderName, itemTitle, seasonName } = req.params;
  const { folder, error } = findServerFolder(settings, serverId, folderName);
  if (error) return res.status(404).json({ error });

  const media = buildSeasonEpisodes(serverId, folder, itemTitle, seasonName);
  res.json({ media });
};

exports.getSubtitleFile = (req, res) => {
  let settings;
  try {
    settings = getSettings();
  } catch (e) {
    return res.status(500).json({ error: 'Could not read settings' });
  }

  const { serverId, folderName, path: relativePath } = req.query;
  if (!serverId || !folderName || !relativePath) {
    return res.status(400).json({ error: 'Missing subtitle path parameters' });
  }

  const { folder, error } = findServerFolder(settings, serverId, folderName);
  if (error) return res.status(404).json({ error });

  const rootPath = path.resolve(folder.mediaLocation);
  const targetPath = path.resolve(rootPath, ...String(relativePath).split('/'));
  if (!targetPath.startsWith(rootPath + path.sep) && targetPath !== rootPath) {
    return res.status(403).json({ error: 'Invalid subtitle path' });
  }

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return res.status(404).json({ error: 'Subtitle file not found' });
  }

  const extension = path.extname(targetPath).toLowerCase();
  try {
    const content = fs.readFileSync(targetPath, 'utf-8');
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(extension === '.srt' ? toWebVtt(content) : content.replace(/^\uFEFF/, ''));
  } catch {
    res.status(500).json({ error: 'Failed to read subtitle file' });
  }
};
