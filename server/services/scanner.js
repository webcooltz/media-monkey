const fs = require('fs');
const path = require('path');
const { imageExtensions, playableExtensions, subtitleExtensions, directPlayContainers, folderKind } = require('../constants');

function toSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildMediaUrl(folderName, pathSegments) {
  return `/media/${[folderName, ...pathSegments].map(segment => encodeURIComponent(segment)).join('/')}`;
}

function buildStreamUrl(serverId, folderName, relSegments) {
  const searchParams = new URLSearchParams({
    serverId,
    folderName,
    path: relSegments.join('/'),
  });
  return `/api/media/stream?${searchParams.toString()}`;
}

// Playback URL for a video file: raw /media for directplay containers (full seek),
// else the remux/transcode stream endpoint. `relSegments` = path within the folder.
function buildPlayUrl(serverId, folderName, relSegments) {
  const ext = path.extname(relSegments[relSegments.length - 1]).toLowerCase();
  return directPlayContainers.includes(ext)
    ? buildMediaUrl(folderName, relSegments)
    : buildStreamUrl(serverId, folderName, relSegments);
}

function buildSubtitleUrl(serverId, folderName, pathSegments) {
  const searchParams = new URLSearchParams({
    serverId,
    folderName,
    path: pathSegments.join('/'),
  });
  return `/api/media/subtitles?${searchParams.toString()}`;
}

function findImageFile(dir, folderName, pathSegments = [path.basename(dir)]) {
  try {
    const files = fs.readdirSync(dir);
    const imageFile = files.find(file => imageExtensions.includes(path.extname(file).toLowerCase()));
    return imageFile ? buildMediaUrl(folderName, [...pathSegments, imageFile]) : null;
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

// Best-effort video quality from a filename (no probing — instant, Pi-friendly).
// Most releases tag resolution in the name (…1080p…, …2160p 4K…). Null if absent.
function qualityFromName(name) {
  const n = String(name).toLowerCase();
  if (/\b(2160p|4k|uhd)\b/.test(n)) return '4K';
  if (/\b1440p\b/.test(n)) return '1440p';
  if (/\b1080p\b/.test(n)) return '1080p';
  if (/\b720p\b/.test(n)) return '720p';
  if (/\b480p\b/.test(n)) return '480p';
  return null;
}

// Pull the filename out of a stored play URL (raw /media or the stream endpoint's
// ?path=) and derive its quality. Lets rowToItem tag quality without a DB column.
function qualityFromMediaUrl(url) {
  if (!url) return null;
  let name = null;
  if (url.startsWith('/api/media/stream')) {
    const p = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('path');
    if (p) name = p.split('/').pop();
  } else {
    const last = url.split('?')[0].split('/').pop();
    if (last) name = decodeURIComponent(last);
  }
  return qualityFromName(name || '');
}

function isMovieCollection(name) {
  // A folder with no year (e.g. "Back to the Future") is a collection;
  // a folder with a year (e.g. "Bullet Train (2022)") is a single movie.
  return !/\b(19|20)\d{2}\b/.test(name);
}

function getFoldersInDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch {
    return [];
  }
}

function getFilesInDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(dirent => dirent.isFile())
      .map(dirent => dirent.name);
  } catch {
    return [];
  }
}

