const { getDb } = require('../db');
const scanner = require('./scanner');

// Sort key for a media item: the per-item override if set, else the title with a
// leading article ("The"/"A"/"An") dropped so "The Matrix" files under M.
function stripArticle(title) {
  return String(title || '').replace(/^\s*(the|a|an)\s+/i, '');
}
function sortNameOf(item) {
  return (item.sortTitle || stripArticle(item.title)).trim().toLowerCase();
}
function bySortName(a, b) {
  return sortNameOf(a).localeCompare(sortNameOf(b));
}

function rowToItem(row) {
  const hasMeta = row.tmdb_id || row.imdb_id || row.overview || row.rating != null || row.year;
  return {
    title: row.title,
    type: row.type,
    imageUrl: row.image_url || undefined,
    mediaUrl: row.media_url || null,
    quality: scanner.qualityFromMediaUrl(row.media_url),
    sortTitle: row.sort_title || undefined,
    suggestions: row.suggestions_json ? JSON.parse(row.suggestions_json) : undefined,
    subtitles: row.subtitles ? JSON.parse(row.subtitles) : [],
    metadata: hasMeta ? {
      tmdbId: row.tmdb_id || null,
      imdbId: row.imdb_id || null,
      overview: row.overview || null,
      year: row.year || null,
      rating: row.rating != null ? row.rating : null,
      updatedAt: row.metadata_updated_at || null,
      extra: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    } : null,
  };
}

function getFolderRow(serverId, folderName) {
  return getDb()
    .prepare('SELECT * FROM folders WHERE server_id = ? AND name = ?')
    .get(serverId, folderName);
}

function itemsForFolder(folderId) {
  return getDb()
    .prepare('SELECT * FROM media_items WHERE folder_id = ? ORDER BY title COLLATE NOCASE')
    .all(folderId);
}

