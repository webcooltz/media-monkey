const fs = require('fs');
const path = require('path');
const catalog = require('../services/catalog');
const scanner = require('../services/scanner');
const metadata = require('../services/metadata');
const subtitlesService = require('../services/subtitles');
const streaming = require('../services/streaming');
const cleanvid = require('../services/cleanvid');
const { getDb } = require('../db');
const { folderKind } = require('../constants');

// The on-disk folder that holds an item's files (poster, subtitles). Uses the
// item's stored rel_path so movies nested inside a collection folder
// (rel_path "Collection/Movie") resolve correctly, not just top-level ones.
// Returns null if the path escapes the media root or the item is unknown.
function itemDirFromTitle(folderRow, itemTitle) {
  const row = getDb().prepare('SELECT rel_path FROM media_items WHERE folder_id = ? AND title = ?')
    .get(folderRow.id, itemTitle);
  const rel = row ? row.rel_path : itemTitle;
  const rootPath = path.resolve(folderRow.media_location);
  const dir = path.resolve(rootPath, ...String(rel).split('/'));
  if (!dir.startsWith(rootPath + path.sep) && dir !== rootPath) return null;
  return dir;
}

// Download a remote poster (e.g. TMDB) into the item's folder as poster.jpg and
// return its local /media URL, so it persists on disk and survives rescans (a
// bare remote URL in image_url gets overwritten the next time the folder is
// rescanned). Falls back to the original URL if the download can't be saved.
async function persistPoster(folderRow, folderName, itemTitle, posterUrl) {
  if (!posterUrl || !/^https?:/i.test(posterUrl)) return posterUrl || null;
  const itemDir = itemDirFromTitle(folderRow, itemTitle);
  if (!itemDir || !fs.existsSync(itemDir) || !fs.statSync(itemDir).isDirectory()) return posterUrl;
  try {
    const r = await fetch(posterUrl);
    if (!r.ok) return posterUrl;
    fs.writeFileSync(path.join(itemDir, 'poster.jpg'), Buffer.from(await r.arrayBuffer()));
    const rootPath = path.resolve(folderRow.media_location);
    const relSegs = path.relative(rootPath, itemDir).split(path.sep);
    return `/media/${[folderName, ...relSegs, 'poster.jpg'].map(encodeURIComponent).join('/')}?v=${Date.now()}`;
  } catch {
    return posterUrl;
  }
}

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
  const refresh = req.query.refresh === 'true' || req.query.refresh === '1';
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const folder = { name: folderRow.name, mediaLocation: folderRow.media_location };
  const isMovieFolder = folderKind(folder.name) === 'movies';
  const isCollection = isMovieFolder && scanner.isMovieCollection(itemTitle);
  const cacheKey = `${isCollection ? 'collection' : 'seasons'}:${itemTitle}`;
  const media = catalog.getChildren(folderRow, cacheKey, () => (
    isCollection
      ? scanner.scanCollectionMovies(serverId, folder, itemTitle)
      : scanner.scanShowSeasons(folder, itemTitle)
  ), { refresh });
  res.json({ media });
};

exports.getSeasonEpisodes = (req, res) => {
  const { serverId, folderName, itemTitle, seasonName } = req.params;
  const refresh = req.query.refresh === 'true' || req.query.refresh === '1';
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const folder = { name: folderRow.name, mediaLocation: folderRow.media_location };
  const cacheKey = `episodes:${itemTitle}/${seasonName}`;
  const media = catalog.getChildren(folderRow, cacheKey, () => (
    scanner.scanSeasonEpisodes(serverId, folder, itemTitle, seasonName)
  ), { refresh });
  res.json({ media });
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
    // No confident match — save the candidates so the item page can show them
    // later (e.g. after a batch fetch), and hand them back now.
    if (meta.suggestions) {
      catalog.setItemSuggestions(serverId, folderName, itemTitle, meta.suggestions);
      return res.json({ suggestions: meta.suggestions });
    }

    meta.posterUrl = await persistPoster(folderRow, folderName, itemTitle, meta.posterUrl);
    const result = catalog.setItemMetadata(serverId, folderName, itemTitle, meta);
    if (result.error) return res.status(404).json(result);
    res.json({ found: true, provider: meta.provider, item: result.item });
  } catch (e) {
    res.status(502).json({ error: 'Metadata lookup failed: ' + e.message });
  }
};

