import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectImageEncoding } from './optimize-sites-images.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'content/capture-manifest.json'), 'utf8'));
const excluded = new Set(manifest.excluded_from_visual_runtime);
const overrides = JSON.parse(readFileSync(path.join(root, 'content/runtime-overrides.json'), 'utf8'));
const locations = ['public'];
if (existsSync(path.join(root, 'dist/client/index.html'))) locations.push('dist/client');
const builtWorker = path.join(root, 'dist/server/index.js');
const worker = locations.includes('dist/client') && existsSync(builtWorker)
  ? await import(pathToFileURL(builtWorker).href) : {};
const optimizationFile = path.join(root, 'dist/.openai/media-optimization.json');
const optimization = locations.includes('dist/client') && existsSync(optimizationFile)
  ? JSON.parse(readFileSync(optimizationFile, 'utf8')) : {};
const sourceVideoFile = path.join(root, 'content/source-video-chunks.json');
const sourceVideos = existsSync(sourceVideoFile)
  ? JSON.parse(readFileSync(sourceVideoFile, 'utf8')).videos ?? {} : {};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function relativeFromUrl(url) {
  assert.equal(typeof url, 'string', 'Asset URL must be a string');
  const parsed = new URL(url, 'https://asset-verification.invalid/');
  assert.equal(parsed.origin, 'https://asset-verification.invalid', 'Asset URL must be local');
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  assert.ok(relative && !relative.includes('\0') && !relative.split(/[\\/]/).includes('..'), 'Unsafe asset path: ' + url);
  return relative;
}

function fileForUrl(location, url) {
  const directory = path.resolve(root, location);
  const file = path.resolve(directory, relativeFromUrl(url));
  assert.ok(file.startsWith(directory + path.sep), 'Asset escaped its directory: ' + url);
  return file;
}

function assetUrl(relative) {
  return '/' + relative.split(path.sep).map(encodeURIComponent).join('/');
}

// URL keys may contain encoded spaces and query strings; requests match pathname.
function urlMap(index = {}) {
  return new Map(Object.entries(index).map(([url, entry]) => [assetUrl(relativeFromUrl(url)), entry]));
}

const mediaIndex = urlMap(worker.mediaIndex);
const imageIndex = urlMap(worker.imageIndex);
const sourceVideoIndex = urlMap(sourceVideos);
const removedFiles = new Set((optimization.unusedMedia?.removedFiles ?? []).map(file => relativeFromUrl('/' + file)));
const transformedScripts = optimization.transformedScriptHashes ?? {};
const imagePolicyFile = path.join(root, 'content/sites-image-policy.json');
const imagePolicy = existsSync(imagePolicyFile) ? JSON.parse(readFileSync(imagePolicyFile, 'utf8')) : { mode: 'lossless' };
const imageMode = optimization.images?.mode ?? 'lossless';
if (locations.includes('dist/client')) assert.equal(imageMode, imagePolicy.mode, 'Built image encoding policy differs from source');
const imageRecords = new Map((optimization.images?.records ?? []).map(record => [record.sourceUrl, record]));

function videoBytes(location, url, video) {
  assert.ok(Number.isSafeInteger(video.size) && video.size > 0, 'Invalid video size: ' + url);
  assert.ok(Array.isArray(video.chunks) && video.chunks.length, 'Missing video chunks: ' + url);
  const chunks = video.chunks.map(chunk => {
    const bytes = readFileSync(fileForUrl(location, chunk.path));
    assert.equal(bytes.length, chunk.size, 'Video chunk size differs: ' + chunk.path);
    if (chunk.sha256) assert.equal(hash(bytes), chunk.sha256, 'Video chunk checksum differs: ' + chunk.path);
    return bytes;
  });
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, video.size, 'Complete video size differs: ' + url);
  const checksum = hash(bytes);
  if (video.sha256) assert.equal(checksum, video.sha256, 'Complete video checksum differs: ' + url);
  assert.equal(video.etag, '"' + checksum + '"', 'Video ETag differs: ' + url);
  return bytes;
}

