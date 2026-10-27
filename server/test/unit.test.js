const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { isolatedEnv } = require('./helpers');

const env = isolatedEnv({ AUTH_PASSWORD: 'correct horse', SESSION_SECRET: 'test-secret' });
process.on('exit', env.cleanup);

const auth = require('../auth');
const { folderKind } = require('../constants');
const { stripArticle } = require('../services/catalog');

describe('folderKind', () => {
  test('categorises folders by name, case-insensitively', () => {
    assert.equal(folderKind('TV Shows'), 'tv');
    assert.equal(folderKind('Movies'), 'movies');
    assert.equal(folderKind('my MUSIC'), 'music');
    assert.equal(folderKind('Audiobooks'), 'audiobooks');
  });

  test('returns null for unknown folders', () => {
    assert.equal(folderKind('Photos'), null);
  });
});

describe('stripArticle', () => {
  test('drops a leading article so "The Matrix" sorts under M', () => {
    assert.equal(stripArticle('The Matrix'), 'Matrix');
    assert.equal(stripArticle('A Quiet Place'), 'Quiet Place');
    assert.equal(stripArticle('An Education'), 'Education');
  });

  test('leaves titles that merely start with the letters alone', () => {
    assert.equal(stripArticle('Theory of Everything'), 'Theory of Everything');
    assert.equal(stripArticle('Anaconda'), 'Anaconda');
  });
});

describe('auth', () => {
  const reqWith = headers => ({ headers, secure: false });

  test('is enabled when a password is configured', () => {
    assert.equal(auth.authEnabled(), true);
  });

  test('checkPassword accepts only the exact password', () => {
    assert.equal(auth.checkPassword('correct horse'), true);
    assert.equal(auth.checkPassword('correct horsf'), false);
    assert.equal(auth.checkPassword('short'), false);
    assert.equal(auth.checkPassword(''), false);
    assert.equal(auth.checkPassword(undefined), false);
  });

  test('a session cookie issued at login authenticates later requests', () => {
    const cookie = auth.sessionCookie(reqWith({}));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const pair = cookie.split(';')[0];
    assert.equal(auth.isAuthed(reqWith({ cookie: pair })), true);
  });

  test('rejects missing, garbage and tampered tokens', () => {
    assert.equal(auth.isAuthed(reqWith({})), false);
    assert.equal(auth.isAuthed(reqWith({ cookie: 'mm_session=nope' })), false);
    const pair = auth.sessionCookie(reqWith({})).split(';')[0];
    const tampered = pair.slice(0, -2) + (pair.endsWith('aa') ? 'bb' : 'aa');
    assert.equal(auth.isAuthed(reqWith({ cookie: tampered })), false);
  });

  test('marks the cookie Secure behind an HTTPS proxy', () => {
    const cookie = auth.sessionCookie(reqWith({ 'x-forwarded-proto': 'https' }));
    assert.match(cookie, /; Secure/);
  });

  test('requireAuth blocks unauthenticated requests with 401', () => {
    let status = null;
    let nextCalled = false;
    const res = { status(code) { status = code; return this; }, json() { return this; } };
    auth.requireAuth(reqWith({}), res, () => { nextCalled = true; });
    assert.equal(status, 401);
    assert.equal(nextCalled, false);
  });

  test('loginLimiter returns 429 after too many attempts from one IP', () => {
    const req = { ip: '203.0.113.9' };
    const headers = {};
    let blocked = 0;
    const res = {
      setHeader(k, v) { headers[k] = v; },
      status(code) { if (code === 429) blocked++; return this; },
      json() { return this; },
    };
    let passed = 0;
    for (let i = 0; i < 15; i++) auth.loginLimiter(req, res, () => { passed++; });
    assert.equal(passed, 10);
    assert.equal(blocked, 5);
    assert.ok(headers['Retry-After'] > 0);
  });

  test('loginLimiter tracks IPs independently', () => {
    let passed = 0;
    const res = { setHeader() {}, status() { return this; }, json() { return this; } };
    for (let i = 0; i < 3; i++) auth.loginLimiter({ ip: `198.51.100.${i}` }, res, () => { passed++; });
    assert.equal(passed, 3);
  });
});