// POST /api/media/:serverId/:folderName/:itemTitle/metadata/apply  { tmdbId }
// Apply a suggestion the user approved (resolves the chosen TMDB id to full metadata).
exports.applyMetadata = async (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const { tmdbId } = req.body || {};
  if (!tmdbId) return res.status(400).json({ error: 'Missing tmdbId' });

  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });
  const item = getDb().prepare('SELECT * FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  const isShow = item ? item.type === 'show' : folderKind(folderName) === 'tv';

  try {
    const meta = await metadata.resolveTmdbById(tmdbId, isShow);
    if (!meta) return res.json({ found: false });
    meta.posterUrl = await persistPoster(folderRow, folderName, itemTitle, meta.posterUrl);
    const result = catalog.setItemMetadata(serverId, folderName, itemTitle, meta);
    if (result.error) return res.status(404).json(result);
    res.json({ found: true, provider: meta.provider, item: result.item });
  } catch (e) {
    res.status(502).json({ error: 'Metadata apply failed: ' + e.message });
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

// Pull season + episode numbers from an episode title, falling back to the season
// folder name for the season. Handles S01E02 / 1x02 / "e01 Uno" / "Episode 3" /
// leading-number names. Returns { season, episode } (nulls if not found).
function parseSeasonEpisode(episodeTitle, seasonName) {
  const t = String(episodeTitle);
  let season = null;
  let episode = null;

  let m = t.match(/s(\d{1,2})[\s._-]*e(\d{1,3})/i) || t.match(/(\d{1,2})x(\d{1,3})/);
  if (m) { season = Number(m[1]); episode = Number(m[2]); }
  else {
    m = t.match(/\be(?:p(?:isode)?)?[\s._-]*(\d{1,3})\b/i) || t.match(/^\s*(\d{1,3})\b/);
    if (m) episode = Number(m[1]);
  }
  if (season == null && seasonName) {
    const sm = String(seasonName).match(/(\d{1,2})/);
    if (sm) season = Number(sm[1]);
  }
  return { season, episode };
}

// Resolve + validate a season directory (rootPath/showTitle/seasonName) for an
// episode subtitle op. Sends the response and returns null on any problem.
function resolveSeasonDir(res, folderRow, showTitle, seasonName) {
  const rootPath = path.resolve(folderRow.media_location);
  const seasonDir = path.resolve(rootPath, showTitle, seasonName);
  if (!seasonDir.startsWith(rootPath + path.sep)) {
    res.status(403).json({ error: 'Invalid episode path' });
    return null;
  }
  if (!fs.existsSync(seasonDir) || !fs.statSync(seasonDir).isDirectory()) {
    res.status(404).json({ error: 'Season folder not found' });
    return null;
  }
  return seasonDir;
}

// Strip anything path-ish from an OpenSubtitles filename and force a .srt extension.
function safeSubtitleName(fileName, itemTitle, language) {
  const base = fileName ? path.basename(String(fileName)).replace(/[/\\:*?"<>|]/g, '_') : '';
  if (base && /\.(srt|vtt)$/i.test(base)) return base;
  const stem = (base || `${itemTitle}.${language || 'en'}`).replace(/\.(srt|vtt)$/i, '');
  return `${stem}.srt`;
}

// Avoid clobbering an existing subtitle file: append .1, .2, … before the extension.
function uniqueSubtitlePath(dir, fileName) {
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, -ext.length);
  let candidate = path.join(dir, fileName);
  let n = 1;
  while (fs.existsSync(candidate)) candidate = path.join(dir, `${stem}.${n++}${ext}`);
  return candidate;
}

// POST /api/media/:serverId/:folderName/:itemTitle/subtitles  { fileId, language? }
// Downloads a searched OpenSubtitles result and saves it into the item's folder so
// it's kept on disk and auto-loads on playback (via a folder rescan).
exports.downloadSubtitle = async (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const { fileId, language } = req.body || {};
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const itemDir = itemDirFromTitle(folderRow, itemTitle);
  if (!itemDir) return res.status(403).json({ error: 'Invalid item path' });
  if (!fs.existsSync(itemDir) || !fs.statSync(itemDir).isDirectory()) {
    return res.status(400).json({ error: 'This item has no folder to store subtitles in' });
  }

  try {
    const result = await subtitlesService.download(fileId);
    if (result.stub) {
      return res.json({ stub: true, message: 'No subtitle provider configured. Add OPENSUBTITLES_API_KEY to server/.env.' });
    }
    if (result.needsLogin) {
      return res.status(400).json({ error: 'OpenSubtitles login not configured. Set OPENSUBTITLES_USERNAME and OPENSUBTITLES_PASSWORD in server/.env.' });
    }

    const fileName = safeSubtitleName(result.fileName, itemTitle, language);
    const outPath = uniqueSubtitlePath(itemDir, fileName);
    fs.writeFileSync(outPath, result.content, 'utf-8');

    // Rescan the folder so the new file becomes a tracked subtitle track on the item.
    const refreshed = catalog.getFolderMedia(serverId, folderName, { refresh: true });
    const item = (refreshed.media || []).find(m => m.title === itemTitle);
    res.json({
      success: true,
      fileName: path.basename(outPath),
      remaining: result.remaining,
      subtitles: item ? item.subtitles : [],
      item: item || null,
    });
  } catch (e) {
    res.status(502).json({ error: 'Subtitle download failed: ' + e.message });
  }
};

// POST /api/media/:serverId/:folderName/:itemTitle/:seasonName/:episodeTitle/find-subtitles
// Search OpenSubtitles for one TV episode (season/episode parsed from its filename).
exports.findEpisodeSubtitles = async (req, res) => {
  const { serverId, folderName, itemTitle, seasonName, episodeTitle } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });
  if (!resolveSeasonDir(res, folderRow, itemTitle, seasonName)) return;

  const { season, episode } = parseSeasonEpisode(episodeTitle, seasonName);
  try {
    // Search by the SHOW title (itemTitle) narrowed to this season/episode.
    const result = await subtitlesService.find(itemTitle, { isShow: true, season, episode });
    if (result.stub) {
      return res.json({ stub: true, message: 'No subtitle provider configured. Add OPENSUBTITLES_API_KEY to server/.env.' });
    }
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: 'Subtitle search failed: ' + e.message });
  }
};

