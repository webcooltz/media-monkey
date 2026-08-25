const { getDb } = require('../db');
const scanner = require('./scanner');
const catalog = require('./catalog');

// A "collection" is a named group that can span folders. Its members come from
// two sources, merged by name:
//   - disk: a year-less folder inside a movies-kind folder (type 'collection' in
//     media_items) contributes the movies scanned from it.
//   - attached: rows in collection_members (user-added movies/shows from any
//     folder), resolved back to their MediaItem for display.
// Attaching to a disk collection lazily creates a `collections` row of the same
// name; nothing on disk ever moves.

// Disk movie-collections = year-less folders inside each movies-kind folder.
// (Their movies are also flattened into the Movies tab; here we surface the group.)
function diskCollections() {
  const folders = getDb().prepare('SELECT * FROM folders').all();
  const out = [];
  for (const f of folders) {
    for (const name of scanner.movieCollectionFolders({ name: f.name, mediaLocation: f.media_location })) {
      out.push({ name, imageUrl: null, folderName: f.name, serverId: f.server_id, mediaLocation: f.media_location });
    }
  }
  return out;
}

// Scan a disk collection's movies (cached like the collection page).
function diskMembers(d) {
  const folderRow = catalog.getFolderRow(d.serverId, d.folderName);
  if (!folderRow) return [];
  const movies = catalog.getChildren(
    folderRow, `collection:${d.name}`,
    () => scanner.scanCollectionMovies(d.serverId, { name: d.folderName, mediaLocation: d.mediaLocation }, d.name),
  );
  return movies.map(mv => ({ ...mv, serverId: d.serverId, folderName: d.folderName, source: 'disk' }));
}

function ensureCollection(name) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO collections (name) VALUES (?)').run(name);
  return db.prepare('SELECT * FROM collections WHERE name = ?').get(name);
}

// Members added by the user (across any folder), resolved to MediaItems.
function attachedMembers(name) {
  const db = getDb();
  const coll = db.prepare('SELECT * FROM collections WHERE name = ?').get(name);
  if (!coll) return [];
  const rows = db.prepare('SELECT * FROM collection_members WHERE collection_id = ? ORDER BY position, item_title').all(coll.id);
  return rows.map(m => {
    const folderRow = catalog.getFolderRow(m.server_id, m.folder_name);
    let item = null;
    if (folderRow) {
      const r = db.prepare('SELECT * FROM media_items WHERE folder_id = ? AND title = ?').get(folderRow.id, m.item_title);
      if (r) item = catalog.rowToItem(r);
    }
    return {
      title: m.item_title,
      type: item ? item.type : 'unknown',
      imageUrl: item ? item.imageUrl : undefined,
      mediaUrl: item ? item.mediaUrl : null,
      quality: item ? item.quality : null,
      subtitles: item ? item.subtitles : [],
      serverId: m.server_id,
      folderName: m.folder_name,
      itemTitle: m.item_title, // present → navigable to its own item page
      source: 'attached',
      missing: !item,
    };
  });
}

function firstCover(...lists) {
  for (const list of lists) {
    const hit = list.find(m => m.imageUrl);
    if (hit) return hit.imageUrl;
  }
  return null;
}

function list() {
  const disk = diskCollections();
  const diskByName = new Map(disk.map(d => [d.name, d]));
  const virtualNames = getDb().prepare('SELECT name FROM collections').all().map(r => r.name);
  const names = [...new Set([...disk.map(d => d.name), ...virtualNames])].sort((a, b) => a.localeCompare(b));

  const covers = new Map(getDb().prepare('SELECT name, cover_url FROM collections').all().map(r => [r.name, r.cover_url]));
  return names.map(name => {
    const d = diskByName.get(name);
    const dm = d ? diskMembers(d) : [];
    const am = attachedMembers(name);
    return {
      name,
      hasDisk: !!d,
      count: dm.length + am.length,
      // User-chosen cover wins; otherwise fall back to the first member's poster.
      imageUrl: covers.get(name) || (d && d.imageUrl) || firstCover(dm, am),
    };
  });
}

function get(name) {
  const d = diskCollections().find(x => x.name === name);
  const members = [...(d ? diskMembers(d) : []), ...attachedMembers(name)];
  const row = getDb().prepare('SELECT cover_url FROM collections WHERE name = ?').get(name);
  const cover = (row && row.cover_url) || (d && d.imageUrl) || firstCover(members);
  return { name, hasDisk: !!d, coverUrl: cover, members };
}

// Pick a member's poster (a /media URL) as the collection's cover.
function setCover(name, coverUrl) {
  const coll = ensureCollection(name);
  getDb().prepare('UPDATE collections SET cover_url = ? WHERE id = ?').run(coverUrl || null, coll.id);
  return get(name);
}

function create(name) {
  ensureCollection(String(name).trim());
  return list().find(c => c.name === String(name).trim()) || { name, hasDisk: false, count: 0, imageUrl: null };
}

function addMember(name, serverId, folderName, itemTitle) {
  const coll = ensureCollection(name);
  getDb().prepare(
    'INSERT OR IGNORE INTO collection_members (collection_id, server_id, folder_name, item_title) VALUES (?, ?, ?, ?)'
  ).run(coll.id, serverId, folderName, itemTitle);
  return get(name);
}

function removeMember(name, serverId, folderName, itemTitle) {
  const coll = getDb().prepare('SELECT * FROM collections WHERE name = ?').get(name);
  if (coll) {
    getDb().prepare(
      'DELETE FROM collection_members WHERE collection_id = ? AND server_id = ? AND folder_name = ? AND item_title = ?'
    ).run(coll.id, serverId, folderName, itemTitle);
  }
  return get(name);
}

// Delete the user-defined collection + its attachments. A same-named disk
// collection folder is untouched and still appears (from the movies scan).
function remove(name) {
  const db = getDb();
  const coll = db.prepare('SELECT * FROM collections WHERE name = ?').get(name);
  if (!coll) return { removed: false };
  db.prepare('DELETE FROM collection_members WHERE collection_id = ?').run(coll.id);
  db.prepare('DELETE FROM collections WHERE id = ?').run(coll.id);
  return { removed: true };
}

module.exports = { list, get, create, addMember, removeMember, remove, setCover };
