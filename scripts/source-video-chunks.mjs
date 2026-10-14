import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const sourceVideoLimit = 25 * 1024 * 1024;
export const sourceVideoChunkSize = 8 * 1024 * 1024;
const manifestName = 'source-video-chunks.json';
const sourceDirectory = '.source-video-chunks';

function* filesIn(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesIn(filename);
    else if (entry.isFile()) yield filename;
    else throw new Error('Source media must contain only regular files and directories.');
  }
}

function urlFor(relative) {
  return '/' + relative.split(path.sep).map(encodeURIComponent).join('/');
}

function fileForUrl(directory, url, prefix) {
  if (typeof url !== 'string' || !url.startsWith(prefix)) throw new Error('Invalid source-video chunk URL.');
  let relative;
  try { relative = decodeURIComponent(url.slice(1)); } catch { throw new Error('Invalid source-video URL encoding.'); }
  const file = path.resolve(directory, relative);
  if (!file.startsWith(path.resolve(directory) + path.sep) || relative.split(/[\\/]/).includes('..') || relative.includes('\0')) throw new Error('Invalid source-video path.');
  return file;
}

// Run only on the hosted source copy. Local public originals remain untouched.
export function prepareSourceVideoChunks({ publicDirectory, contentDirectory, limit = sourceVideoLimit, chunkSize = sourceVideoChunkSize }) {
  if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize > sourceVideoChunkSize) throw new Error('Invalid source-video chunk size.');
  const previousManifest = path.join(contentDirectory, manifestName);
  if (existsSync(previousManifest)) {
    const previous = JSON.parse(readFileSync(previousManifest, 'utf8'));
    for (const url of Object.keys(previous.videos ?? {})) {
      if (!existsSync(fileForUrl(publicDirectory, url, '/'))) throw new Error('Regenerate hosted chunks from the complete canonical originals.');
    }
  }
  const videos = {};
  const originals = [];
  const chunksRoot = path.join(publicDirectory, sourceDirectory);
  if (lstatSync(chunksRoot, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Source-video chunk directory must not be a symlink.');
  rmSync(chunksRoot, { recursive: true, force: true });
  for (const file of [...filesIn(publicDirectory)]) {
    const size = statSync(file).size;
    if (path.extname(file).toLowerCase() !== '.mp4' || size <= limit) continue;
    const relative = path.relative(publicDirectory, file);
    const directory = path.join(chunksRoot, relative + '.parts');
    mkdirSync(directory, { recursive: true });
    const descriptor = openSync(file, 'r');
    const buffer = Buffer.allocUnsafe(chunkSize);
    const hash = createHash('sha256');
    const chunks = [];
    try {
      let offset = 0;
      while (offset < size) {
        const length = readSync(descriptor, buffer, 0, Math.min(chunkSize, size - offset), offset);
        if (!length) throw new Error('Source video ended unexpectedly.');
        const bytes = buffer.subarray(0, length);
        const chunk = path.join(directory, String(chunks.length).padStart(6, '0') + '.bin');
        writeFileSync(chunk, bytes);
        hash.update(bytes);
        chunks.push({ path: urlFor(path.relative(publicDirectory, chunk)), size: length, sha256: createHash('sha256').update(bytes).digest('hex') });
        offset += length;
      }
    } finally { closeSync(descriptor); }
    const sha256 = hash.digest('hex');
    videos[urlFor(relative)] = { size, contentType: 'video/mp4', sha256, etag: '"' + sha256 + '"', chunks };
    originals.push(file);
  }
  mkdirSync(contentDirectory, { recursive: true });
  const manifest = { version: 1, chunk_size: chunkSize, videos };
  const filename = path.join(contentDirectory, manifestName);
  writeFileSync(filename + '.tmp', JSON.stringify(manifest, null, 2) + '\n');
  renameSync(filename + '.tmp', filename);
  for (const file of originals) rmSync(file);
  return manifest;
}

// Vite copies hosted source chunks into client. Verify every byte before mapping
// the original video URLs to the existing worker's range-streaming representation.
export function buildSourceVideoIndex({ contentDirectory, clientDirectory }) {
  const filename = path.join(contentDirectory, manifestName);
  if (!existsSync(filename)) return {};
  const manifest = JSON.parse(readFileSync(filename, 'utf8'));
  if (manifest.version !== 1 || !Number.isSafeInteger(manifest.chunk_size) || manifest.chunk_size <= 0 || manifest.chunk_size > sourceVideoChunkSize || !manifest.videos || Array.isArray(manifest.videos)) throw new Error('Invalid source-video manifest.');
  const index = {};
  for (const [url, video] of Object.entries(manifest.videos)) {
    fileForUrl(clientDirectory, url, '/');
    if (!url.endsWith('.mp4') || video.contentType !== 'video/mp4' || !Number.isSafeInteger(video.size) || video.size <= 0 || !/^[a-f0-9]{64}$/.test(video.sha256) || video.etag !== '"' + video.sha256 + '"' || !Array.isArray(video.chunks) || !video.chunks.length) throw new Error('Invalid source-video entry.');
    const hash = createHash('sha256');
    const chunks = [];
    let total = 0;
    for (const [number, chunk] of video.chunks.entries()) {
      const source = fileForUrl(clientDirectory, chunk.path, '/.source-video-chunks/');
      if (!lstatSync(source).isFile() || !Number.isSafeInteger(chunk.size) || chunk.size <= 0 || chunk.size > manifest.chunk_size || statSync(source).size !== chunk.size) throw new Error('Invalid source-video chunk size.');
      const bytes = readFileSync(source);
      if (createHash('sha256').update(bytes).digest('hex') !== chunk.sha256) throw new Error('Source-video chunk checksum mismatch.');
      hash.update(bytes); total += bytes.length;
      const relative = decodeURIComponent(url.slice(1));
      const destination = path.join(clientDirectory, '.media-chunks', relative + '.parts', String(number).padStart(6, '0') + '.bin');
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
      chunks.push({ path: urlFor(path.relative(clientDirectory, destination)), size: bytes.length });
    }
    if (total !== video.size || hash.digest('hex') !== video.sha256) throw new Error('Complete source-video checksum mismatch.');
    index[url] = { size: video.size, contentType: video.contentType, etag: video.etag, chunks };
  }
  rmSync(path.join(clientDirectory, sourceDirectory), { recursive: true, force: true });
  return index;
}
