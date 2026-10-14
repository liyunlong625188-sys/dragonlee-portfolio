import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { optimizeSitesImages } from '../scripts/optimize-sites-images.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sites-image-encoding-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const clientDirectory = path.join(root, 'client');
  const cacheDirectory = path.join(root, 'cache');
  await mkdir(path.join(clientDirectory, 'assets'), { recursive: true });
  return { root, clientDirectory, cacheDirectory };
}

async function samplePng() {
  const pixels = Buffer.alloc(64 * 32 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 210;
    pixels[i + 1] = 35;
    pixels[i + 2] = 71;
    pixels[i + 3] = 255;
  }
  return sharp(pixels, { raw: { width: 64, height: 32, channels: 4 } })
    .withMetadata({ density: 144 }).png({ compressionLevel: 0 }).toBuffer();
}

test('deployment conversion preserves dimensions, pixels, metadata and public original; cache is reused', async t => {
  const f = await fixture(t);
  const source = await samplePng();
  const original = path.join(f.root, 'public-original.png');
  const deployed = path.join(f.clientDirectory, 'assets', 'a design.png');
  await writeFile(original, source);
  await writeFile(deployed, source);
  const result = await optimizeSitesImages(f);
  assert.equal(result.count, 1);
  assert.equal(result.cacheHits, 0);
  assert.ok(result.savedBytes > 0);
  assert.deepEqual(result.index, { '/assets/a%20design.png': '/.optimized-images/assets/a%20design.webp' });
  await assert.rejects(readFile(deployed), { code: 'ENOENT' });
  assert.deepEqual(await readFile(original), source);
  const optimized = await readFile(path.join(f.clientDirectory, '.optimized-images/assets/a design.webp'));
  assert.deepEqual(await sharp(optimized).ensureAlpha().raw().toBuffer(), await sharp(source).ensureAlpha().raw().toBuffer());
  const before = await sharp(source).metadata();
  const after = await sharp(optimized).metadata();
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert.deepEqual(after.icc, before.icc);
  // WebP carries resolution in EXIF rather than PNG's pHYs density field.
  const webpExif = after.exif.subarray(0, 6).equals(Buffer.from('Exif\0\0')) ? after.exif.subarray(6) : after.exif;
  assert.deepEqual(webpExif, before.exif);
  await writeFile(deployed, source);
  const again = await optimizeSitesImages(f);
  assert.equal(again.cacheHits, 1);
  assert.equal(again.count, 1);
});

test('cached WebP with different decoded pixels cannot delete a deployment original', async t => {
  const f = await fixture(t);
  const source = await samplePng();
  const deployed = path.join(f.clientDirectory, 'assets', 'image.png');
  await writeFile(deployed, source);
  await optimizeSitesImages(f);
  const [cached] = await readdir(f.cacheDirectory);
  await sharp({ create: { width: 64, height: 32, channels: 4, background: '#0000ff' } })
    .webp({ lossless: true }).toFile(path.join(f.cacheDirectory, cached));
  await writeFile(deployed, source);
  const result = await optimizeSitesImages(f);
  assert.equal(result.count, 0);
  assert.equal(result.cacheHits, 1);
  assert.deepEqual(await readFile(deployed), source);
  assert.equal(result.skippedFiles[0].reason, 'Decoded pixels differ');
});

test('image beyond the WebP dimension limit remains an original PNG', async t => {
  const f = await fixture(t);
  const source = await sharp({ create: { width: 16384, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
  const deployed = path.join(f.clientDirectory, 'assets', 'long.png');
  await writeFile(deployed, source);
  const result = await optimizeSitesImages(f);
  assert.equal(result.count, 0);
  assert.equal(result.skippedFiles[0].reason, 'WebP dimension limit');
  assert.deepEqual(await readFile(deployed), source);
});
