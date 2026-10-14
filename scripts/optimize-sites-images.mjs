import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const maxWebpDimension = 16383;
export const minimumImagePSNR = 38;
const qualities = [94, 98, 100];
const modes = new Set(['lossless', 'high-quality']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const assetUrl = relative => '/' + relative.split(path.sep).map(encodeURIComponent).join('/');

function encodingVersion(mode) {
  // Keep the existing verified lossless cache reusable; each mode has its own key.
  return mode === 'lossless'
    ? `lossless-webp-effort4-metadata-rgba-v1-sharp${sharp.versions.sharp}`
    : `high-quality-webp-effort4-metadata-psnr38-alphaexact-v1-sharp${sharp.versions.sharp}`;
}

function cacheKey(source, mode) {
  return sha256(Buffer.concat([Buffer.from(encodingVersion(mode) + '\0'), source]));
}

async function pngFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.optimized-images') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await pngFiles(file));
    else if (entry.isFile() && /\.png$/i.test(entry.name)) files.push(file);
  }
  return files.sort();
}

async function decode(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels, hash: sha256(data) };
}

async function inspect(source, encoded, mode, before, sourceMetadata) {
  const [after, encodedMetadata] = await Promise.all([decode(encoded), sharp(encoded).metadata()]);
  const dimensionsMatch = before.width === after.width && before.height === after.height && before.channels === after.channels;
  const pixelIdentical = dimensionsMatch && before.hash === after.hash;
  let alphaExact = dimensionsMatch;
  let squaredError = 0;
  let absoluteError = 0;
  let channelCount = 0;
  let maxRgbError = 0;
  if (dimensionsMatch) {
    for (let index = 0; index < before.data.length; index += 4) {
      if (before.data[index + 3] !== after.data[index + 3]) alphaExact = false;
      // Fully transparent RGB does not affect visible image quality. Alpha is
      // always checked, and strict lossless mode additionally hashes all RGBA.
      if (before.data[index + 3] === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        const error = Math.abs(before.data[index + channel] - after.data[index + channel]);
        squaredError += error * error;
        absoluteError += error;
        maxRgbError = Math.max(maxRgbError, error);
        channelCount++;
      }
    }
  }
  const meanSquaredError = channelCount ? squaredError / channelCount : 0;
  const rgbPSNR = dimensionsMatch ? (meanSquaredError === 0 ? 'Infinity' : 10 * Math.log10(255 * 255 / meanSquaredError)) : null;
  const iccPreserved = Buffer.from(sourceMetadata.icc ?? []).equals(Buffer.from(encodedMetadata.icc ?? []));
  const acceptable = dimensionsMatch && alphaExact && iccPreserved && (mode === 'lossless'
    ? pixelIdentical : rgbPSNR === 'Infinity' || rgbPSNR >= minimumImagePSNR);
  return {
    mode, acceptable, pixelIdentical, dimensionsMatch, alphaExact, iccPreserved,
    width: before.width, height: before.height,
    dimensions: { width: before.width, height: before.height },
    rgbPSNR, rgbMeanAbsoluteError: channelCount ? absoluteError / channelCount : 0, maxRgbError,
    sourceSHA256: sha256(source), optimizedSHA256: sha256(encoded),
  };
}

/** Reusable deployment evidence check, also applied to every cached output. */
export async function inspectImageEncoding(sourceBytes, encodedBytes, { mode = 'lossless' } = {}) {
  if (!modes.has(mode)) throw new Error('Unsupported image optimization mode: ' + mode);
  const [before, metadata] = await Promise.all([decode(sourceBytes), sharp(sourceBytes).metadata()]);
  return inspect(sourceBytes, encodedBytes, mode, before, metadata);
}

async function writeCache(filename, bytes, evidence) {
  const temporary = filename + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, bytes);
  await rename(temporary, filename);
  const metadataFile = filename + '.json';
  const temporaryMetadata = metadataFile + '.' + randomUUID() + '.tmp';
  await writeFile(temporaryMetadata, JSON.stringify(evidence) + '\n');
  await rename(temporaryMetadata, metadataFile);
}