// POST /api/media/:serverId/:folderName/:itemTitle/:seasonName/:episodeTitle/subtitles
//   body { fileId, language? }
// Download a searched subtitle and save it beside the episode file (named to match
// the episode so it associates on rescan). Kept on disk + auto-loads on playback.
exports.downloadEpisodeSubtitle = async (req, res) => {
  const { serverId, folderName, itemTitle, seasonName, episodeTitle } = req.params;
  const { fileId, language } = req.body || {};
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });
  const seasonDir = resolveSeasonDir(res, folderRow, itemTitle, seasonName);
  if (!seasonDir) return;

  try {
    const result = await subtitlesService.download(fileId);
    if (result.stub) {
      return res.json({ stub: true, message: 'No subtitle provider configured. Add OPENSUBTITLES_API_KEY to server/.env.' });
    }
    if (result.needsLogin) {
      return res.status(400).json({ error: 'OpenSubtitles login not configured. Set OPENSUBTITLES_USERNAME and OPENSUBTITLES_PASSWORD in server/.env.' });
    }

    // Name after the episode (+ language) so findSubtitleFiles slug-matches it to
    // this episode only — not every episode in the season.
    const lang = language || 'en';
    const fileName = `${String(episodeTitle).replace(/[/\\:*?"<>|]/g, '_')}.${lang}.srt`;
    const outPath = uniqueSubtitlePath(seasonDir, fileName);
    fs.writeFileSync(outPath, result.content, 'utf-8');

    // Rescan just this season (busting its child cache) so the new track shows up.
    const folder = { name: folderRow.name, mediaLocation: folderRow.media_location };
    const cacheKey = `episodes:${itemTitle}/${seasonName}`;
    const episodes = catalog.getChildren(
      folderRow, cacheKey,
      () => scanner.scanSeasonEpisodes(serverId, folder, itemTitle, seasonName),
      { refresh: true },
    );
    const ep = episodes.find(e => e.title === episodeTitle);
    res.json({
      success: true,
      fileName: path.basename(outPath),
      remaining: result.remaining,
      subtitles: ep ? ep.subtitles : [],
      episodeTitle,
    });
  } catch (e) {
    res.status(502).json({ error: 'Subtitle download failed: ' + e.message });
  }
};

