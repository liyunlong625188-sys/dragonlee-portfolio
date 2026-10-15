import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = filename => JSON.parse(readFileSync(path.join(root, 'content', filename), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('Some Songs Are Timeless preserves the original video bytes, aspect ratio, audio and derived poster', async () => {
  const project = readJSON('content-data.json').projects.find(project => project.id === 74);
  const media = readJSON('user-media.json').replacements.find(project => project.projectId === 74);
  const sourceMap = readJSON('source-media-map.json');
  assert.equal(project.items.length, 1);
  const item = project.items[0];
  const video = readFileSync(path.join(root, 'public', item.src));
  const poster = readFileSync(path.join(root, 'public', item.poster));
  const posterMetadata = await sharp(poster).metadata();
  assert.equal(item.src, '/assets/some-songs-are-timeless/video.mp4');
  assert.equal(item.video, true);
  assert.equal(item.w, 1608);
  assert.equal(item.h, 1246);
  assert.deepEqual({ ...sourceMap[item.key], key: item.key }, item);
  assert.equal(video.subarray(4, 8).toString(), 'ftyp');
  assert.equal(video.length, media.sourceBytes);
  assert.equal(video.length, media.video.bytes);
  assert.equal(hash(video), media.sourceSha256);
  assert.equal(hash(video), media.video.sha256);
  assert.equal(media.video.originalBytesPreserved, true);
  assert.equal(media.video.hasAudio, true);
  assert.match(media.video.audioCodec, /aac/i);
  assert.ok(media.video.durationSeconds > 25 && media.video.durationSeconds < 26);
  assert.equal(posterMetadata.width, item.w);
  assert.equal(posterMetadata.height, item.h);
  assert.equal(poster.length, media.poster.bytes);
  assert.equal(hash(poster), media.poster.sha256);
  assert.ok(media.poster.timeSeconds >= 0 && media.poster.timeSeconds < media.video.durationSeconds);
});

test('Some Songs Are Timeless video card, details, runtime and editable words are synchronized without inferred authorship', () => {
  const data = readJSON('content-data.json');
  const editable = readJSON('editable-content.json');
  const runtime = readFileSync(path.join(root, 'public/assets/index-CtCmjgre.js'), 'utf8');
  const project = data.projects.find(project => project.id === 74);
  const tileIndex = data.tiles.findIndex(tile => tile.id === 74);
  const tile = data.tiles[tileIndex];
  const item = project.items[0];
  assert.equal(project.title, 'Some Songs Are Timeless');
  assert.equal(project.year, '');
  assert.deepEqual(project.credits, []);
  assert.equal(tile.year, '');
  assert.equal(tile.video, item.src);
  assert.equal(tile.poster, item.poster);
  assert.equal(tile.ratio, item.h / item.w);
  assert.equal(data.tiles[tileIndex - 1].id, 73);
  assert.ok(tileIndex < data.tiles.findIndex(tile => tile.id === 69));
  assert.equal(data.tiles.at(-1).id, 69);
  assert.equal(editable.words[74].title, project.title);
  assert.equal(editable.words[74].text, project.text);
  assert.equal(editable.words[74].credits, '');
  assert.equal(editable.tiles[74].label, tile.label);
  assert.deepEqual(data.editableWords, editable);
  assert.ok(runtime.includes(JSON.stringify(data.projects)));
  assert.ok(runtime.includes(JSON.stringify(data.tiles)));
  assert.deepEqual(
    data.projects.filter(project => !project.directUrl).map(project => project.id),
    data.tiles.filter(tile => !tile.company && !tile.directUrl).map(tile => tile.id),
  );
});
