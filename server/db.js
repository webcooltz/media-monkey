const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS servers (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS folders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id      TEXT NOT NULL,
  name           TEXT NOT NULL,
  media_location TEXT NOT NULL DEFAULT '',
  position       INTEGER DEFAULT 0,
  UNIQUE(server_id, name)
);

CREATE TABLE IF NOT EXISTS media_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id           INTEGER NOT NULL,
  rel_path            TEXT NOT NULL,
  title               TEXT NOT NULL,
  type                TEXT NOT NULL,
  image_url           TEXT,
  media_url           TEXT,
  subtitles           TEXT,
  tmdb_id             TEXT,
  imdb_id             TEXT,
  overview            TEXT,
  year                TEXT,
  rating              REAL,
  metadata_json       TEXT,
  metadata_updated_at TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  UNIQUE(folder_id, rel_path)
);

-- Cache for per-request disk scans (seasons, episodes, collection children).
-- Scanning these off slow storage (e.g. a Pi's USB drive) is the bottleneck;
-- cache keeps the walk out of the hot path until an explicit refresh.
CREATE TABLE IF NOT EXISTS child_cache (
  folder_id  INTEGER NOT NULL,
  cache_key  TEXT NOT NULL,
  payload    TEXT NOT NULL,
  scanned_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (folder_id, cache_key)
);

-- User-defined collections that group existing movies + TV shows across folders.
-- Purely logical: members reference items by (server, folder, title); nothing on
-- disk moves. A collection may share a name with a disk movie-collection folder,
-- in which case that folder's movies are merged in with the attached members.
CREATE TABLE IF NOT EXISTS collections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  cover_url  TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_members (
  collection_id INTEGER NOT NULL,
  server_id     TEXT NOT NULL,
  folder_name   TEXT NOT NULL,
  item_title    TEXT NOT NULL,
  position      INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, server_id, folder_name, item_title)
);

CREATE INDEX IF NOT EXISTS idx_folders_server ON folders(server_id);
CREATE INDEX IF NOT EXISTS idx_items_folder ON media_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_collmembers_coll ON collection_members(collection_id);
`;

// One-time seed from the legacy settings.json so existing setups keep their folders.
function migrateFromSettingsJson() {
  const serverCount = db.prepare('SELECT COUNT(*) AS n FROM servers').get().n;
  if (serverCount > 0) return;

  const settingsPath = path.join(__dirname, 'data', 'settings.json');
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    // No legacy file — create a default server/folders.
    settings = {
      servers: [{
        id: 'server1',
        name: 'Home Server',
        folders: [
          { name: 'Movies', mediaLocation: '' },
          { name: 'TV Shows', mediaLocation: '' },
          { name: 'Music', mediaLocation: '' },
          { name: 'Audiobooks', mediaLocation: '' },
        ],
      }],
    };
  }

  const insertServer = db.prepare('INSERT OR IGNORE INTO servers (id, name, position) VALUES (?, ?, ?)');
  const insertFolder = db.prepare('INSERT OR IGNORE INTO folders (server_id, name, media_location, position) VALUES (?, ?, ?, ?)');
  (settings.servers || []).forEach((server, si) => {
    insertServer.run(server.id, server.name, si);
    (server.folders || []).forEach((folder, fi) => {
      insertFolder.run(server.id, folder.name, folder.mediaLocation || '', fi);
    });
  });
  console.log('[DB] Seeded catalog from settings.json');
}

function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });
  db = new DatabaseSync(config.DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Add columns introduced after a table first shipped (no-op if already present).
  try { db.exec('ALTER TABLE collections ADD COLUMN cover_url TEXT'); } catch {}
  migrateFromSettingsJson();
  return db;
}

module.exports = { getDb };