/** Only deployment copies change. The default remains strictly pixel-identical. */
export async function optimizeSitesImages({ clientDirectory, cacheDirectory, mode = 'lossless' }) {
  if (!clientDirectory || !cacheDirectory) throw new Error('clientDirectory and cacheDirectory are required');
  if (!modes.has(mode)) throw new Error('Unsupported image optimization mode: ' + mode);
  const client = path.resolve(clientDirectory);
  const cache = path.resolve(cacheDirectory);
  if (cache === client || cache.startsWith(client + path.sep)) throw new Error('Image cache must be outside the deployment client directory');
  await mkdir(cache, { recursive: true });
  const files = await pngFiles(client);
  const started = Date.now();
  const indexEntries = [];
  const skippedFiles = [];
  const records = [];
  let originalBytes = 0;
  let optimizedBytes = 0;
  let cacheHits = 0;
  let next = 0;

  async function optimize(file) {
    const relative = path.relative(client, file);
    const sourceUrl = assetUrl(relative);
    const source = await readFile(file);
    const metadata = await sharp(source).metadata();
    function retain(reason) {
      skippedFiles.push({ path: sourceUrl, reason });
      records.push({
        sourceUrl, deployedUrl: sourceUrl, optimizedUrl: sourceUrl, mode, codec: 'png', quality: null,
        sourceBytes: source.length, optimizedBytes: source.length, savedBytes: 0,
        sourceSHA256: sha256(source), optimizedSHA256: sha256(source),
        width: metadata.width, height: metadata.height,
        dimensions: { width: metadata.width, height: metadata.height },
        dimensionsMatch: true, pixelIdentical: true, alphaExact: true, iccPreserved: true,
        rgbPSNR: 'Infinity', acceptable: true, reason,
      });
    }
    if (/^(?:og|favicon[^/]*|apple-touch-icon[^/]*|web-app-manifest[^/]*)\.png$/i.test(relative)) return retain('Preserve social preview and icon MIME types');
    if (metadata.width > maxWebpDimension || metadata.height > maxWebpDimension) return retain('WebP dimension limit');
    if (metadata.depth !== 'uchar' || (metadata.pages ?? 1) !== 1) return retain('Unsupported bit depth or animation');

    const before = await decode(source);
    const cachedFile = path.join(cache, cacheKey(source, mode) + '.webp');
    let encoded;
    let codec = 'webp-lossless';
    let quality = null;
    let attempts = [];
    try {
      encoded = await readFile(cachedFile);
      if (mode === 'high-quality') {
        const cachedMetadata = JSON.parse(await readFile(cachedFile + '.json', 'utf8'));
        if (cachedMetadata.mode !== mode || !['webp-lossy', 'webp-lossless'].includes(cachedMetadata.codec) ||
          (cachedMetadata.codec === 'webp-lossy' && !qualities.includes(cachedMetadata.quality))) throw new Error('Invalid high-quality image cache metadata');
        codec = cachedMetadata.codec;
        quality = cachedMetadata.quality;
        attempts = cachedMetadata.attempts ?? [];
      }
      cacheHits++;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      encoded = undefined;
    }

    if (!encoded) {
      // Reuse the separate lossless cache as the size and fallback baseline.
      const losslessFile = path.join(cache, cacheKey(source, 'lossless') + '.webp');
      let lossless;
      try { lossless = await readFile(losslessFile); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        lossless = await sharp(source).keepMetadata().webp({ lossless: true, effort: 4 }).toBuffer();
      }
      encoded = lossless;
      if (mode === 'high-quality') {
        for (const candidateQuality of qualities) {
          const candidate = await sharp(source).keepMetadata().webp({ quality: candidateQuality, alphaQuality: 100, effort: 4 }).toBuffer();
          const evidence = await inspect(source, candidate, mode, before, metadata);
          attempts.push({ quality: candidateQuality, bytes: candidate.length, rgbPSNR: evidence.rgbPSNR, acceptable: evidence.acceptable });
          if (!evidence.acceptable) continue;
          if (candidate.length < lossless.length && candidate.length < source.length) {
            encoded = candidate;
            codec = 'webp-lossy';
            quality = candidateQuality;
          }
          break;
        }
      }
    }

    // Both lossless fallback and cache hits must satisfy their actual codec's
    // policy. A fallback cannot become lossy merely because mode permits it.
    const evidence = await inspect(source, encoded, codec === 'webp-lossless' ? 'lossless' : mode, before, metadata);
    if (!evidence.acceptable) return retain(codec === 'webp-lossless' ? 'Decoded pixels differ' : 'Cached image fails quality threshold');
    if (encoded.length >= source.length) return retain('WebP is not smaller');
    await writeCache(cachedFile, encoded, { codec, quality, attempts, ...evidence, mode });

    const targetRelative = path.join('.optimized-images', relative.replace(/\.png$/i, '.webp'));
    const target = path.join(client, targetRelative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(cachedFile, target);
    if ((await stat(target)).size !== encoded.length) throw new Error('Incomplete optimized image: ' + relative);
    await rm(file);
    originalBytes += source.length;
    optimizedBytes += encoded.length;
    indexEntries.push([sourceUrl, assetUrl(targetRelative)]);
    records.push({ sourceUrl, deployedUrl: assetUrl(targetRelative), optimizedUrl: assetUrl(targetRelative), ...evidence, mode, codec, quality,
      sourceBytes: source.length, optimizedBytes: encoded.length, savedBytes: source.length - encoded.length, attempts });
  }

  await Promise.all(Array.from({ length: Math.min(2, files.length) }, async () => {
    while (next < files.length) await optimize(files[next++]);
  }));
  return {
    mode,
    index: Object.fromEntries(indexEntries.sort(([a], [b]) => a.localeCompare(b))),
    savedBytes: originalBytes - optimizedBytes,
    count: indexEntries.length,
    originalBytes, optimizedBytes,
    processedCount: files.length,
    cacheHits,
    records: records.sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl)),
    skippedFiles: skippedFiles.sort((a, b) => a.path.localeCompare(b.path)),
    seconds: (Date.now() - started) / 1000,
  };
}
