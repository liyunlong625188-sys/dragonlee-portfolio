import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mediaExtension = /\.(?:png|jpe?g|webp|gif|mp4)$/i;
const temporaryVideo = /\.mp4\.sb-[^/]+$/i;
const servedText = /\.(?:m?js|cjs|css|html?|svg|json)$/i;
const userMetadata = ['content-data.json', 'editable-content.json', 'user-media.json', 'source-media-map.json', 'dribbble-selection.json', 'video-playback.json', 'source-video-chunks.json'];

function* filesIn(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesIn(file);
    else if (entry.isFile()) yield file;
    else throw new Error('Sites build must contain only regular files and directories.');
  }
}

function literalStrings(value, output) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) for (const child of value) literalStrings(child, output);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    output.push(key);
    literalStrings(child, output);
  }
}

function escaped(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function referenced(texts, relative) {
  const basename = path.basename(relative);
  const variants = new Set([basename, encodeURIComponent(basename), relative, '/' + relative, relative.split('/').map(encodeURIComponent).join('/')]);
  for (const value of variants) {
    // Basename boundaries avoid treating one hashed filename as part of another.
    const expression = new RegExp('(?:^|[^A-Za-z0-9_.%+\\-])' + escaped(value) + '(?:$|[^A-Za-z0-9_.%+\\-])');
    if (texts.some(text => expression.test(text))) return true;
  }
  return false;
}

/** Prune build copies only; source media and every current user project are kept. */
export function pruneSitesUnusedMedia({ root, clientDirectory }) {
  root = path.resolve(root);
  clientDirectory = path.resolve(clientDirectory);
  if (clientDirectory === path.join(root, 'public') || clientDirectory.startsWith(path.join(root, 'public') + path.sep)) throw new Error('Never prune canonical public source media.');
  if (!lstatSync(clientDirectory).isDirectory() || lstatSync(clientDirectory).isSymbolicLink()) throw new Error('Sites client output must be a regular directory.');
  const capture = JSON.parse(readFileSync(path.join(root, 'content/capture-manifest.json'), 'utf8'));
  const candidates = new Set();
  for (const asset of Object.values(capture.assets ?? {})) {
    const relative = String(asset.path ?? '').replace(/^\/+/, '');
    if (relative.startsWith('assets/') && !relative.split('/').includes('..') && mediaExtension.test(relative)) candidates.add(relative);
  }
  // Interrupted-download .sb files are not runtime videos and may be outside
  // the original capture ledger. Still retain them if explicitly referenced.
  for (const file of filesIn(path.join(clientDirectory, 'assets'))) {
    const relative = path.relative(clientDirectory, file).split(path.sep).join('/');
    if (temporaryVideo.test(relative)) candidates.add(relative);
  }
  const texts = [];
  for (const name of userMetadata) {
    const file = path.join(root, 'content', name);
    if (existsSync(file)) literalStrings(JSON.parse(readFileSync(file, 'utf8')), texts);
  }
  for (const file of filesIn(clientDirectory)) if (servedText.test(file)) texts.push(readFileSync(file, 'utf8'));
  const removedFiles = [];
  let savedBytes = 0;
  for (const relative of [...candidates].sort()) {
    const file = path.resolve(clientDirectory, relative);
    if (!file.startsWith(clientDirectory + path.sep) || !existsSync(file)) continue;
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error('Captured build media must be a regular file.');
    if (referenced(texts, relative)) continue;
    savedBytes += statSync(file).size;
    rmSync(file);
    removedFiles.push(relative);
  }
  return { removedFiles, savedBytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = pruneSitesUnusedMedia({ root, clientDirectory: path.resolve(process.argv[2] ?? path.join(root, 'dist/client')) });
  console.log(JSON.stringify(result));
}
