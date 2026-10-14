import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { pruneSitesDeadAssetBindings } from '../scripts/prune-sites-dead-asset-bindings.mjs';

async function fixture(t, source) {
  const clientDirectory = await mkdtemp(path.join(tmpdir(), 'dragonlee-dead-media-'));
  t.after(() => rm(clientDirectory, { recursive: true, force: true }));
  await mkdir(path.join(clientDirectory, 'assets/nested'), { recursive: true });
  const file = path.join(clientDirectory, 'assets/nested/app.js');
  await writeFile(file, source);
  const stats = pruneSitesDeadAssetBindings({ clientDirectory });
  const updated = await readFile(file, 'utf8');
  parse(updated, { sourceType: 'unambiguous' });
  return { stats, updated };
}

test('grouped declarations retain referenced media and every other initializer side effect', async t => {
  const source = 'function run(){const first="/assets/first.png", before=events.push("before"), middle=`/assets/middle.jpg`, live="/assets/live.mp4", after=events.push("after"), last="/assets/last.webp"; events.push(live);} run();';
  const { stats, updated } = await fixture(t, source);
  assert.equal(stats.removedBindings, 3);
  assert.deepEqual(stats.removedAssetPaths, ['/assets/first.png', '/assets/last.webp', '/assets/middle.jpg']);
  const events = [];
  vm.runInNewContext(updated, { events });
  assert.deepEqual(events, ['before', 'after', '/assets/live.mp4']);
  assert.ok(updated.includes('before=events.push("before")'));
  assert.ok(updated.includes('after=events.push("after")'));
  assert.deepEqual(stats.changedFiles, ['assets/nested/app.js']);
});

test('shadowed names use their own binding and exports, writes, dynamic templates and nonmedia survive', async t => {
  const source = 'const same="/assets/outer.png"; function show(){const same="/assets/inner.png";return same;} show(); export const exported="/assets/export.png"; const indirect="/assets/indirect.jpg"; export {indirect}; let written="/assets/write.mp4"; written="changed"; const dynamic=`/assets/${name}.png`, font="/assets/font.woff2", remote="https://example.test/assets/picture.png";';
  const { stats, updated } = await fixture(t, source);
  assert.equal(stats.removedBindings, 1);
  assert.ok(!updated.includes('/assets/outer.png'));
  for (const value of ['inner.png', 'export.png', 'indirect.jpg', 'write.mp4', '${name}', 'font.woff2', 'https://example.test/assets/picture.png']) assert.ok(updated.includes(value));
});

test('whole declarations preserve control flow and for initializer separators', async t => {
  const source = 'function run(){if (true) var unused="/assets/if.png"; else events.push("wrong"); for (let dead="/assets/for.png";events.length<1;) {events.push("okay");} const all="/assets/all.jpg", other="/assets/other.webm";} run();';
  const { stats, updated } = await fixture(t, source);
  assert.equal(stats.removedBindings, 4);
  const events = [];
  vm.runInNewContext(updated, { events });
  assert.deepEqual(events, ['okay']);
});

test('direct eval protects bindings it can access', async t => {
  const source = 'function run(){const image="/assets/eval.png"; function show(){return eval("image");} show(); function other(){const safe="/assets/other.png";} other();} run();';
  const { stats, updated } = await fixture(t, source);
  assert.equal(stats.removedBindings, 1);
  assert.ok(updated.includes('/assets/eval.png'));
  assert.ok(!updated.includes('/assets/other.png'));
});

test('canonical public source is refused', () => {
  assert.throws(() => pruneSitesDeadAssetBindings({ clientDirectory: '/tmp/example/public' }), /Never prune canonical public/);
});

test('classic script globals survive access through globalThis or another script', async t => {
  const source = 'var image="/assets/global.png"; const other="/assets/shared.jpg";';
  const { stats, updated } = await fixture(t, source);
  assert.equal(stats.removedBindings, 0);
  assert.equal(updated, source);
});

