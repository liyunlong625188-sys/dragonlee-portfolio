import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = filename => JSON.parse(readFileSync(path.join(root, 'content', filename), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('Wuqu brand identity preserves the complete original artwork in continuous reading sections', () => {
  const project = readJSON('content-data.json').projects.find(project => project.id === 73);
  const media = readJSON('user-media.json').replacements.find(project => project.projectId === 73);
  const sourceMap = readJSON('source-media-map.json');
  assert.equal(project.items.length, 31);
  assert.equal(media.pageCount, 1);
  assert.equal(media.sectionCount, 31);
  assert.equal(media.outputs.length, 31);
  const full = readFileSync(path.join(root, 'public', media.sourcePageRender.path));
  assert.equal(full.readUInt32BE(16), 1920);
  assert.equal(full.readUInt32BE(20), 33858);
  assert.equal(full.length, media.sourcePageRender.bytes);
  assert.equal(hash(full), media.sourcePageRender.sha256);
  let previousBottom = 0;
  for (const [index, item] of project.items.entries()) {
    const output = media.outputs[index];
    const bytes = readFileSync(path.join(root, 'public', item.src));
    assert.equal(item.src, '/assets/wuqu-brand-identity/section-' + String(index + 1).padStart(3, '0') + '.png');
    assert.deepEqual({ ...sourceMap[item.key], key: item.key }, item);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), item.w);
    assert.equal(bytes.readUInt32BE(20), item.h);
    assert.equal(item.w, 1920);
    assert.equal(output.sourcePage, 1);
    assert.equal(output.sourceTop, previousBottom);
    assert.equal(output.sourceBottom - output.sourceTop, item.h);
    assert.equal(output.bytes, bytes.length);
    assert.equal(output.sha256, hash(bytes));
    previousBottom = output.sourceBottom;
  }
  assert.equal(previousBottom, 33858);
});

test('Wuqu original cover, year, Work, runtime and editable content are synchronized', () => {
  const data = readJSON('content-data.json');
  const editable = readJSON('editable-content.json');
  const runtime = readFileSync(path.join(root, 'public/assets/index-CtCmjgre.js'), 'utf8');
  const project = data.projects.find(project => project.id === 73);
  const tileIndex = data.tiles.findIndex(tile => tile.id === 73);
  const tile = data.tiles[tileIndex];
  const media = readJSON('user-media.json').replacements.find(project => project.projectId === 73);
  const cover = readFileSync(path.join(root, 'public', tile.image));
  assert.equal(project.title, 'Wuqu Brand Identity');
  assert.equal(project.year, '2019');
  assert.match(media.yearStatus, /2019物区品牌形象设计/);
  assert.equal(tile.image, '/assets/wuqu-brand-identity/cover.png');
  assert.equal(tile.ratio, 1080 / 1920);
  assert.equal(cover.readUInt32BE(16), 1920);
  assert.equal(cover.readUInt32BE(20), 1080);
  assert.equal(cover.length, media.cover.bytes);
  assert.equal(hash(cover), media.cover.sha256);
  assert.equal(data.tiles[tileIndex - 1].id, 72);
  assert.ok(tileIndex < data.tiles.findIndex(tile => tile.id === 69));
  assert.deepEqual(data.tiles.filter(tile => [53, 52, 64, 66, 54].includes(tile.id)).map(tile => tile.id), [53, 52, 64, 66, 54]);
  assert.equal(editable.words[73].title, project.title);
  assert.equal(editable.words[73].text, project.text);
  assert.equal(editable.words[73].year, project.year);
  assert.equal(editable.tiles[73].label, tile.label);
  assert.equal(editable.tiles[73].year, tile.year);
  assert.deepEqual(data.editableWords, editable);
  assert.ok(runtime.includes(JSON.stringify(data.projects)));
  assert.ok(runtime.includes(JSON.stringify(data.tiles)));
  assert.deepEqual(
    data.projects.filter(project => !project.directUrl).map(project => project.id),
    data.tiles.filter(tile => !tile.company && !tile.directUrl).map(tile => tile.id),
  );
});
