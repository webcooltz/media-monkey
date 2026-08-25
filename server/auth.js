const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const COOKIE = 'mm_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Auth is only enforced when a password is configured.
function authEnabled() {
  return Boolean(config.AUTH_PASSWORD);
}

// HMAC secret: from env, else generated once and persisted so sessions survive restarts.
let cachedSecret = null;
function getSecret() {
  if (cachedSecret) return cachedSecret;
  if (config.SESSION_SECRET) { cachedSecret = config.SESSION_SECRET; return cachedSecret; }
  const secretPath = path.join(path.dirname(config.DB_PATH), '.session-secret');
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing) { cachedSecret = existing; return cachedSecret; }
  } catch { /* not created yet */ }
  cachedSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, cachedSecret, { mode: 0o600 });
  } catch { /* ephemeral secret is still fine */ }
  return cachedSecret;
}

function sign(data) {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

function issueToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

function checkPassword(password) {
  if (!password) return false;
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(config.AUTH_PASSWORD));
  // Length check first (timingSafeEqual throws on length mismatch); acceptable leak (length only).
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  if (!authEnabled()) return true;
  return verifyToken(parseCookies(req)[COOKIE]);
}

function isSecure(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https' || config.AUTH_COOKIE_SECURE;
}

function sessionCookie(req) {
  const parts = [`${COOKIE}=${issueToken()}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];
  if (isSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

// Express middleware guarding a route group.
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { authEnabled, isAuthed, checkPassword, sessionCookie, clearCookie, requireAuth };