// Map a season folder name to a TMDB season number. "Season 1" → 1,
// "Specials" / "Season 0" → 0, else null (skip).
function seasonNumberFromName(name) {
  const n = String(name).toLowerCase();
  if (/special/.test(n)) return 0;
  const m = n.match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

// POST /api/media/:serverId/:folderName/:itemTitle/season-posters
// Fetch each season's poster from TMDB and save it as poster.jpg inside the season
// folder (kept on disk; picked up as the season cover on rescan).
exports.fetchSeasonPosters = async (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const rootPath = path.resolve(folderRow.media_location);
  const showDir = path.resolve(rootPath, itemTitle);
  if (!showDir.startsWith(rootPath + path.sep)) return res.status(403).json({ error: 'Invalid show path' });
  if (!fs.existsSync(showDir) || !fs.statSync(showDir).isDirectory()) {
    return res.status(404).json({ error: 'Show folder not found' });
  }

  try {
    const lookup = await metadata.lookupTvSeasons(itemTitle);
    if (lookup.stub) {
      return res.json({ stub: true, message: 'No metadata provider configured. Add TMDB_API_KEY to server/.env.' });
    }
    const byNumber = new Map((lookup.seasons || []).map(s => [s.seasonNumber, s]));

    const seasonFolders = fs.readdirSync(showDir, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name);

    let saved = 0;
    const missing = [];
    for (const seasonName of seasonFolders) {
      const num = seasonNumberFromName(seasonName);
      const match = num != null ? byNumber.get(num) : null;
      if (!match || !match.posterUrl) { missing.push(seasonName); continue; }

      const imgRes = await fetch(match.posterUrl);
      if (!imgRes.ok) { missing.push(seasonName); continue; }
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(path.join(showDir, seasonName, 'poster.jpg'), buffer);
      saved++;
    }

    // Rebuild the seasons cache so the new covers show up; cache-bust the URLs.
    const folder = { name: folderRow.name, mediaLocation: folderRow.media_location };
    const seasons = catalog.getChildren(
      folderRow, `seasons:${itemTitle}`,
      () => scanner.scanShowSeasons(folder, itemTitle),
      { refresh: true },
    ).map(s => (s.imageUrl ? { ...s, imageUrl: `${s.imageUrl}?v=${Date.now()}` } : s));

    res.json({ success: true, saved, missing, seasons });
  } catch (e) {
    res.status(502).json({ error: 'Season poster fetch failed: ' + e.message });
  }
};

// POST /api/media/:serverId/:folderName/:itemTitle/:seasonName/cover  { image }
// Save a cropped/replaced cover (base64) as poster.jpg inside the season folder.
exports.uploadSeasonCover = (req, res) => {
  const { serverId, folderName, itemTitle, seasonName } = req.params;
  const { image } = req.body || {};
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Missing image data' });

  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });
  const seasonDir = resolveSeasonDir(res, folderRow, itemTitle, seasonName);
  if (!seasonDir) return;

  const match = image.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Unsupported image format' });
  const buffer = Buffer.from(match[2], 'base64');

  try {
    fs.writeFileSync(path.join(seasonDir, 'poster.jpg'), buffer);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to write cover: ' + e.message });
  }

  // Rebuild the seasons cache so the new cover shows up; cache-bust the URL.
  const folder = { name: folderRow.name, mediaLocation: folderRow.media_location };
  const seasons = catalog.getChildren(
    folderRow, `seasons:${itemTitle}`,
    () => scanner.scanShowSeasons(folder, itemTitle),
    { refresh: true },
  );
  const season = seasons.find(s => s.title === seasonName);
  const imageUrl = season && season.imageUrl ? `${season.imageUrl}?v=${Date.now()}` : null;
  res.json({ success: true, imageUrl, seasonName });
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

