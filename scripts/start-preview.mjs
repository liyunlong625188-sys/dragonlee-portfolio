import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = path.join(root, '.preview');
const url = 'http://127.0.0.1:4174/';
const pidPath = path.join(state, 'preview.pid');
let lastFailure = 'No response from preview';

async function previewIsReady() {
  try {
    for (const [resource, expectedType] of [['', 'text/html'], ['assets/index-CtCmjgre.js', 'javascript']]) {
      const response = await fetch(url + resource, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.includes(expectedType)) {
        lastFailure = `${resource || '/'}: HTTP ${response.status}, content-type ${type}`;
        return false;
      }
    }
    return true;
  } catch (error) {
    lastFailure = error.cause?.message || error.message;
    return false;
  }
}

mkdirSync(state, { recursive: true });
try {
  const pid = Number(readFileSync(pidPath, 'utf8'));
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid saved preview PID');
  process.kill(pid, 0);
  if (await previewIsReady()) {
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
let spawnError;
child.on('error', error => { spawnError = error; });
child.unref();
const deadline = Date.now() + 8000;
while (Date.now() < deadline) {
  if (spawnError) throw new Error(`Preview process could not start: ${spawnError.message}`);
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`Preview process exited (${child.exitCode ?? child.signalCode}); inspect .preview/preview.log.`);
  }
  if (await previewIsReady()) {
    if (spawnError || child.exitCode !== null || child.signalCode !== null) continue;
    writeFileSync(pidPath, String(child.pid));
    console.log(`Preview ready at ${url} (PID ${child.pid}); log: .preview/preview.log`);
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}
throw new Error(`Preview did not become ready: ${lastFailure}; inspect .preview/preview.log.`);
