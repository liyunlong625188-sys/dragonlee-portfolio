import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { buildSourceVideoIndex } from './source-video-chunks.mjs';

const traverse = traverseModule.default ?? traverseModule;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function normalizeBasePath(value = '/dragonlee-portfolio/') {
  const segments = String(value).split('/').filter(Boolean);
  if (segments.some(segment => segment === '.' || segment === '..' || !/^[A-Za-z0-9._~-]+$/.test(segment))) {
    throw new Error('GitHub Pages base path must contain only URL-safe path segments.');
  }
  return segments.length ? '/' + segments.join('/') + '/' : '/';
}

function prefixUrl(value, base, entries) {
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  const first = value.slice(1).split(/[/?#]/)[0];
  return entries.has(first) ? base.slice(0, -1) + value : value;
}

export function rewriteScriptUrls(source, base, entries) {
  const edits = [];
  function replacement(nodePath, value) {
    let next = prefixUrl(value, base, entries);
    if (value === '/') {
      const parent = nodePath.parent;
      const homeLink = parent.type === 'ObjectProperty' && parent.value === nodePath.node && (parent.key.name ?? parent.key.value) === 'href';
      const preloadRoot = parent.type === 'BinaryExpression' && parent.operator === '+' && parent.left === nodePath.node && parent.right.type === 'Identifier' && nodePath.parentPath.parent.type === 'ReturnStatement';
      if (homeLink || preloadRoot) next = base;
    }
    if (next !== value) edits.push({ start: nodePath.node.start, end: nodePath.node.end, text: JSON.stringify(next) });
  }
  traverse(parse(source, { sourceType: 'unambiguous' }), {
    StringLiteral(nodePath) { replacement(nodePath, nodePath.node.value); },
    TemplateLiteral(nodePath) {
      if (!nodePath.node.expressions.length) {
        replacement(nodePath, nodePath.node.quasis[0].value.cooked ?? '');
        nodePath.skip();
      } else {
        const first = nodePath.node.quasis[0];
        const value = first.value.cooked ?? '';
        if (prefixUrl(value, base, entries) !== value) {
          edits.push({ start: first.start, end: first.end, text: base.slice(0, -1) + first.value.raw });
        }
      }
    },
  });
  for (const edit of edits.sort((first, second) => second.start - first.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

export function rewriteTextUrls(source, base, entries) {
  return source.replace(/(["'(])(\/(?!\/)[^"'()\s<>]*)/g, (match, before, value) => before + prefixUrl(value, base, entries));
}

function* filesIn(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesIn(file);
    else if (entry.isFile()) yield file;
    else throw new Error('GitHub Pages output must contain only regular files and directories.');
  }
}

export function prepareGithubPagesOutput({ clientDirectory, contentDirectory, base = '/dragonlee-portfolio/', pageUrl }) {
  base = normalizeBasePath(base);
  const sourceVideos = buildSourceVideoIndex({ contentDirectory, clientDirectory });
  for (const [url, video] of Object.entries(sourceVideos)) {
    const destination = path.join(clientDirectory, decodeURIComponent(url.slice(1)));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, Buffer.concat(video.chunks.map(chunk => readFileSync(path.join(clientDirectory, decodeURIComponent(chunk.path.slice(1)))))));
  }
  rmSync(path.join(clientDirectory, '.media-chunks'), { recursive: true, force: true });

  const entries = new Set(readdirSync(clientDirectory));
  let rewritten = 0;
  let bytes = 0;
  for (const file of filesIn(clientDirectory)) {
    if (path.basename(file) === '.DS_Store' || /\.sb-/.test(path.basename(file))) {
      rmSync(file);
      continue;
    }
    const extension = path.extname(file).toLowerCase();
    if (/\.(?:m?js|cjs|css|html?|svg|json)$/.test(extension)) {
      const source = readFileSync(file, 'utf8');
      let result = /\.(?:m?js|cjs)$/.test(extension) ? rewriteScriptUrls(source, base, entries) : rewriteTextUrls(source, base, entries);
      if (path.basename(file) === 'manifest.json') {
        const manifest = JSON.parse(result);
        manifest.start_url = base;
        manifest.scope = base;
        result = JSON.stringify(manifest, null, 2) + '\n';
      }
      if (file === path.join(clientDirectory, 'index.html') && pageUrl) {
        const siteUrl = new URL(pageUrl);
        if (siteUrl.protocol !== 'https:') throw new Error('GitHub Pages URL must use HTTPS.');
        siteUrl.pathname = base;
        result = result.replace(/(<meta property="og:url" content=")[^"]*(")/, (match, before, after) => before + siteUrl.href + after);
        result = result.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")([^\"]+)(")/g, (match, before, value, after) => before + new URL(value, siteUrl).href + after);
      }
      if (result !== source) {
        writeFileSync(file, result);
        rewritten++;
      }
    }
    bytes += readFileSync(file).length;
  }
  copyFileSync(path.join(clientDirectory, 'index.html'), path.join(clientDirectory, '404.html'));
  writeFileSync(path.join(clientDirectory, '.nojekyll'), '');
  if (bytes + readFileSync(path.join(clientDirectory, '404.html')).length >= 1024 * 1024 * 1024) {
    throw new Error('GitHub Pages output exceeds the 1 GiB site limit.');
  }
  return { base, rewritten, restoredVideos: Object.keys(sourceVideos).length, bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = normalizeBasePath(process.env.GITHUB_PAGES_BASE_PATH ?? '/dragonlee-portfolio/');
  const clientDirectory = path.join(root, 'dist/github');
  const { build } = await import('vite');
  await build({ root, base, build: { outDir: clientDirectory, emptyOutDir: true } });
  if (!existsSync(path.join(clientDirectory, 'index.html'))) throw new Error('GitHub Pages build has no index.html.');
  const result = prepareGithubPagesOutput({ clientDirectory, contentDirectory: path.join(root, 'content'), base, pageUrl: process.env.GITHUB_PAGES_URL });
  console.log('Prepared GitHub Pages output: ' + JSON.stringify(result));
}