async function registryFixture(t, source, metadata, external = '') {
  const root = await mkdtemp(path.join(tmpdir(), 'dragonlee-registry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const clientDirectory = path.join(root, 'dist/client');
  await mkdir(path.join(clientDirectory, 'assets'), { recursive: true });
  await mkdir(path.join(root, 'content'), { recursive: true });
  await writeFile(path.join(root, 'content/content-data.json'), JSON.stringify(metadata));
  const file = path.join(clientDirectory, 'assets/index-CtCmjgre.js');
  await writeFile(file, source);
  await writeFile(path.join(clientDirectory, 'index.html'), external);
  const stats = pruneSitesDeadAssetBindings({ root, clientDirectory });
  const updated = await readFile(file, 'utf8');
  parse(updated, { sourceType: 'module' });
  return { stats, updated };
}

test('captured poster, tint and responsive registries keep user rows and their variants while removing dormant references', async t => {
  const source = 'const user="/assets/user.mp4", poster="/assets/user-poster.jpg", old="/assets/reference.mp4", oldPoster="/assets/reference-poster.jpg", cover="/assets/user-cover.png", variant="/assets/user-cover-small.png", oldCover="/assets/reference-cover.png", oldVariant="/assets/reference-cover-small.png", icon="/assets/icon.svg"; const Na=new Map([[user,poster],[old,oldPoster]]), Ma=new Map([[user,"#123456"],[old,"#abcdef"]]), Fn=new Map([[cover,[[variant,600],[cover,1200]]],[oldCover,[[oldVariant,600],[oldCover,1200]]]]), Nl=Object.assign({"./img/user-poster.jpg":poster,"./img/reference-poster.jpg":oldPoster,"./img/icon.svg":icon}); const Pl=e=>Nl["./img/"+e+"-poster.jpg"]; function render(e){events.push(Na.get(e.src),Ma.get(e.video),Fn.has(e.image));} const view={props:{imagepath:cover},run(){events.push(Fn.get(this.props.imagepath));}}; render({src:user,video:user,image:cover});view.run(); export {};';
  const metadata = { projects: [{ items: [{ src: '/assets/user.mp4', composite: { poster: '/assets/user-poster.jpg' } }] }], tiles: [{ image: '/assets/user-cover.png' }], posters: [] };
  const { stats, updated } = await registryFixture(t, source, metadata);
  assert.equal(stats.removedRegistryEntries, 4);
  assert.equal(stats.removedBindings, 4);
  for (const removed of ['reference.mp4', 'reference-poster.jpg', 'reference-cover.png', 'reference-cover-small.png']) assert.ok(!updated.includes(removed));
  for (const retained of ['user.mp4', 'user-poster.jpg', 'user-cover-small.png', 'icon.svg']) assert.ok(updated.includes(retained));
  const events = [];
  vm.runInNewContext(updated.replace('export {};', ''), { events });
  assert.equal(events[0], '/assets/user-poster.jpg');
  assert.equal(events[1], '#123456');
  assert.equal(events[2], true);
  assert.equal(events[3][0][0], '/assets/user-cover-small.png');
});

test('external CSS, explicit lookups and exported aliases protect assets beyond project metadata', async t => {
  const source = 'const a="/assets/external.mp4", ap="/assets/external-poster.jpg", b="/assets/lookup.mp4", bp="/assets/lookup-poster.jpg", c="/assets/exported.png", old="/assets/unused.mp4", op="/assets/unused-poster.jpg"; const Na=new Map([[a,ap],[b,bp],[old,op]]); events.push(Na.get(b)); export {c};';
  const { stats, updated } = await registryFixture(t, source, { projects: [], tiles: [] }, '<style>video{background:url(/assets/external.mp4)}</style>');
  assert.equal(stats.removedRegistryEntries, 1);
  for (const retained of ['external.mp4', 'external-poster.jpg', 'lookup.mp4', 'lookup-poster.jpg', 'exported.png']) assert.ok(updated.includes(retained));
  assert.ok(!updated.includes('unused.mp4'));
});

test('unknown consumers, writes, side effects, shadowed constructors and live dynamic poster resolvers prevent specialization', async t => {
  const source = 'const old="/assets/old.mp4", poster="/assets/old-poster.jpg"; const mutable=new Map([[old,poster]]); mutable.set("other","value"); const unknown=new Map([[old,poster]]); events.push(unknown.get(arbitrary)); const escaped=new Map([[old,poster]]); consume(escaped); const effectful=new Map([[old,loadPoster()]]); events.push(effectful.get(e.src)); const Nl=Object.assign({"./img/old-poster.jpg":poster}); const Pl=e=>Nl["./img/"+e+"-poster.jpg"]; events.push(Pl("old")); function nested(Map){const shadowed=new Map([[old,poster]]);events.push(shadowed.get(e.src));} export {};';
  const { stats, updated } = await registryFixture(t, source, { projects: [], tiles: [] });
  assert.equal(stats.removedRegistryEntries, 0);
  assert.equal(updated, source);
});

test('an emptied registry remains valid and classic scripts keep their registries', async t => {
  const source = 'const old="/assets/old.mp4", poster="/assets/old-poster.jpg"; const Na=new Map([[old,poster],]); events.push(Na.get(e.src)); export {};';
  const { stats, updated } = await registryFixture(t, source, { projects: [], tiles: [] });
  assert.equal(stats.removedRegistryEntries, 1);
  assert.ok(updated.includes('new Map([])'));
  assert.ok(!updated.includes('old.mp4'));
  const classic = source.replace(' export {};', '');
  const classicResult = await registryFixture(t, classic, { projects: [], tiles: [] });
  assert.equal(classicResult.stats.removedRegistryEntries, 0);
  assert.equal(classicResult.updated, classic);
});
