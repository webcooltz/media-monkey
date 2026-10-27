const { AsyncLocalStorage } = require('node:async_hooks');
const { getDb } = require('../db');

// Lightweight household profiles (no passwords): each profile has its own
// watch state. The active profile rides on a request header and is exposed to
// the rest of the server through AsyncLocalStorage, so catalog code doesn't
// need a profile argument threaded through every call.

const PROFILE_HEADER = 'x-profile-id';
const MAX_NAME_LENGTH = 40;
const storage = new AsyncLocalStorage();

function defaultProfileId() {
  const row = getDb().prepare('SELECT MIN(id) AS id FROM profiles').get();
  return row && row.id ? row.id : 1;
}

function currentProfileId() {
  const store = storage.getStore();
  return store ? store.profileId : defaultProfileId();
}

function runWithProfile(profileId, fn) {
  return storage.run({ profileId }, fn);
}

function exists(id) {
  return !!getDb().prepare('SELECT 1 FROM profiles WHERE id = ?').get(id);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function toProfile(row) {
  return {
    id: row.id,
    name: row.name,
    primaryColor: row.primary_color || null,
    secondaryColor: row.secondary_color || null,
  };
}

function get(id) {
  const row = getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  return row ? toProfile(row) : null;
}

function list() {
  return getDb().prepare('SELECT * FROM profiles ORDER BY id').all().map(toProfile);
}

// null / '' resets a colour to the app default; otherwise it must be #rrggbb.
function cleanColor(value) {
  if (value === null || value === '') return { color: null };
  if (typeof value === 'string' && HEX_COLOR.test(value.trim())) return { color: value.trim().toLowerCase() };
  return { error: 'Colors must be hex values like #0165f1' };
}

function cleanName(name) {
  const clean = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  if (!clean) return { error: 'Profile name is required' };
  if (clean.length > MAX_NAME_LENGTH) return { error: `Profile name must be ${MAX_NAME_LENGTH} characters or fewer` };
  return { name: clean };
}

function create(name) {
  const c = cleanName(name);
  if (c.error) return c;
  const db = getDb();
  if (db.prepare('SELECT 1 FROM profiles WHERE name = ? COLLATE NOCASE').get(c.name)) {
    return { error: 'A profile with that name already exists' };
  }
  const info = db.prepare('INSERT INTO profiles (name) VALUES (?)').run(c.name);
  return { profile: get(Number(info.lastInsertRowid)) };
}

function rename(id, name) {
  const c = cleanName(name);
  if (c.error) return c;
  const db = getDb();
  if (!exists(id)) return { error: 'Profile not found', status: 404 };
  const clash = db.prepare('SELECT id FROM profiles WHERE name = ? COLLATE NOCASE').get(c.name);
  if (clash && clash.id !== id) return { error: 'A profile with that name already exists' };
  db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(c.name, id);
  return { profile: get(id) };
}

// Partial update of a profile: any of { name, primaryColor, secondaryColor }.
// Omitted fields are left alone; null/'' colours reset to the defaults.
function update(id, fields = {}) {
  const db = getDb();
  if (!exists(id)) return { error: 'Profile not found', status: 404 };
  if (fields.name !== undefined) {
    const r = rename(id, fields.name);
    if (r.error) return r;
  }
  for (const [key, column] of [['primaryColor', 'primary_color'], ['secondaryColor', 'secondary_color']]) {
    if (fields[key] === undefined) continue;
    const c = cleanColor(fields[key]);
    if (c.error) return c;
    db.prepare(`UPDATE profiles SET ${column} = ? WHERE id = ?`).run(c.color, id);
  }
  return { profile: get(id) };
}

function remove(id) {
  const db = getDb();
  if (!exists(id)) return { error: 'Profile not found', status: 404 };
  if (db.prepare('SELECT COUNT(*) AS n FROM profiles').get().n <= 1) {
    return { error: 'Cannot delete the last profile' };
  }
  db.prepare('DELETE FROM watch_state WHERE profile_id = ?').run(id);
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  return { success: true };
}

// Express middleware: resolve the profile from the header (falling back to the
// default profile for missing/unknown ids) and run the request inside it.
function middleware(req, res, next) {
  const raw = Number.parseInt(req.headers[PROFILE_HEADER], 10);
  const profileId = Number.isInteger(raw) && exists(raw) ? raw : defaultProfileId();
  req.profileId = profileId;
  storage.run({ profileId }, next);
}

module.exports = {
  PROFILE_HEADER, MAX_NAME_LENGTH,
  defaultProfileId, currentProfileId, runWithProfile,
  list, get, create, rename, update, remove, exists, middleware,
};
