const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isolatedEnv, makeLibrary, settingsFor, startServer } = require('./helpers');

const env = isolatedEnv();
const lib = makeLibrary(path.join(env.dir, 'media'), {
  movies: ['Neon Harbor (2019)', 'Orbit Zero (2021)'],
  shows: ['Cosmic Diner (2018)'],
});
fs.writeFileSync(path.join(env.dir, 'secret.txt'), 'top secret');

const app = require('../app');
const { closeDb } = require('../db');

let srv;
before(async () => {
  srv = await startServer(app);
  const res = await fetch(`${srv.base}/api/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ servers: settingsFor(lib) }),
  });
  assert.equal(res.status, 200);
});

after(async () => {
  await srv.close();
  closeDb();
  env.cleanup();
});

const get = (p, headers) => fetch(`${srv.base}${p}`, { headers });
const send = (method, p, body, headers = {}) => fetch(`${srv.base}${p}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

describe('basics', () => {
  test('GET /healthz', async () => {
    const res = await get('/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test('sets security headers and hides x-powered-by', async () => {
    const res = await get('/healthz');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('unknown API routes return JSON 404', async () => {
    const res = await get('/api/definitely-not-a-route');
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  });

  test('malformed JSON body returns 400, not a stack trace', async () => {
    const res = await fetch(`${srv.base}/api/profiles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Invalid JSON body' });
  });

  test('auth is off by default', async () => {
    assert.deepEqual(await (await get('/api/auth/status')).json(), { authRequired: false, authenticated: true });
  });
});

describe('library API', () => {
  test('lists folder media', async () => {
    const body = await (await get('/api/media/Movies'.replace('/Movies', '/server1/Movies'))).json();
    assert.deepEqual(body.media.map(m => m.title), ['Neon Harbor (2019)', 'Orbit Zero (2021)']);
  });

  test('unknown folder returns 404', async () => {
    assert.equal((await get('/api/media/server1/Nope')).status, 404);
  });

  test('GET /api/search finds items', async () => {
    const body = await (await get('/api/search?q=orbit')).json();
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].title, 'Orbit Zero (2021)');
    assert.equal(body.results[0].folderName, 'Movies');
  });

  test('GET /api/search with no query returns empty results', async () => {
    assert.deepEqual((await (await get('/api/search')).json()).results, []);
  });
});

describe('profiles API', () => {
  test('lists the default profile', async () => {
    const body = await (await get('/api/profiles')).json();
    assert.equal(body.profiles.length, 1);
    assert.equal(body.current, body.profiles[0].id);
  });

  test('create, rename, validate, delete', async () => {
    const created = await send('POST', '/api/profiles', { name: 'Sam' });
    assert.equal(created.status, 201);
    const { profile } = await created.json();

    assert.equal((await send('POST', '/api/profiles', { name: 'sam' })).status, 400);
    assert.equal((await send('POST', '/api/profiles', { name: '' })).status, 400);

    const renamed = await send('PATCH', `/api/profiles/${profile.id}`, { name: 'Samantha' });
    assert.equal((await renamed.json()).profile.name, 'Samantha');
    assert.equal((await send('PATCH', '/api/profiles/9999', { name: 'x' })).status, 404);

    const themed = await send('PATCH', `/api/profiles/${profile.id}`, { primaryColor: '#123456', secondaryColor: '#abcdef' });
    assert.equal((await themed.json()).profile.primaryColor, '#123456');
    assert.equal((await send('PATCH', `/api/profiles/${profile.id}`, { primaryColor: 'blue' })).status, 400);
    const listed = (await (await get('/api/profiles')).json()).profiles.find(p => p.id === profile.id);
    assert.equal(listed.secondaryColor, '#abcdef');

    assert.equal((await send('DELETE', `/api/profiles/${profile.id}`)).status, 200);
    assert.equal((await send('DELETE', `/api/profiles/${profile.id}`)).status, 404);
  });

  test('X-Profile-Id selects whose watch state is read and written', async () => {
    const other = (await (await send('POST', '/api/profiles', { name: 'Kid' })).json()).profile;
    const base = (await (await get('/api/profiles')).json()).profiles[0];
    const item = '/api/media/server1/Movies/Neon%20Harbor%20(2019)/watch';

    const marked = await send('POST', item, { watched: true }, { 'X-Profile-Id': String(other.id) });
    assert.equal(marked.status, 200);

    const watched = async id => (await (await get('/api/media/server1/Movies', { 'X-Profile-Id': String(id) })).json())
      .media.find(m => m.title === 'Neon Harbor (2019)').watched;
    assert.equal(await watched(other.id), true);
    assert.equal(await watched(base.id), false);
    // No header / unknown id falls back to the default profile.
    assert.equal((await (await get('/api/media/server1/Movies')).json()).media[0].watched, false);
    assert.equal(await watched(424242), false);
  });
});

describe('/media file serving', () => {
  test('serves a file inside a library folder', async () => {
    const res = await get('/media/Movies/Neon%20Harbor%20(2019)/Neon%20Harbor%20(2019).1080p.mp4');
    assert.equal(res.status, 200);
  });

  test('blocks path traversal', async () => {
    const res = await get('/media/Movies/..%2F..%2Fsecret.txt');
    assert.equal(res.status, 403);
    assert.doesNotMatch(await res.text(), /top secret/);
  });

  test('unknown folder / missing file return 404', async () => {
    assert.equal((await get('/media/Nope/x.mp4')).status, 404);
    assert.equal((await get('/media/Movies/missing.mp4')).status, 404);
  });

  test('malformed percent-encoding returns 400', async () => {
    assert.equal((await get('/media/Movies/%E0%A4%A')).status, 400);
  });
});

describe('setup + scan API', () => {
  test('GET /api/setup/status reports system + folder health', async () => {
    const body = await (await get('/api/setup/status')).json();
    assert.equal(body.needsSetup, false);
    assert.equal(typeof body.ffmpeg, 'boolean');
    assert.equal(body.authEnabled, false);
    assert.deepEqual(Object.keys(body.keys).sort(), ['omdb', 'opensubtitles', 'tmdb']);
    const movies = body.folders.find(f => f.name === 'Movies');
    assert.equal(movies.exists, true);
    assert.equal(movies.itemCount, 2);
  });

  test('POST /api/scan starts a background scan; GET reports status', async () => {
    const res = await send('POST', '/api/scan');
    assert.ok([202, 409].includes(res.status));
    for (let i = 0; i < 50; i++) {
      const status = await (await get('/api/scan')).json();
      if (!status.running && status.lastFinishedAt) {
        assert.equal(status.lastResult.errors, 0);
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    assert.fail('scan did not finish');
  });

  test('needsSetup is true when no folder has a path', async () => {
    await send('POST', '/api/media', { servers: [{ id: 'server1', name: 'Home', folders: [{ name: 'Movies', mediaLocation: '' }] }] });
    const body = await (await get('/api/setup/status')).json();
    assert.equal(body.needsSetup, true);
  });
});
