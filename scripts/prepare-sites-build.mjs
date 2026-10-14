#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSourceVideoIndex } from "./source-video-chunks.mjs";
import { optimizeSitesImages } from "./optimize-sites-images.mjs";
import { pruneSitesUnusedMedia } from "./prune-sites-unused-media.mjs";
import { pruneSitesDeadAssetBindings } from "./prune-sites-dead-asset-bindings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");
const hosting = path.join(root, ".openai", "hosting.json");
const client = path.join(dist, "client");
const staticAssetLimit = 25 * 1024 * 1024;
const chunkSize = 8 * 1024 * 1024;
const indexMarker = "/* SITES_MEDIA_INDEX */ {}";
const imageMarker = "/* SITES_IMAGE_INDEX */ {}";

for (const file of [index, worker, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });

function* filesIn(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesIn(file);
    else if (entry.isFile()) yield file;
  }
}

function assetUrl(file) {
  return "/" + path.relative(client, file).split(path.sep).map(encodeURIComponent).join("/");
}

const mediaIndex = {};
const deadAssets = pruneSitesDeadAssetBindings({ root, clientDirectory: client });
const transformedScriptHashes = Object.fromEntries(deadAssets.changedFiles.map(relative => [relative, createHash('sha256').update(readFileSync(path.join(client, relative))).digest('hex')]));
const unusedMedia = pruneSitesUnusedMedia({ root, clientDirectory: client });
console.log("Preparing lossless deployment images; removed " + unusedMedia.removedFiles.length + " unused historical media files");
const images = await optimizeSitesImages({ clientDirectory: client, cacheDirectory: path.join(root, ".sites-image-cache") });
// Only the build copy changes; public keeps the original videos byte for byte.
for (const file of [...filesIn(client)]) {
  const size = statSync(file).size;
  if (path.extname(file).toLowerCase() !== ".mp4" || size <= staticAssetLimit) continue;

  const directory = path.join(client, ".media-chunks", path.relative(client, file) + ".parts");
  mkdirSync(directory, { recursive: true });
  const buffer = Buffer.allocUnsafe(chunkSize);
  const hash = createHash("sha256");
  const chunks = [];
  const descriptor = openSync(file, "r");
  try {
    let offset = 0;
    while (offset < size) {
      const length = readSync(descriptor, buffer, 0, Math.min(chunkSize, size - offset), offset);
      if (length === 0) throw new Error("Unexpected end of video: " + file);
      const bytes = buffer.subarray(0, length);
      const chunkFile = path.join(directory, String(chunks.length).padStart(6, "0") + ".bin");
      writeFileSync(chunkFile, bytes);
      hash.update(bytes);
      chunks.push({ path: assetUrl(chunkFile), size: length });
      offset += length;
    }
  } finally {
    closeSync(descriptor);
  }

  mediaIndex[assetUrl(file)] = {
    size,
    contentType: "video/mp4",
    etag: '"' + hash.digest("hex") + '"',
    chunks,
  };
  rmSync(file);
}

const hostedIndex = buildSourceVideoIndex({ contentDirectory: path.join(root, "content"), clientDirectory: client });
for (const [url, video] of Object.entries(hostedIndex)) {
  if (mediaIndex[url] && (mediaIndex[url].size !== video.size || mediaIndex[url].etag !== video.etag)) {
    throw new Error("Source-video manifest does not match original: " + url);
  }
  mediaIndex[url] = video;
}

const workerSource = readFileSync(worker, "utf8");
if (!workerSource.includes(indexMarker) || !workerSource.includes(imageMarker)) throw new Error("Missing media/image index marker in Sites worker");
writeFileSync(
  path.join(dist, "server", "index.js"),
  workerSource.replace(indexMarker, () => JSON.stringify(mediaIndex)).replace(imageMarker, () => JSON.stringify(images.index)),
);
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));
writeFileSync(path.join(dist, ".openai", "media-optimization.json"), JSON.stringify({ deadAssets, transformedScriptHashes, unusedMedia, images }, null, 2) + "\n");

console.log(
  "Prepared Sites build: dist/server/index.js and dist/.openai/hosting.json; " +
    Object.keys(mediaIndex).length + " large video(s) split into static chunks; " + images.count + " lossless images saved " + images.savedBytes + " bytes",
);
