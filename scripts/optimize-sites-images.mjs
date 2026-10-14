import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const maxWebpDimension = 16383;
const encodingVersion = `lossless-webp-effort4-metadata-rgba-v1-sharp${sharp.versions.sharp}`;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const assetUrl = relative => '/' + relative.split(path.sep).map(encodeURIComponent).join('/');

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

async function decodedPixels(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, hash: sha256(data) };
}

function samePixels(a, b) {
  return a.width === b.width && a.height === b.height && a.channels === b.channels && a.hash === b.hash;
}

/** Replace only deployment PNG copies with smaller, pixel-identical WebP assets. */
export async function optimizeSitesImages({ clientDirectory, cacheDirectory }) {
  if (!clientDirectory || !cacheDirectory) throw new Error('clientDirectory and cacheDirectory are required');
  const client = path.resolve(clientDirectory);
  const cache = path.resolve(cacheDirectory);
  if (cache === client || cache.startsWith(client + path.sep)) {
    throw new Error('Image cache must be outside the deployment client directory');
  }
  await mkdir(cache, { recursive: true });
  const files = await pngFiles(client);
  const started = Date.now();
  const indexEntries = [];
  const skippedFiles = [];
  let originalBytes = 0;
  let optimizedBytes = 0;
  let cacheHits = 0;
  let next = 0;

  async function optimize(file) {
    const relative = path.relative(client, file);
    if (/^(?:og|favicon[^/]*|apple-touch-icon[^/]*|web-app-manifest[^/]*)\.png$/i.test(relative)) {
      skippedFiles.push({ path: assetUrl(relative), reason: 'Preserve social preview and icon MIME types' });
      return;
    }
    const source = await readFile(file);
    const metadata = await sharp(source).metadata();
    if (metadata.width > maxWebpDimension || metadata.height > maxWebpDimension) {
      skippedFiles.push({ path: assetUrl(relative), reason: 'WebP dimension limit' });
      return;
    }
    if (metadata.depth !== 'uchar' || (metadata.pages ?? 1) !== 1) {
      skippedFiles.push({ path: assetUrl(relative), reason: 'Unsupported bit depth or animation' });
      return;
    }

    const cacheKey = sha256(Buffer.concat([Buffer.from(encodingVersion + '\0'), source]));
    const cachedFile = path.join(cache, cacheKey + '.webp');
    let encoded;
    try {
      encoded = await readFile(cachedFile);
      cacheHits++;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      encoded = await sharp(source).keepMetadata().webp({ lossless: true, effort: 4 }).toBuffer();
      const temporary = cachedFile + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, encoded);
      await rename(temporary, cachedFile);
    }

    if (encoded.length >= source.length) {
      skippedFiles.push({ path: assetUrl(relative), reason: 'WebP is not smaller' });
      return;
    }
    // Recheck cached outputs too: a cache entry cannot bypass pixel verification.
    const before = await decodedPixels(source);
    const after = await decodedPixels(encoded);
    if (!samePixels(before, after)) {
      skippedFiles.push({ path: assetUrl(relative), reason: 'Decoded pixels differ' });
      return;
    }

    const targetRelative = path.join('.optimized-images', relative.replace(/\.png$/i, '.webp'));
    const target = path.join(client, targetRelative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(cachedFile, target);
    if ((await stat(target)).size !== encoded.length) throw new Error('Incomplete optimized image: ' + relative);
    await rm(file);
    originalBytes += source.length;
    optimizedBytes += encoded.length;
    indexEntries.push([assetUrl(relative), assetUrl(targetRelative)]);
  }

  // Two images at once keeps large source slides and decoded RGBA buffers bounded.
  await Promise.all(Array.from({ length: Math.min(2, files.length) }, async () => {
    while (next < files.length) await optimize(files[next++]);
  }));

  return {
    index: Object.fromEntries(indexEntries.sort(([a], [b]) => a.localeCompare(b))),
    savedBytes: originalBytes - optimizedBytes,
    count: indexEntries.length,
    originalBytes,
    optimizedBytes,
    processedCount: files.length,
    cacheHits,
    skippedFiles: skippedFiles.sort((a, b) => a.path.localeCompare(b.path)),
    seconds: (Date.now() - started) / 1000,
  };
}