// Scan a folder's top-level media items (the cards shown in the folder/home view).
// `folder` = { name, mediaLocation }
function scanFolder(serverId, folder) {
  const folderPath = folder.mediaLocation;
  const kind = folderKind(folder.name);

  if (kind === 'tv') {
    return getFoldersInDir(folderPath).map(name => ({
      relPath: name,
      title: name,
      type: 'show',
      imageUrl: findImageFile(path.join(folderPath, name), folder.name, [name]),
      mediaUrl: null,
      subtitles: [],
    }));
  }

  if (kind === 'movies') {
    // Movies tab shows every movie flat (ungrouped). Year-less folders are
    // collections — flatten their child movies in here as individual items; the
    // grouping is surfaced separately under the Collections tab.
    const buildMovie = (relSegs) => {
      const dir = path.join(folderPath, ...relSegs);
      const title = relSegs[relSegs.length - 1];
      const playable = findPlayableFileName(dir);
      return {
        relPath: relSegs.join('/'),
        title,
        type: 'movie',
        imageUrl: findImageFile(dir, folder.name, relSegs),
        mediaUrl: playable ? buildPlayUrl(serverId, folder.name, [...relSegs, playable]) : null,
        quality: playable ? qualityFromName(playable) : null,
        subtitles: findSubtitleFiles(dir, serverId, folder.name, relSegs, playable, title),
      };
    };
    const items = [];
    for (const name of getFoldersInDir(folderPath)) {
      if (isMovieCollection(name)) {
        for (const child of getFoldersInDir(path.join(folderPath, name))) items.push(buildMovie([name, child]));
      } else {
        items.push(buildMovie([name]));
      }
    }
    return items;
  }

  if (kind === 'music' || kind === 'audiobooks') {
    return getFilesInDir(folderPath).map(name => {
      const ext = path.extname(name).toLowerCase();
      return {
        relPath: name,
        title: name.replace(/\.[^/.]+$/, ''),
        type: kind === 'music' ? 'music' : 'audiobook',
        imageUrl: imageExtensions.includes(ext) ? buildMediaUrl(folder.name, [name]) : null,
        mediaUrl: playableExtensions.includes(ext) ? buildMediaUrl(folder.name, [name]) : null,
        subtitles: [],
      };
    });
  }

  return [];
}

// Year-less top-level folders in a movies-kind folder = disk movie-collections.
// The Collections tab uses this to enumerate them (their movies are also flattened
// into the Movies tab by scanFolder).
function movieCollectionFolders(folder) {
  if (folderKind(folder.name) !== 'movies') return [];
  return getFoldersInDir(folder.mediaLocation).filter(isMovieCollection);
}

// List every playable file in an item's folder (rel path within the folder), each
// with its own play URL, quality, and matching subtitles — so a movie with
// multiple cuts (Extended, Original, …) can offer a version picker.
function listPlayableVersions(serverId, folder, relPath) {
  const relSegs = String(relPath).split('/').filter(Boolean);
  const dir = path.join(folder.mediaLocation, ...relSegs);
  return getFilesInDir(dir)
    .filter(name => playableExtensions.includes(path.extname(name).toLowerCase()))
    .map(name => ({
      fileName: name,
      title: path.parse(name).name,
      quality: qualityFromName(name),
      mediaUrl: buildPlayUrl(serverId, folder.name, [...relSegs, name]),
      subtitles: findSubtitleFiles(dir, serverId, folder.name, relSegs, name, path.parse(name).name),
    }));
}

function scanShowSeasons(folder, showTitle) {
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

function scanCollectionMovies(serverId, folder, collectionTitle) {
  const collectionPath = path.join(folder.mediaLocation, collectionTitle);
  return getFoldersInDir(collectionPath).map(name => {
    const moviePath = path.join(collectionPath, name);
    const playableFileName = findPlayableFileName(moviePath);
    return {
      title: name,
      type: 'movie',
      imageUrl: findImageFile(moviePath, folder.name, [collectionTitle, name]),
      mediaUrl: playableFileName ? buildPlayUrl(serverId, folder.name, [collectionTitle, name, playableFileName]) : null,
      quality: playableFileName ? qualityFromName(playableFileName) : null,
      subtitles: findSubtitleFiles(moviePath, serverId, folder.name, [collectionTitle, name], playableFileName, name),
    };
  });
}

function scanSeasonEpisodes(serverId, folder, showTitle, seasonName) {
  const seasonPath = path.join(folder.mediaLocation, showTitle, seasonName);
  return getFilesInDir(seasonPath)
    .filter(name => playableExtensions.includes(path.extname(name).toLowerCase()))
    .map(name => ({
      title: name.replace(/\.[^/.]+$/, ''),
      type: 'episode',
      imageUrl: null,
      mediaUrl: buildPlayUrl(serverId, folder.name, [showTitle, seasonName, name]),
      quality: qualityFromName(name),
      subtitles: findSubtitleFiles(seasonPath, serverId, folder.name, [showTitle, seasonName], name, name.replace(/\.[^/.]+$/, '')),
    }));
}

module.exports = {
  imageExtensions,
  playableExtensions,
  subtitleExtensions,
  isMovieCollection,
  qualityFromName,
  qualityFromMediaUrl,
  movieCollectionFolders,
  listPlayableVersions,
  scanFolder,
  scanShowSeasons,
  scanCollectionMovies,
  scanSeasonEpisodes,
};
