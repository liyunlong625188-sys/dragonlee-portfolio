import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { inspectImageEncoding, optimizeSitesImages } from '../scripts/optimize-sites-images.mjs';

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
  assert.equal(result.mode, 'lossless');
  assert.equal(result.count, 1);
  assert.equal(result.cacheHits, 0);
  assert.ok(result.savedBytes > 0);
  assert.deepEqual(result.index, { '/assets/a%20design.png': '/.optimized-images/assets/a%20design.webp' });
  assert.equal(result.records[0].codec, 'webp-lossless');
  assert.equal(result.records[0].pixelIdentical, true);
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
  const cached = (await readdir(f.cacheDirectory)).find(file => file.endsWith('.webp'));
  await sharp({ create: { width: 64, height: 32, channels: 4, background: '#0000ff' } })
    .webp({ lossless: true }).toFile(path.join(f.cacheDirectory, cached));
  await writeFile(deployed, source);
  const result = await optimizeSitesImages(f);
  assert.equal(result.count, 0);
  assert.equal(result.cacheHits, 1);
  assert.deepEqual(await readFile(deployed), source);
  assert.equal(result.skippedFiles[0].reason, 'Decoded pixels differ');
});

async function photoPng() {
  const pixels = Buffer.alloc(256 * 256 * 4);
  let seed = 123456789;
  for (let index = 0; index < pixels.length; index += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = seed >>> 24;
    pixels[index + 3] = index < pixels.length / 2 ? 128 : 255;
  }
  return sharp(pixels, { raw: { width: 256, height: 256, channels: 4 } })
    .blur(1.2).withMetadata({ density: 144 }).png({ compressionLevel: 0 }).toBuffer();
}

test('high-quality is optional, records verified quality and preserves exact alpha and ICC', async t => {
  const f = await fixture(t);
  const source = await photoPng();
  const deployed = path.join(f.clientDirectory, 'assets', 'photo.png');
  await writeFile(deployed, source);
  const result = await optimizeSitesImages({ ...f, mode: 'high-quality' });
  assert.equal(result.mode, 'high-quality');
  assert.equal(result.count, 1);
  const record = result.records[0];
  assert.equal(record.codec, 'webp-lossy');
  assert.ok([94, 98, 100].includes(record.quality));
  assert.ok(record.rgbPSNR >= 38 || record.rgbPSNR === 'Infinity');
  assert.equal(record.alphaExact, true);
  assert.equal(record.iccPreserved, true);
  assert.deepEqual(record.dimensions, { width: 256, height: 256 });
  const optimized = await readFile(path.join(f.clientDirectory, '.optimized-images/assets/photo.webp'));
  assert.equal((await inspectImageEncoding(source, optimized, { mode: 'high-quality' })).acceptable, true);
  assert.equal((await inspectImageEncoding(source, optimized)).acceptable, false);
  await writeFile(deployed, source);
  const cached = await optimizeSitesImages({ ...f, mode: 'high-quality' });
  assert.equal(cached.cacheHits, 1);
  assert.equal(cached.records[0].quality, record.quality);
  assert.equal(cached.records[0].optimizedSHA256, record.optimizedSHA256);
  await writeFile(deployed, source);
  const lossless = await optimizeSitesImages(f);
  assert.equal(lossless.cacheHits, 0, 'A high-quality cache must never satisfy default lossless mode');
  assert.equal(lossless.records[0].pixelIdentical, true);
});

test('high-quality falls back to exact lossless pixels when chroma cannot meet the quality threshold', async t => {
  const f = await fixture(t);
  const pixels = Buffer.alloc(64 * 64 * 4);
  let seed = 123456789;
  for (let index = 0; index < pixels.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[index + channel] = seed >>> 24;
    }
    pixels[index + 3] = 255;
  }
  const source = await sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
  await writeFile(path.join(f.clientDirectory, 'assets/noise.png'), source);
  const result = await optimizeSitesImages({ ...f, mode: 'high-quality' });
  assert.equal(result.records[0].codec, 'webp-lossless');
  assert.equal(result.records[0].pixelIdentical, true);
  assert.equal(result.records[0].quality, null);
  assert.deepEqual(result.records[0].attempts.map(attempt => attempt.quality), [94, 98, 100]);
});

test('high-quality cache cannot bypass alpha verification', async t => {
  const f = await fixture(t);
  const source = await photoPng();
  const deployed = path.join(f.clientDirectory, 'assets/photo.png');
  await writeFile(deployed, source);
  await optimizeSitesImages({ ...f, mode: 'high-quality' });
  const cached = (await readdir(f.cacheDirectory)).find(file => file.endsWith('.webp'));
  await sharp(source).ensureAlpha(1).removeAlpha().keepMetadata().webp({ quality: 94 }).toFile(path.join(f.cacheDirectory, cached));
  await writeFile(deployed, source);
  const result = await optimizeSitesImages({ ...f, mode: 'high-quality' });
  assert.equal(result.count, 0);
  assert.equal(result.records[0].codec, 'png');
  assert.deepEqual(await readFile(deployed), source);
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
