import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'dist/client');
const data = JSON.parse(readFileSync(path.join(root, 'content/content-data.json'), 'utf8'));
const worker = await import(pathToFileURL(path.join(root, 'dist/server/index.js')).href);
const paths = new Set();
function collect(value) {
  if (typeof value === 'string' && /^\/(?:assets|projects)\//.test(value)) paths.add(new URL(value, 'https://portfolio.test').pathname);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(data.projects);
collect(data.tiles);
collect(data.posters);
for (const url of paths) {
  if (worker.mediaIndex[url]) {
    for (const chunk of worker.mediaIndex[url].chunks) assert.ok(existsSync(path.join(client, decodeURIComponent(chunk.path))), 'Missing video chunk: ' + chunk.path);
  } else {
    const target = worker.imageIndex[url] ?? url;
    assert.ok(existsSync(path.join(client, decodeURIComponent(target))), 'Missing current project asset: ' + url);
  }
}
assert.ok(existsSync(path.join(client, 'resume.html')));
assert.ok(existsSync(path.join(client, 'resume-site/assets/pdf-preview/sips-render-edited.png')));
assert.ok(existsSync(path.join(client, 'resume-site/assets/Dragonlee.pdf')));
console.log('Verified ' + paths.size + ' current project asset URLs, ' + data.projects.length + ' projects, ' + data.tiles.length + ' Work cards and the complete resume.');
