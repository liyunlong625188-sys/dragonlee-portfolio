import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorker } from '../worker/index.js';

const original = '/assets/a%20design.png';
const optimized = '/.optimized-images/assets/a%20design.webp';

test('original PNG URL serves mapped WebP with asset headers, query and no redirect', async () => {
  const asset = new Response(new Uint8Array([82, 73, 70, 70]), { headers: {
    'content-type': 'image/webp', 'content-length': '4', etag: '"pixel-identical"', 'cache-control': 'public, max-age=3600',
  } });
  const calls = [];
  const response = await createWorker({}, { [original]: optimized }).fetch(new Request('https://example.test' + original + '?revision=2', {
    headers: { accept: 'image/webp,image/*' },
  }), { ASSETS: { fetch(request) { calls.push(request); return asset; } } });
  assert.equal(response, asset);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test' + optimized + '?revision=2');
  assert.equal(calls[0].headers.get('accept'), 'image/webp,image/*');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('etag'), '"pixel-identical"');
  assert.equal(response.headers.get('location'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([82, 73, 70, 70]));
});

test('mapped PNG HEAD keeps asset length and cache validation without a body', async () => {
  const calls = [];
  const response = await createWorker({}, { [original]: optimized }).fetch(new Request('https://example.test' + original, {
    method: 'HEAD', headers: { 'if-modified-since': 'Wed, 14 Oct 2026 00:00:00 GMT' },
  }), { ASSETS: { fetch(request) {
    calls.push(request);
    return new Response(null, { headers: { 'content-type': 'image/webp', 'content-length': '1234', etag: '"asset-etag"' } });
  } } });
  assert.equal(calls[0].method, 'HEAD');
  assert.equal(calls[0].headers.get('if-modified-since'), 'Wed, 14 Oct 2026 00:00:00 GMT');
  assert.equal(response.headers.get('content-length'), '1234');
  assert.equal(response.headers.get('etag'), '"asset-etag"');
  assert.equal(await response.text(), '');
});

test('mapped PNG conditional GET preserves the asset 304 response', async () => {
  const response = await createWorker({}, { [original]: optimized }).fetch(new Request('https://example.test' + original, {
    headers: { 'if-none-match': '"asset-etag"' },
  }), { ASSETS: { fetch(request) {
    assert.equal(request.headers.get('if-none-match'), '"asset-etag"');
    return new Response(null, { status: 304, headers: { etag: '"asset-etag"', 'cache-control': 'public, max-age=3600' } });
  } } });
  assert.equal(response.status, 304);
  assert.equal(response.headers.get('etag'), '"asset-etag"');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(await response.text(), '');
});

test('missing mapped image returns asset 404 and write requests keep original path', async () => {
  const requests = [];
  const worker = createWorker({}, { [original]: optimized });
  const env = { ASSETS: { fetch(request) { requests.push(new URL(request.url).pathname); return new Response('missing', { status: 404 }); } } };
  const missing = await worker.fetch(new Request('https://example.test' + original, { headers: { accept: 'text/html' } }), env);
  assert.equal(missing.status, 404);
  assert.deepEqual(requests, [optimized]);
  const post = await worker.fetch(new Request('https://example.test' + original, { method: 'POST' }), env);
  assert.equal(post.status, 404);
  assert.deepEqual(requests, [optimized, original]);
});