function publicBytes(relative) {
  const url = assetUrl(relative);
  const file = fileForUrl('public', url);
  if (existsSync(file)) return readFileSync(file);
  assert.ok(sourceVideoIndex.has(url), 'Missing public source asset: ' + relative);
  return videoBytes('public', url, sourceVideoIndex.get(url));
}

// Hosted source chunks are a byte-preserving representation of canonical videos.
for (const [url, video] of sourceVideoIndex) videoBytes('public', url, video);
if (locations.includes('dist/client')) {
  for (const [url, video] of mediaIndex) {
    assert.equal(hash(videoBytes('dist/client', url, video)), hash(publicBytes(relativeFromUrl(url))), 'Built video differs from public original: ' + url);
  }
  for (const [url, optimizedUrl] of imageIndex) {
    const source = publicBytes(relativeFromUrl(url));
    const optimized = readFileSync(fileForUrl('dist/client', optimizedUrl));
    const result = await inspectImageEncoding(source, optimized, { mode: imageMode });
    assert.equal(result.acceptable, true, 'Optimized image fails encoding policy: ' + url);
    if (imageMode === 'high-quality') {
      const record = imageRecords.get(url);
      assert.ok(record, 'Missing image encoding evidence: ' + url);
      assert.equal(record.deployedUrl, optimizedUrl, 'Image encoding target differs: ' + url);
      assert.equal(record.sourceSHA256, hash(source), 'Image source checksum differs: ' + url);
      assert.equal(record.optimizedSHA256, hash(optimized), 'Image build checksum differs: ' + url);
      if (record.codec === 'webp-lossless') assert.equal(result.pixelIdentical, true, 'Lossless fallback pixels differ: ' + url);
      else assert.equal(record.codec, 'webp-lossy', 'Unknown image encoding: ' + url);
    }
  }
}

let verified = 0;
for (const [source, record] of Object.entries(manifest.assets)) {
  if (source === '/' || excluded.has(source)) continue;
  for (const location of locations) {
    const url = assetUrl(record.path);
    let data;
    if (location === 'public') data = publicBytes(record.path);
    else if (removedFiles.has(record.path)) {
      assert.equal(existsSync(fileForUrl(location, url)), false, 'Recorded removed asset is still present: ' + record.path);
      continue;
    } else if (imageIndex.has(url)) {
      // Every mapped image was checked against the encoding policy above. The public
      // iteration still checks the original capture checksum and overrides.
      continue;
    } else if (mediaIndex.has(url)) data = videoBytes(location, url, mediaIndex.get(url));
    else data = readFileSync(fileForUrl(location, url));
    if (location === 'dist/client' && /\.m?js$/i.test(record.path) && Object.hasOwn(transformedScripts, record.path)) {
      assert.match(transformedScripts[record.path], /^[a-f0-9]{64}$/, 'Invalid transformed script checksum: ' + record.path);
      assert.equal(hash(data), transformedScripts[record.path], 'Transformed script checksum differs: ' + record.path);
      continue;
    }
    for (const override of [...(overrides[record.path] || [])].reverse()) {
      const text = data.toString('utf8');
      assert.equal(text.split(override.after).length - 1, override.count || 1, `${location}/${record.path}: expected content override missing`);
      data = Buffer.from(text.replaceAll(override.after, override.before));
    }
    assert.equal(data.length, record.bytes, `${location}/${record.path}: size differs`);
    assert.equal(createHash('sha256').update(data).digest('hex'), record.sha256, `${location}/${record.path}: source differs`);
  }
  verified++;
}
for (const source of excluded) {
  for (const location of locations) {
    assert.equal(existsSync(path.join(root, location, manifest.assets[source].path)), false, `Developer module included: ${source}`);
  }
}
const bootstrap = readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
assert.match(bootstrap, /@vite-ignore/);
assert.doesNotMatch(bootstrap, /createRoot|styles\.css|React\.StrictMode/);
assert.match(readFileSync(path.join(root, 'index.html'), 'utf8'), /\/assets\/index-C_PdSvtp\.css/);
console.log(`Verified ${verified} source assets with recorded content overrides in ${locations.join(' and ')}; ${imageIndex.size} ${imageMode} image mappings and ${mediaIndex.size} chunked video mappings verified; developer modules excluded.`);
