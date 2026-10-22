import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = filename => JSON.parse(readFileSync(path.join(root, 'content', filename), 'utf8'));

test('Quark brand guidelines show fifteen pages and preserve the sixteen original files, dimensions and checksums', () => {
  const data = readJSON('content-data.json');
  const sourceMap = readJSON('source-media-map.json');
  const media = readJSON('user-media.json').replacements.find(project => project.projectId === 71);
  const project = data.projects.find(project => project.id === 71);
  assert.equal(project.title, 'Quark Brand Guidelines');
  assert.equal(project.year, '');
  assert.equal(project.items.length, 15);
  assert.equal(project.items.at(-1).key, "quark-brand-guidelines/page-015.png");
  assert.equal(media.activePageCount, 15);
  assert.equal(media.pageCount, 16);
  assert.equal(media.outputs.length, 16);
  const files = readdirSync(path.join(root, 'public/assets/quark-brand-guidelines')).filter(filename => filename.endsWith('.png')).sort();
  assert.deepEqual(files, Array.from({ length: 16 }, (_, index) => 'page-' + String(index + 1).padStart(3, '0') + '.png'));
  for (const [index, item] of project.items.entries()) {
    const filename = files[index];
    const bytes = readFileSync(path.join(root, 'public/assets/quark-brand-guidelines', filename));
    const output = media.outputs[index];
    assert.equal(item.key, 'quark-brand-guidelines/' + filename);
    assert.equal(item.src, '/assets/quark-brand-guidelines/' + filename);
    assert.deepEqual({ ...sourceMap[item.key], key: item.key }, item);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), item.w);
    assert.equal(bytes.readUInt32BE(20), item.h);
    assert.equal(item.w, 1920);
    assert.equal(item.h, 1080);
    assert.equal(output.sourcePage, index + 1);
    assert.equal(output.path, item.src.slice(1));
    assert.equal(output.bytes, bytes.length);
    assert.equal(output.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
});

test('Quark brand guidelines are synchronized with Work, detail navigation and editable content', () => {
  const data = readJSON('content-data.json');
  const editable = readJSON('editable-content.json');
  const runtime = readFileSync(path.join(root, 'public/assets/index-CtCmjgre.js'), 'utf8');
  assert.deepEqual(data.editableWords, editable);
  assert.ok(runtime.includes(JSON.stringify(data.projects)));
  assert.ok(runtime.includes(JSON.stringify(data.tiles)));
  const project = data.projects.find(project => project.id === 71);
  const tileIndex = data.tiles.findIndex(tile => tile.id === 71);
  const tile = data.tiles[tileIndex];
  assert.equal(data.tiles[tileIndex - 1].id, 60);
  assert.ok(tileIndex < data.tiles.findIndex(tile => tile.id === 69));
  assert.deepEqual(data.tiles.filter(tile => [53, 52, 64, 66, 54].includes(tile.id)).map(tile => tile.id), [53, 52, 64, 66, 54]);
  assert.equal(tile.image, "/assets/quark-brand-guidelines/page-003.png");
  assert.equal(tile.ratio, 1080 / 1920);
  assert.equal(tile.year, '');
  assert.equal(editable.words[71].title, project.title);
  assert.equal(editable.words[71].text, project.text);
  assert.equal(editable.tiles[71].label, tile.label);
  assert.equal(editable.tiles[71].year, tile.year);
  assert.deepEqual(
    data.projects.filter(project => !project.directUrl).map(project => project.id),
    data.tiles.filter(tile => !tile.company && !tile.directUrl).map(tile => tile.id),
  );
});