// POST /api/media/:serverId/:folderName/:itemTitle/watch
//   { watched?: bool, progressSeconds?, durationSeconds? }
exports.setWatchState = (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const { watched, progressSeconds, durationSeconds } = req.body || {};
  const result = catalog.setWatchState(serverId, folderName, itemTitle, { watched, progressSeconds, durationSeconds });
  if (result.error) return res.status(404).json(result);
  res.json({ success: true, item: result.item });
};

// GET /api/media/:serverId/:folderName/:itemTitle/files
// All playable files in a movie's folder (Extended/Original/… cuts) for a picker.
exports.getItemFiles = (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });
  const row = getDb().prepare('SELECT rel_path FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  const relPath = row ? row.rel_path : itemTitle;
  const folder = { name: folderRow.name, mediaLocation: folderRow.media_location };
  res.json({ files: scanner.listPlayableVersions(serverId, folder, relPath) });
};

// POST /api/media/:serverId/:folderName/fetch-all-metadata
// Fetch metadata for every item in the folder that has none yet. Exact matches are
// applied + poster saved; fuzzy ones have their suggestions stored for later
// approve/deny on the item page. Movies/TV folders only.
exports.batchFetchMetadata = async (req, res) => {
  const { serverId, folderName } = req.params;
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });
  if (!metadata.hasAnyKey()) {
    return res.json({ stub: true, message: 'No metadata provider configured. Add TMDB_API_KEY (or OMDB_API_KEY) to server/.env.' });
  }
  const kind = folderKind(folderName);
  if (kind !== 'movies' && kind !== 'tv') return res.json({ done: true, total: 0, applied: 0, review: 0 });

  const rows = getDb().prepare('SELECT * FROM media_items WHERE folder_id = ?').all(folderRow.id);
  const missing = rows.filter(r => !(r.tmdb_id || r.imdb_id || r.overview || r.year));

  let applied = 0, review = 0, none = 0, failed = 0;
  for (const r of missing) {
    const isShow = r.type === 'show' || (r.type !== 'movie' && kind === 'tv');
    try {
      const meta = await metadata.lookup(r.title, { isShow });
      if (!meta || meta.stub) { none++; continue; }
      if (meta.suggestions) {
        catalog.setItemSuggestions(serverId, folderName, r.title, meta.suggestions);
        review++;
        continue;
      }
      meta.posterUrl = await persistPoster(folderRow, folderName, r.title, meta.posterUrl);
      catalog.setItemMetadata(serverId, folderName, r.title, meta);
      applied++;
    } catch {
      failed++;
    }
  }
  const media = catalog.getFolderMedia(serverId, folderName).media;
  res.json({ done: true, total: missing.length, applied, review, none, failed, media });
};