// Additive: insert newly-discovered items, leave existing rows (and their metadata) untouched.
function syncFolderAdditive(serverId, folderRow) {
  const db = getDb();
  const scanned = scanner.scanFolder(serverId, { name: folderRow.name, mediaLocation: folderRow.media_location });
  const existing = new Set(db.prepare('SELECT rel_path FROM media_items WHERE folder_id = ?').all(folderRow.id).map(r => r.rel_path));
  const insert = db.prepare(
    `INSERT OR IGNORE INTO media_items (folder_id, rel_path, title, type, image_url, media_url, subtitles)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  db.exec('BEGIN');
  try {
    for (const it of scanned) {
      if (!existing.has(it.relPath)) {
        insert.run(folderRow.id, it.relPath, it.title, it.type, it.imageUrl || null, it.mediaUrl || null, JSON.stringify(it.subtitles || []));
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return itemsForFolder(folderRow.id).map(rowToItem).sort(bySortName);
}

// Refresh: full rescan — update existing rows (preserving metadata cols) and prune items gone from disk.
function refreshFolder(serverId, folderRow) {
  const db = getDb();
  const scanned = scanner.scanFolder(serverId, { name: folderRow.name, mediaLocation: folderRow.media_location });
  const scannedRel = new Set(scanned.map(s => s.relPath));
  const upsert = db.prepare(
    `INSERT INTO media_items (folder_id, rel_path, title, type, image_url, media_url, subtitles)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(folder_id, rel_path) DO UPDATE SET
       title = excluded.title,
       type = excluded.type,
       image_url = excluded.image_url,
       media_url = excluded.media_url,
       subtitles = excluded.subtitles`
  );
  const del = db.prepare('DELETE FROM media_items WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const it of scanned) {
      upsert.run(folderRow.id, it.relPath, it.title, it.type, it.imageUrl || null, it.mediaUrl || null, JSON.stringify(it.subtitles || []));
    }
    for (const r of db.prepare('SELECT id, rel_path FROM media_items WHERE folder_id = ?').all(folderRow.id)) {
      if (!scannedRel.has(r.rel_path)) del.run(r.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  clearChildCache(folderRow.id); // disk changed — drop stale season/episode caches
  return itemsForFolder(folderRow.id).map(rowToItem).sort(bySortName);
}

// Return cached child scan (seasons/episodes/collection movies) or scan on miss.
// `scanFn` walks disk; its result is JSON-cached under (folder_id, cacheKey).
function getChildren(folderRow, cacheKey, scanFn, { refresh = false } = {}) {
  const db = getDb();
  if (!refresh) {
    const row = db.prepare('SELECT payload FROM child_cache WHERE folder_id = ? AND cache_key = ?')
      .get(folderRow.id, cacheKey);
    if (row) return JSON.parse(row.payload);
  }
  const media = scanFn();
  db.prepare(
    `INSERT INTO child_cache (folder_id, cache_key, payload, scanned_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(folder_id, cache_key) DO UPDATE SET
       payload = excluded.payload, scanned_at = excluded.scanned_at`
  ).run(folderRow.id, cacheKey, JSON.stringify(media));
  return media;
}

function clearChildCache(folderId) {
  getDb().prepare('DELETE FROM child_cache WHERE folder_id = ?').run(folderId);
}

// GET /api/media — all servers with folders + (additively synced) media.
function getServersWithMedia() {
  const db = getDb();
  const servers = db.prepare('SELECT * FROM servers ORDER BY position, name').all();
  return servers.map(server => {
    const folders = db.prepare('SELECT * FROM folders WHERE server_id = ? ORDER BY position, name').all(server.id);
    return {
      id: server.id,
      name: server.name,
      folders: folders.map(folder => {
        const media = syncFolderAdditive(server.id, folder);
        return {
          name: folder.name,
          mediaLocation: folder.media_location,
          media,
          children: media.map(m => m.title),
        };
      }),
    };
  });
}

function getFolderMedia(serverId, folderName, { refresh = false } = {}) {
  const folderRow = getFolderRow(serverId, folderName);
  if (!folderRow) return { error: 'Folder not found' };
  const media = refresh ? refreshFolder(serverId, folderRow) : syncFolderAdditive(serverId, folderRow);
  return { media };
}

// Persist Settings-page edits: upsert servers/folders, delete removed (cascading their items).
function saveSettings(servers) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const keepServers = new Set(servers.map(s => s.id));
    for (const s of db.prepare('SELECT id FROM servers').all()) {
      if (!keepServers.has(s.id)) {
        const fids = db.prepare('SELECT id FROM folders WHERE server_id = ?').all(s.id).map(f => f.id);
        for (const fid of fids) db.prepare('DELETE FROM media_items WHERE folder_id = ?').run(fid);
        db.prepare('DELETE FROM folders WHERE server_id = ?').run(s.id);
        db.prepare('DELETE FROM servers WHERE id = ?').run(s.id);
      }
    }

    const upsertServer = db.prepare(
      `INSERT INTO servers (id, name, position) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position`
    );
    const upsertFolder = db.prepare(
      `INSERT INTO folders (server_id, name, media_location, position) VALUES (?, ?, ?, ?)
       ON CONFLICT(server_id, name) DO UPDATE SET media_location = excluded.media_location, position = excluded.position`
    );

    servers.forEach((server, si) => {
      upsertServer.run(server.id, server.name, si);
      const keepFolders = new Set((server.folders || []).map(f => f.name));
      for (const f of db.prepare('SELECT id, name FROM folders WHERE server_id = ?').all(server.id)) {
        if (!keepFolders.has(f.name)) {
          db.prepare('DELETE FROM media_items WHERE folder_id = ?').run(f.id);
          db.prepare('DELETE FROM folders WHERE id = ?').run(f.id);
        }
      }
      (server.folders || []).forEach((folder, fi) => {
        upsertFolder.run(server.id, folder.name, folder.mediaLocation || '', fi);
      });
    });
    db.exec('DELETE FROM child_cache'); // folder paths may have changed — rebuild lazily
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Attach provider metadata to a stored item (used by the TMDB service).
function setItemMetadata(serverId, folderName, itemTitle, meta) {
  const db = getDb();
  const folderRow = getFolderRow(serverId, folderName);
  if (!folderRow) return { error: 'Folder not found' };
  const item = db.prepare('SELECT * FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  if (!item) return { error: 'Item not found' };
  db.prepare(
    `UPDATE media_items SET
       tmdb_id = ?, imdb_id = ?, overview = ?, year = ?, rating = ?,
       image_url = COALESCE(?, image_url),
       metadata_json = ?, metadata_updated_at = datetime('now'),
       suggestions_json = NULL
     WHERE id = ?`
  ).run(
    meta.tmdbId || null,
    meta.imdbId || null,
    meta.overview || null,
    meta.year || null,
    meta.rating != null ? meta.rating : null,
    meta.posterUrl || null,
    meta.extra ? JSON.stringify(meta.extra) : null,
    item.id
  );
  return { item: rowToItem(db.prepare('SELECT * FROM media_items WHERE id = ?').get(item.id)) };
}

// Point a stored item at a new cover image (used after a cover upload).
// Set (or clear, with '') the per-item sort-name override.
function setItemSortTitle(serverId, folderName, itemTitle, sortTitle) {
  const db = getDb();
  const folderRow = getFolderRow(serverId, folderName);
  if (!folderRow) return { error: 'Folder not found' };
  const item = db.prepare('SELECT id FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  if (!item) return { error: 'Item not found' };
  const clean = sortTitle && String(sortTitle).trim() ? String(sortTitle).trim() : null;
  db.prepare('UPDATE media_items SET sort_title = ? WHERE id = ?').run(clean, item.id);
  return { item: rowToItem(db.prepare('SELECT * FROM media_items WHERE id = ?').get(item.id)) };
}

// Store fuzzy-match suggestions for later approve/deny (null clears them).
function setItemSuggestions(serverId, folderName, itemTitle, suggestions) {
  const db = getDb();
  const folderRow = getFolderRow(serverId, folderName);
  if (!folderRow) return { error: 'Folder not found' };
  const item = db.prepare('SELECT id FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  if (!item) return { error: 'Item not found' };
  db.prepare('UPDATE media_items SET suggestions_json = ? WHERE id = ?')
    .run(suggestions && suggestions.length ? JSON.stringify(suggestions) : null, item.id);
  return { ok: true };
}

function setItemImage(serverId, folderName, itemTitle, imageUrl) {
  const db = getDb();
  const folderRow = getFolderRow(serverId, folderName);
  if (!folderRow) return { error: 'Folder not found' };
  const item = db.prepare('SELECT * FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, itemTitle);
  if (!item) return { error: 'Item not found' };
  db.prepare('UPDATE media_items SET image_url = ? WHERE id = ?').run(imageUrl, item.id);
  return { item: rowToItem(db.prepare('SELECT * FROM media_items WHERE id = ?').get(item.id)) };
}

module.exports = {
  getServersWithMedia,
  getFolderMedia,
  getChildren,
  getFolderRow,
  saveSettings,
  setItemMetadata,
  setItemSuggestions,
  setItemSortTitle,
  setItemImage,
  rowToItem,
  stripArticle,
};
