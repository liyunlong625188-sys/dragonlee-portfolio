import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { pruneSitesUnusedMedia } from '../scripts/prune-sites-unused-media.mjs';

test('build pruning keeps user, dynamic and nested dependencies and only removes unused captured media', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'dragonlee-prune-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'public');
  const clientDirectory = path.join(root, 'dist/client');
  const captured = ['unused.png', 'user.mp4', 'dynamic.webp', 'space image.jpg', 'nested.gif', 'metadata.png'];
  await mkdir(path.join(root, 'content'), { recursive: true });
  await mkdir(path.join(source, 'assets'), { recursive: true });
  await mkdir(path.join(source, 'projects/example'), { recursive: true });
  for (const name of [...captured, 'new-user.png', 'font.woff2', 'unused.mp4.sb-temp']) await writeFile(path.join(source, 'assets', name), 'bytes:' + name);
  await writeFile(path.join(source, 'assets/app.js'), 'const dynamic = "dynamic.webp"; const encoded = "space%20image.jpg"; import("./lazy.js");');
  await writeFile(path.join(source, 'assets/lazy.js'), 'const media = "/assets/nested.gif";');
  await writeFile(path.join(source, 'projects/example/index.html'), '<img src="/assets/not-captured.png">');
  await writeFile(path.join(source, 'projects/example/unused.png'), 'project-owned');
  await writeFile(path.join(root, 'content/capture-manifest.json'), JSON.stringify({ assets: Object.fromEntries(captured.map(name => [name, { path: 'assets/' + name }])) }));
  await writeFile(path.join(root, 'content/content-data.json'), JSON.stringify({ projects: [{ gallery: { src: '/assets/user.mp4' } }] }));
  await writeFile(path.join(root, 'content/user-media.json'), JSON.stringify({ outputs: [{ path: 'assets/metadata.png' }] }));
  await cp(source, clientDirectory, { recursive: true });
  const result = pruneSitesUnusedMedia({ root, clientDirectory });
  assert.deepEqual(result.removedFiles, ['assets/unused.mp4.sb-temp', 'assets/unused.png']);
  assert.equal(result.savedBytes, Buffer.byteLength('bytes:unused.png') + Buffer.byteLength('bytes:unused.mp4.sb-temp'));
  for (const name of captured.filter(name => name !== 'unused.png')) await access(path.join(clientDirectory, 'assets', name));
  for (const name of ['new-user.png', 'font.woff2', 'app.js', 'lazy.js']) await access(path.join(clientDirectory, 'assets', name));
  assert.equal(await readFile(path.join(clientDirectory, 'projects/example/unused.png'), 'utf8'), 'project-owned');
  assert.equal(await readFile(path.join(source, 'assets/unused.png'), 'utf8'), 'bytes:unused.png');
  assert.equal(await readFile(path.join(source, 'assets/unused.mp4.sb-temp'), 'utf8'), 'bytes:unused.mp4.sb-temp');
});

test('pruner refuses canonical source public directory', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'dragonlee-prune-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'public'), { recursive: true });
  assert.throws(() => pruneSitesUnusedMedia({ root, clientDirectory: path.join(root, 'public') }), /Never prune canonical/);
});