// POST /api/media/:serverId/:folderName/:itemTitle/rename  { newTitle }
// Rename an item's folder on disk (movie, show, or collection-nested movie), then
// rescan. Fetched metadata is carried over to the renamed item.
exports.renameItem = (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const raw = req.body && req.body.newTitle;
  if (!raw || !String(raw).trim()) return res.status(400).json({ error: 'Missing newTitle' });

  // Sanitize into a safe folder name (strip path/reserved chars + trailing dots/spaces).
  const clean = String(raw).trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').trim();
  if (!clean) return res.status(400).json({ error: 'Invalid title' });
  if (clean === itemTitle) return res.json({ success: true, newTitle: clean });

  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const oldDir = itemDirFromTitle(folderRow, itemTitle);
  if (!oldDir || !fs.existsSync(oldDir) || !fs.statSync(oldDir).isDirectory()) {
    return res.status(404).json({ error: 'Item folder not found' });
  }
  const rootPath = path.resolve(folderRow.media_location);
  const newDir = path.join(path.dirname(oldDir), clean);
  if (!newDir.startsWith(rootPath + path.sep)) return res.status(403).json({ error: 'Invalid target path' });
  if (fs.existsSync(newDir)) return res.status(409).json({ error: 'A folder with that name already exists' });

  // Grab existing metadata before the rescan (rename creates a new rel_path row).
  const oldRow = getDb().prepare('SELECT * FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);

  try {
    fs.renameSync(oldDir, newDir);
  } catch (e) {
    return res.status(500).json({ error: 'Rename failed: ' + e.message });
  }

  const media = catalog.getFolderMedia(serverId, folderName, { refresh: true }).media;
  let item = media.find(m => m.title === clean) || null;

  if (oldRow && (oldRow.tmdb_id || oldRow.imdb_id || oldRow.overview || oldRow.year)) {
    const r = catalog.setItemMetadata(serverId, folderName, clean, {
      tmdbId: oldRow.tmdb_id, imdbId: oldRow.imdb_id, overview: oldRow.overview,
      year: oldRow.year, rating: oldRow.rating,
      extra: oldRow.metadata_json ? JSON.parse(oldRow.metadata_json) : null,
    });
    if (r.item) item = r.item;
  }
  res.json({ success: true, newTitle: clean, item });
};

// POST /api/media/:serverId/:folderName/:itemTitle/sort-title  { sortTitle }
// Set/clear the per-item sort-name override (empty string resets to default).
exports.setSortTitle = (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const sortTitle = req.body ? req.body.sortTitle : '';
  const result = catalog.setItemSortTitle(serverId, folderName, itemTitle, sortTitle);
  if (result.error) return res.status(404).json(result);
  res.json({ success: true, item: result.item });
};

exports.uploadCover = (req, res) => {
  const { serverId, folderName, itemTitle } = req.params;
  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) return res.status(404).json({ error: 'Folder not found' });

  const itemDir = itemDirFromTitle(folderRow, itemTitle);
  if (!itemDir) return res.status(403).json({ error: 'Invalid item path' });
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

  // Cache-bust so the browser reloads the new image immediately. Build the URL from
  // the item's real location (handles collection-nested movies), not just its title.
  const rootPath = path.resolve(folderRow.media_location);
  const relSegs = path.relative(rootPath, itemDir).split(path.sep);
  const url = `/media/${[folderName, ...relSegs, 'poster.jpg'].map(encodeURIComponent).join('/')}?v=${Date.now()}`;
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

// Resolve + validate the stream target file from query params. On any problem it
// sends the response and returns null; otherwise returns { targetPath, relativePath }.
function resolveStreamTarget(req, res) {
  const { serverId, folderName, path: relativePath } = req.query;
  if (!serverId || !folderName || !relativePath) {
    res.status(400).json({ error: 'Missing stream path parameters' });
    return null;
  }
  const folderRow = catalog.getFolderRow(serverId, folderName);
  if (!folderRow) { res.status(404).json({ error: 'Folder not found' }); return null; }

  const rootPath = path.resolve(folderRow.media_location);
  const targetPath = path.resolve(rootPath, ...String(relativePath).split('/'));
  if (!targetPath.startsWith(rootPath + path.sep) && targetPath !== rootPath) {
    res.status(403).json({ error: 'Invalid media path' });
    return null;
  }
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    res.status(404).json({ error: 'Media file not found' });
    return null;
  }
  return { targetPath, relativePath: String(relativePath) };
}

