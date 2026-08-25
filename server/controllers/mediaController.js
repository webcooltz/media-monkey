const fs = require('fs');
const path = require('path');
const catalog = require('../services/catalog');
const scanner = require('../services/scanner');
const metadata = require('../services/metadata');
const subtitlesService = require('../services/subtitles');
const cleanvid = require('../services/cleanvid');
const { getDb } = require('../db');
const { folderKind } = require('../constants');

// Resolve an item's stored /media/... URL back to an absolute on-disk path.
function resolveMediaPath(folderRow, mediaUrl) {
  if (!mediaUrl) return null;
  const segments = mediaUrl.replace(/^\/media\//, '').split('/').map(decodeURIComponent);
  const [, ...fileSegments] = segments; // drop folderName segment
  const rootPath = path.resolve(folderRow.media_location);
  const targetPath = path.resolve(rootPath, ...fileSegments);
  if (!targetPath.startsWith(rootPath + path.sep) && targetPath !== rootPath) return null;
  return targetPath;
}

function toWebVtt(content) {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const converted = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${converted}`;
}

exports.getAllMedia = (req, res) => {
  try {
    res.json({ servers: catalog.getServersWithMedia() });
  } catch (e) {
    res.status(500).json({ error: 'Could not read catalog' });
  }
};

exports.updateMediaSettings = (req, res) => {
  const newSettings = req.body;
  if (!newSettings || !Array.isArray(newSettings.servers)) {
    return res.status(400).json({ error: 'Invalid settings data' });
  }
  try {
    catalog.saveSettings(newSettings.servers);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
};

exports.getFolderMedia = (req, res) => {
  const { serverId, folderName } = req.params;
  const refresh = req.query.refresh === 'true' || req.query.refresh === '1';
  try {
    const { media, error } = catalog.getFolderMedia(serverId, folderName, { refresh });
    if (error) return res.status(404).json({ error });
    res.json({ media });
  } catch (e) {
    res.status(500).json({ error: 'Could not read folder media' });
  }
};

exports.getShowSeasons = (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const folder = { name: folderRow.name, mediaLocation: folderRow.media_location };
  const isMovieFolder = folderKind(folder.name) === 'movies';
  const media = isMovieFolder && scanner.isMovieCollection(itemTitle)
    ? scanner.scanCollectionMovies(serverId, folder, itemTitle)
    : scanner.scanShowSeasons(folder, itemTitle);
  res.json({ media });
};

exports.getSeasonEpisodes = (req, res) => {
  const { serverId, folderName, itemTitle, seasonName } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const folder = { name: folderRow.name, mediaLocation: folderRow.media_location };
  res.json({ media: scanner.scanSeasonEpisodes(serverId, folder, itemTitle, seasonName) });
};

exports.fetchMetadata = async (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const item = getDb().prepare('SELECT * FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  const isShow = item ? item.type === 'show' : folderKind(folderName) === 'tv';

  try {
    const meta = await metadata.lookup(itemTitle, { isShow });
    if (!meta) return res.json({ found: false });
    if (meta.stub) {
      return res.json({ stub: true, message: 'No metadata provider configured. Add TMDB_API_KEY (or OMDB_API_KEY) to server/.env.' });
    }
    const result = catalog.setItemMetadata(serverId, folderName, itemTitle, meta);
    if (result.error) return res.status(404).json(result);
    res.json({ found: true, provider: meta.provider, item: result.item });
  } catch (e) {
    res.status(502).json({ error: 'Metadata lookup failed: ' + e.message });
  }
};

exports.findSubtitles = async (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });
  const item = getDb().prepare('SELECT * FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  const isShow = item ? item.type === 'show' : folderKind(folderName) === 'tv';
  try {
    const result = await subtitlesService.find(itemTitle, { isShow });
    if (result.stub) {
      return res.json({ stub: true, message: 'No subtitle provider configured. Add OPENSUBTITLES_API_KEY to server/.env.' });
    }
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: 'Subtitle search failed: ' + e.message });
  }
};

exports.runCleanvid = async (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });
  const item = getDb().prepare('SELECT * FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  if (!item || !item.media_url) return res.status(400).json({ error: 'No playable file for this item' });

  const inputPath = resolveMediaPath(folderRow, item.media_url);
  try {
    const result = await cleanvid.clean(inputPath);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'cleanvid failed: ' + e.message });
  }
};

exports.uploadCover = (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const rootPath = path.resolve(folderRow.media_location);
  const itemDir = path.resolve(rootPath, itemTitle);
  if (!itemDir.startsWith(rootPath + path.sep) && itemDir !== rootPath) {
    return res.status(403).json({ error: 'Invalid item path' });
  }
  if (!fs.existsSync(itemDir) || !fs.statSync(itemDir).isDirectory()) {
    return res.status(400).json({ error: 'This item has no folder to store a cover in' });
  }

  const match = image.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Unsupported image format' });
  const buffer = Buffer.from(match[2], 'base64');

  const outPath = path.join(itemDir, 'poster.jpg');
  try {
    fs.writeFileSync(outPath, buffer);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to write cover: ' + e.message });
  }

  // Cache-bust so the browser reloads the new image immediately.
  const url = `/media/${[folderName, itemTitle, 'poster.jpg'].map(encodeURIComponent).join('/')}?v=${Date.now()}`;
  const result = catalog.setItemImage(serverId, folderName, itemTitle, url);
  if (result.error) return res.status(404).json(result);
  res.json({ success: true, imageUrl: url, item: result.item });
};

exports.getSubtitleFile = (req, res) => {
  const { serverId, folderName, path: relativePath } = req.query;
  if (!serverId || !folderName || !relativePath) {
    return res.status(400).json({ error: 'Missing subtitle path parameters' });
  }

  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const rootPath = path.resolve(folderRow.media_location);
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

function listWindowsDrives() {
  const drives = [];
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    try {
      if (fs.existsSync(root)) drives.push({ name: `${letter}:`, path: root });
    } catch {}
  }
  return drives;
}

exports.browseDirectory = (req, res) => {
  const requestedPath = req.query.path ? String(req.query.path) : '';

  if (!requestedPath && process.platform === 'win32') {
    return res.json({ path: '', parent: null, directories: listWindowsDrives() });
  }

  const targetPath = path.resolve(requestedPath || '/');

  let stat;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    return res.status(404).json({ error: 'Path not found' });
  }
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' });
  }

  let directories;
  try {
    directories = fs.readdirSync(targetPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => ({ name: dirent.name, path: path.join(targetPath, dirent.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return res.status(403).json({ error: 'Cannot read directory' });
  }

  const parent = path.dirname(targetPath);
  const atRoot = parent === targetPath;

  res.json({
    path: targetPath,
    parent: atRoot ? (process.platform === 'win32' ? '' : null) : parent,
    directories,
  });
};
