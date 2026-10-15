import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { shouldCopySourceFile } from '../scripts/source-checkout-files.mjs';

test('source mirror excludes only byte-identical numbered source copies and preserves public files', context => {
  const directory = mkdtempSync(path.join(tmpdir(), 'dragonlee-source-checkout-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourceDirectory = path.join(directory, 'source');
  const destination = path.join(directory, 'mirror');
  for (const folder of ['src', 'tests', 'public']) mkdirSync(path.join(sourceDirectory, folder), { recursive: true });
  const files = {
    'src/main.jsx': 'application',
    'src/main 4.jsx': 'application',
    'src/main 10.jsx': 'application',
    'src/main 3.jsx': 'replacement',
    'src/main 1.jsx': 'application',
    'src/unique 4.jsx': 'unique',
    'tests/worker.test.mjs': 'test body',
    'tests/worker.test 4.mjs': 'test body',
    'public/cover.png': 'image bytes',
    'public/cover 4.png': 'image bytes',
    'src/.DS_Store': 'finder state',
  };
  for (const [relative, contents] of Object.entries(files)) writeFileSync(path.join(sourceDirectory, relative), contents);
  symlinkSync('main.jsx', path.join(sourceDirectory, 'src/main 2.jsx'));
  cpSync(sourceDirectory, destination, {
    recursive: true,
    filter: filename => shouldCopySourceFile(filename, sourceDirectory),
  });
  for (const relative of ['src/main 4.jsx', 'src/main 10.jsx', 'tests/worker.test 4.mjs', 'src/.DS_Store']) {
    assert.equal(existsSync(path.join(destination, relative)), false);
    assert.equal(existsSync(path.join(sourceDirectory, relative)), true);
  }
  for (const relative of ['src/main.jsx', 'src/main 3.jsx', 'src/main 1.jsx', 'src/unique 4.jsx', 'tests/worker.test.mjs', 'public/cover.png', 'public/cover 4.png', 'src/main 2.jsx']) {
    assert.equal(existsSync(path.join(destination, relative)), true);
    assert.equal(readFileSync(path.join(destination, relative), 'utf8'), readFileSync(path.join(sourceDirectory, relative), 'utf8'));
  }
});
