import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSourceVideoChunks } from './source-video-chunks.mjs';
import { shouldCopySourceFile } from './source-checkout-files.mjs';

// Only this website's source is mirrored; Git history and local runtime state stay in place.
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (path.basename(source) !== 'dragonlee-portfolio' || path.basename(path.dirname(source)) === 'sites') {
  throw new Error('Run this synchronization script from the active dragonlee-portfolio project, not from the hosted mirror.');
}
const destination = path.resolve(source, '../sites/dragonlee-portfolio');
const manifest = JSON.parse(readFileSync(path.join(source, '.openai/hosting.json'), 'utf8'));
if (!manifest.project_id) throw new Error('Register this website with Sites before synchronizing its source.');
if (lstatSync(destination, { throwIfNoEntry: false })?.isSymbolicLink()) {
  throw new Error('The hosted source directory must not be a symlink.');
}
const destinationManifest = path.join(destination, '.openai/hosting.json');
if (existsSync(destinationManifest)) {
  const current = JSON.parse(readFileSync(destinationManifest, 'utf8'));
  if (current.project_id && current.project_id !== manifest.project_id) {
    throw new Error('The hosted checkout belongs to another Site; preserve it and resolve the mismatch.');
  }
}
mkdirSync(destination, { recursive: true });
const entries = ['.github', '.gitignore', 'AGENTS.md', 'README.md', 'content', 'index.html', 'package-lock.json', 'package.json', 'public', 'scripts', 'src', 'tests', 'vite.config.mjs', 'worker', 'wrangler.jsonc'];
for (const name of entries) {
  const target = path.join(destination, name);
  rmSync(target, { recursive: true, force: true });
  const sourcePath = path.join(source, name);
  if (name === '.github' && !existsSync(sourcePath)) continue;
  cpSync(sourcePath, target, {
    recursive: true,
    filter: (filename) => shouldCopySourceFile(filename, source),
  });
}
mkdirSync(path.dirname(destinationManifest), { recursive: true });
cpSync(path.join(source, '.openai/hosting.json'), destinationManifest);
const chunkManifest = prepareSourceVideoChunks({
  publicDirectory: path.join(destination, 'public'),
  contentDirectory: path.join(destination, 'content'),
});
const dependencies = path.join(destination, 'node_modules');
if (!lstatSync(dependencies, { throwIfNoEntry: false }) && existsSync(path.join(source, 'node_modules'))) {
  symlinkSync(path.join(source, 'node_modules'), dependencies, 'dir');
}
console.log(JSON.stringify({ project_id: manifest.project_id, checkout_path: destination, source_directory: source, chunked_source_videos: Object.keys(chunkManifest.videos).length }));
