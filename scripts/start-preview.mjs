import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = path.join(root, '.preview');
const url = 'http://127.0.0.1:4174/';
mkdirSync(state, { recursive: true });
try {
  const pid = Number(readFileSync(path.join(state, 'preview.pid'), 'utf8'));
  process.kill(pid, 0);
  const response = await fetch(url);
  if (response.ok) {
    console.log(`Preview remains available at ${url} (PID ${pid})`);
    process.exit(0);
  }
} catch {}

const log = openSync(path.join(state, 'preview.log'), 'a');
const child = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'), 'preview',
  '--host', '127.0.0.1', '--port', '4174', '--strictPort',
], {
  cwd: root, detached: true, stdio: ['ignore', log, log],
  env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` },
});
child.unref();
writeFileSync(path.join(state, 'preview.pid'), String(child.pid));
for (let attempt = 0; attempt < 80; attempt++) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      console.log(`Preview ready at ${url} (PID ${child.pid}); log: .preview/preview.log`);
      process.exit(0);
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
}
throw new Error('Preview did not start; inspect .preview/preview.log.');
