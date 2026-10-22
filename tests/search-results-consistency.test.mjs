import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = filename => JSON.parse(readFileSync(path.join(root, 'content', filename), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('search results consistency preserves the complete long-form source across readable sections', () => {
  const project = readJSON('content-data.json').projects.find(project => project.id === 72);
  const media = readJSON('user-media.json').replacements.find(project => project.projectId === 72);
  const sourceMap = readJSON('source-media-map.json');
  assert.equal(project.items.length, media.sectionCount);
  assert.equal(project.year, '');
  assert.equal(media.pageCount, 1);
  assert.equal(media.outputs.length, project.items.length);
  const original = readFileSync(path.join(root, 'public', media.sourcePageRender.path));
  assert.equal(original.readUInt32BE(16), 1920);
  assert.equal(original.readUInt32BE(20), 22627);
  assert.equal(media.sourcePageRender.bytes, original.length);
  assert.equal(media.sourcePageRender.sha256, hash(original));
  let previousBottom = 0;
  for (const [index, item] of project.items.entries()) {
    const output = media.outputs[index];
    const bytes = readFileSync(path.join(root, 'public', item.src));
    assert.equal(item.src, '/assets/search-results-consistency/section-' + String(index + 1).padStart(3, '0') + '.png');
    assert.deepEqual({ ...sourceMap[item.key], key: item.key }, item);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), item.w);
    assert.equal(bytes.readUInt32BE(20), item.h);
    assert.equal(item.w, 1920);
    assert.ok(item.h >= 800 && item.h <= 1280);
    assert.equal(output.sourcePage, 1);
    assert.equal(output.sourceTop, previousBottom);
    assert.equal(output.sourceBottom - output.sourceTop, item.h);
    assert.equal(output.bytes, bytes.length);
    assert.equal(output.sha256, hash(bytes));
    previousBottom = output.sourceBottom;
  }
  assert.equal(previousBottom, 22627);
});

test('search results consistency uses a square Work cover without cropping its original title or detail', () => {
  const data = readJSON('content-data.json');
  const project = data.projects.find(project => project.id === 72);
  const tile = data.tiles.find(tile => tile.id === 72);
  const media = readJSON('user-media.json').replacements.find(project => project.projectId === 72);
  const bytes = readFileSync(path.join(root, 'public', tile.image));
  assert.equal(tile.image, '/assets/search-results-consistency/cover.png');
  assert.notEqual(tile.image, project.items[0].src);
  assert.equal(tile.ratio, 1);
  assert.equal(media.tileRatio, 1);
  assert.equal(media.coverDisplay.originalPixelsPreserved, true);
  const stylesheet = readFileSync(path.join(root, 'src/portfolio-media.css'), 'utf8');
  const coverRule = stylesheet.split('}').find(rule => rule.includes('#grid .tile[data-project="72"] .galleryCard > img'));
  assert.match(coverRule, /height:\s*56\.25%/);
  assert.match(coverRule, /object-fit:\s*contain/);
  assert.equal(bytes.readUInt32BE(16), 1920);
  assert.equal(bytes.readUInt32BE(20), 1080);
  assert.equal(media.cover.sourcePage, 1);
  assert.equal(media.cover.sourceViewport.width, 1120);
  assert.equal(media.cover.sourceViewport.height, 630);
  assert.equal(media.cover.bytes, bytes.length);
  assert.equal(media.cover.sha256, hash(bytes));
});

test('search results consistency is synchronized across Work, runtime, editable content and detail navigation', () => {
  const data = readJSON('content-data.json');
  const editable = readJSON('editable-content.json');
  const runtime = readFileSync(path.join(root, 'public/assets/index-CtCmjgre.js'), 'utf8');
  const project = data.projects.find(project => project.id === 72);
  const tileIndex = data.tiles.findIndex(tile => tile.id === 72);
  const tile = data.tiles[tileIndex];
  assert.equal(data.tiles[tileIndex - 1].id, 71);
  assert.ok(tileIndex < data.tiles.findIndex(tile => tile.id === 69));
  assert.deepEqual(data.tiles.filter(tile => [53, 52, 64, 66, 54].includes(tile.id)).map(tile => tile.id), [53, 52, 64, 66, 54]);
  assert.equal(project.title, 'Search Results Consistency');
  assert.equal(editable.words[72].title, project.title);
  assert.equal(editable.words[72].text, project.text);
  assert.equal(editable.tiles[72].label, tile.label);
  assert.equal(editable.tiles[72].year, '');
  assert.deepEqual(data.editableWords, editable);
  assert.ok(runtime.includes(JSON.stringify(data.projects)));
  assert.ok(runtime.includes(JSON.stringify(data.tiles)));
  assert.deepEqual(
    data.projects.filter(project => !project.directUrl).map(project => project.id),
    data.tiles.filter(tile => !tile.company && !tile.directUrl).map(tile => tile.id),
  );
});
