const fs = require('fs');
const path = require('path');
const { imageExtensions, playableExtensions, subtitleExtensions, folderKind } = require('../constants');

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

function findImageFile(dir, folderName, pathSegments = [path.basename(dir)]) {
  try {
    const files = fs.readdirSync(dir);
    const imageFile = files.find(file => imageExtensions.includes(path.extname(file).toLowerCase()));
    return imageFile ? buildMediaUrl(folderName, [...pathSegments, imageFile]) : null;
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

  if (kind === 'tv' || kind === 'movies') {
    return getFoldersInDir(folderPath).map(name => {
      const subfolderPath = path.join(folderPath, name);
      const isMovieType = kind === 'movies';
      const isTvType = kind === 'tv';
      const collection = isMovieType && isMovieCollection(name);
      const playableFileName = isMovieType && !collection ? findPlayableFileName(subfolderPath) : null;
      return {
        relPath: name,
        title: name,
        type: isTvType ? 'show' : collection ? 'collection' : 'movie',
        imageUrl: findImageFile(subfolderPath, folder.name, [name]),
        mediaUrl: isMovieType && !collection ? findPlayableFile(subfolderPath, folder.name, [name]) : null,
        subtitles: isMovieType && !collection ? findSubtitleFiles(subfolderPath, serverId, folder.name, [name], playableFileName, name) : [],
      };
    });
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
      mediaUrl: findPlayableFile(moviePath, folder.name, [collectionTitle, name]),
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
      mediaUrl: buildMediaUrl(folder.name, [showTitle, seasonName, name]),
      subtitles: findSubtitleFiles(seasonPath, serverId, folder.name, [showTitle, seasonName], name, name.replace(/\.[^/.]+$/, '')),
    }));
}

module.exports = {
  imageExtensions,
  playableExtensions,
  subtitleExtensions,
  isMovieCollection,
  scanFolder,
  scanShowSeasons,
  scanCollectionMovies,
  scanSeasonEpisodes,
};
