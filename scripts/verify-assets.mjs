import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'content/capture-manifest.json'), 'utf8'));
const excluded = new Set(manifest.excluded_from_visual_runtime);
const overrides = JSON.parse(readFileSync(path.join(root, 'content/runtime-overrides.json'), 'utf8'));
const locations = ['public'];
if (existsSync(path.join(root, 'dist/client/index.html'))) locations.push('dist/client');
let verified = 0;
for (const [source, record] of Object.entries(manifest.assets)) {
  if (source === '/' || excluded.has(source)) continue;
  for (const location of locations) {
    let data = readFileSync(path.join(root, location, record.path));
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
console.log(`Verified ${verified} source assets with recorded content overrides in ${locations.join(' and ')}; developer modules excluded.`);