function rawMediaUrl(relativePath) {
  return `/media/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

// Build the HLS playlist/segment URL for a target, carrying the same path params.
function hlsUrl(kind, req, extra = {}) {
  const params = new URLSearchParams({
    serverId: req.query.serverId,
    folderName: req.query.folderName,
    path: req.query.path,
    ...extra,
  });
  return `/api/media/${kind}?${params.toString()}`;
}

// GET /api/media/streaminfo?serverId=&folderName=&path=
// Tells the client how to play a non-directplay file without starting any work:
//   { mode: 'directplay', url }  → play the raw file (full seek)
//   { mode: 'remux', url }       → play the stream-copy mp4 pipe (start-only seek)
//   { mode: 'hls', url }         → load the HLS playlist via hls.js (true seek)
exports.streamInfo = (req, res) => {
  const target = resolveStreamTarget(req, res);
  if (!target) return;

  if (!streaming.ffmpegAvailable()) {
    return res.json({ mode: 'directplay', url: rawMediaUrl(target.relativePath) });
  }
  const codecs = streaming.probe(target.targetPath);
  if (!codecs) return res.status(500).json({ error: 'Could not probe media file' });

  const plan = streaming.playPlan(codecs);
  if (plan.mode === 'transcode') {
    return res.json({ mode: 'hls', url: hlsUrl('hls.m3u8', req), vcodec: plan.vcodec });
  }
  return res.json({ mode: 'remux', url: hlsUrl('stream', req) });
};

// GET /api/media/hls.m3u8?serverId=&folderName=&path=
// VOD playlist for an on-the-fly transcode. Segments are transcoded on demand.
exports.hlsPlaylist = (req, res) => {
  const target = resolveStreamTarget(req, res);
  if (!target) return;
  if (!streaming.ffmpegAvailable()) return res.status(415).json({ error: 'ffmpeg not available' });

  const codecs = streaming.probe(target.targetPath);
  if (!codecs || !codecs.duration) {
    return res.status(500).json({ error: 'Could not probe media duration' });
  }
  const playlist = streaming.buildHlsPlaylist(
    codecs.duration,
    i => hlsUrl('hls-segment.ts', req, { i }),
  );
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store');
  res.send(playlist);
};

// GET /api/media/hls-segment.ts?serverId=&folderName=&path=&i=
// Transcodes and streams one HLS segment (mpegts).
exports.hlsSegment = (req, res) => {
  const target = resolveStreamTarget(req, res);
  if (!target) return;
  if (!streaming.ffmpegAvailable()) return res.status(415).end();

  const i = Math.max(0, parseInt(req.query.i, 10) || 0);
  const ff = streaming.transcodeSegment(target.targetPath, i);

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'no-store');
  pipeFfmpeg(ff, res, `hls-segment ${i}`);
};

// GET /api/media/stream?serverId=&folderName=&path=[&t=seconds]
// Serves non-directplay video: redirects to the raw file when the browser can
// play it, otherwise remuxes (stream-copy) into a browser-friendly mp4 on the fly.
// Transcode-needed files (HEVC/AV1/…) are served via the HLS endpoints instead —
// clients should call /streaminfo first to learn which mode to use.
exports.streamMedia = (req, res) => {
  const target = resolveStreamTarget(req, res);
  if (!target) return;

  // No ffmpeg on the host → hand back the raw file and let the browser try.
  if (!streaming.ffmpegAvailable()) {
    return res.redirect(302, rawMediaUrl(target.relativePath));
  }

  const codecs = streaming.probe(target.targetPath);
  if (!codecs) return res.status(500).json({ error: 'Could not probe media file' });

  const plan = streaming.playPlan(codecs);
  if (plan.mode === 'transcode') {
    // Direct <video src> can't play HLS — redirect to the playlist for clients
    // that followed the old URL. hls.js-aware clients use /streaminfo up front.
    return res.redirect(302, hlsUrl('hls.m3u8', req));
  }

  const seek = Math.max(0, Number(req.query.t) || 0);
  const ff = streaming.remux(target.targetPath, { seek, audioCopy: plan.audioCopy });

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store'); // live-generated, not a cacheable file
  pipeFfmpeg(ff, res, 'stream');
};

// Pipe an ffmpeg child's stdout to the response, log failures, and kill the child
// if the client disconnects (tab closed / seeked away) so it doesn't run orphaned.
function pipeFfmpeg(ff, res, label) {
  ff.stdout.pipe(res);
  let stderr = '';
  ff.stderr.on('data', chunk => { stderr += chunk.toString(); });
  ff.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  ff.on('close', code => {
    if (code && code !== 0 && !res.writableEnded) {
      console.error(`[${label}] ffmpeg exited ${code}: ${stderr.slice(-500)}`);
      res.end();
    }
  });
  res.on('close', () => { if (!ff.killed) ff.kill('SIGKILL'); });
}

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
