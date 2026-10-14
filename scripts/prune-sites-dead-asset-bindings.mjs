import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default ?? traverseModule;
const localMedia = /^\/assets\/[^?#]+\.(?:png|jpe?g|webp|gif|avif|mp4|webm)(?:[?#].*)?$/i;
const localAsset = /^\/assets\/[^?#]+\.(?:png|jpe?g|webp|gif|avif|svg|mp4|webm)(?:[?#].*)?$/i;
const capturedModule = /^index-CtCmjgre(?: 2)?\.js$/;
const currentMetadata = ['content-data.json', 'editable-content.json', 'user-media.json', 'source-media-map.json', 'dribbble-selection.json', 'video-playback.json', 'source-video-chunks.json'];
const servedText = /\.(?:m?js|cjs|css|html?|svg|json)$/i;

function staticString(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) return node.quasis[0].value.cooked;
  return null;
}

function* builtScripts(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Sites build scripts must not be symbolic links.');
    if (entry.isDirectory()) yield* builtScripts(file);
    else if (entry.isFile() && /\.(?:m?js|cjs)$/i.test(entry.name)) yield file;
  }
}

function* servedFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Sites build must not contain symbolic links.');
    if (entry.isDirectory()) yield* servedFiles(file);
    else if (entry.isFile()) yield file;
  }
}

function assetPath(value) {
  if (typeof value !== 'string') return null;
  const absolute = value.startsWith('assets/') ? '/' + value : value;
  if (!localAsset.test(absolute) || absolute.split(/[/?#]/).includes('..')) return null;
  return absolute.split(/[?#]/)[0];
}

function currentAssetProtection(root, clientDirectory) {
  if (!root || !existsSync(path.join(root, 'content/content-data.json'))) return null;
  const requiredAssets = new Set();
  const visit = value => {
    if (typeof value === 'string') { const url = assetPath(value); if (url) requiredAssets.add(url); else if (/^data:image\//i.test(value)) requiredAssets.add(value); }
    else if (Array.isArray(value)) for (const child of value) visit(child);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { visit(key); visit(child); }
  };
  for (const name of currentMetadata) {
    const file = path.join(root, 'content', name);
    if (existsSync(file)) visit(JSON.parse(readFileSync(file, 'utf8')));
  }
  const externalTexts = [];
  for (const file of servedFiles(clientDirectory)) {
    if (servedText.test(file) && !capturedModule.test(path.basename(file))) externalTexts.push(readFileSync(file, 'utf8'));
  }
  return { requiredAssets, externalTexts };
}

function immutableBinding(scope, name) {
  const binding = scope.getBinding(name);
  return binding && binding.constant && !binding.constantViolations.length ? binding : null;
}

function resolvedStatic(node, scope, seen = new Set()) {
  const string = staticString(node);
  if (typeof string === 'string') return string;
  if (node?.type === 'NumericLiteral') return node.value;
  if (node?.type !== 'Identifier' || seen.has(node.name)) return undefined;
  const binding = immutableBinding(scope, node.name);
  if (!binding || !binding.path.isVariableDeclarator()) return undefined;
  const next = new Set(seen); next.add(node.name);
  return resolvedStatic(binding.path.node.init, binding.path.scope, next);
}

function pureRegistryValue(node, scope) {
  if (node?.type === 'ArrayExpression') return node.elements.length > 0 && node.elements.every(child => child && pureRegistryValue(child, scope));
  const value = resolvedStatic(node, scope);
  return typeof value === 'number' || (typeof value === 'string' && (assetPath(value) || /^data:image\//i.test(value) || /^#[0-9a-f]{3,8}$/i.test(value)));
}

function capturedMapValue(name, node, scope) {
  if (name === 'Ma') return /^#[0-9a-f]{3,8}$/i.test(String(resolvedStatic(node, scope)));
  if (name === 'Na') {
    const value = resolvedStatic(node, scope);
    return Boolean(assetPath(value)) || (typeof value === 'string' && /^data:image\//i.test(value));
  }
  if (name !== 'Fn' || node?.type !== 'ArrayExpression' || !node.elements.length) return false;
  return node.elements.every(pair => pair?.type === 'ArrayExpression' && pair.elements.length === 2 && pureRegistryValue(pair.elements[0], scope) && typeof resolvedStatic(pair.elements[1], scope) === 'number');
}

function childRemovalEdits(node, children, remove) {
  if (remove.every(Boolean)) return [{ start: node.start + 1, end: node.end - 1, replacement: '' }];
  const edits = [];
  for (let index = 0; index < remove.length;) {
    if (!remove[index]) { index++; continue; }
    const first = index;
    while (index < remove.length && remove[index]) index++;
    if (index < remove.length) edits.push({ start: children[first].start, end: children[index].start, replacement: '' });
    else edits.push({ start: children[first - 1].end, end: children[index - 1].end, replacement: '' });
  }
  return edits;
}

function applyEdits(source, edits) {
  let updated = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
  parse(updated, { sourceType: 'unambiguous' });
  return updated;
}

function knownMediaRead(node) {
  if (node?.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') return false;
  if (node.object.type === 'Identifier') return ['src', 'video', 'image'].includes(node.property.name);
  return node.property.name === 'imagepath' && node.object.type === 'MemberExpression' && !node.object.computed && node.object.object.type === 'ThisExpression' && node.object.property.name === 'props';
}

function readOnlyMap(binding, protection) {
  if (!binding || !binding.constant || binding.constantViolations.length || !binding.referencePaths.length) return false;
  for (const reference of binding.referencePaths) {
    const member = reference.parentPath;
    if (!member.isMemberExpression() || member.node.object !== reference.node || member.node.computed || !['get', 'has'].includes(member.node.property.name)) return false;
    const call = member.parentPath;
    if (!call.isCallExpression() || call.node.callee !== member.node || call.node.arguments.length !== 1) return false;
    const argument = call.node.arguments[0];
    const literal = assetPath(resolvedStatic(argument, call.scope));
    if (literal) protection.requiredAssets.add(literal);
    else if (!knownMediaRead(argument)) return false;
  }
  return true;
}

function readOnlyPosterObject(binding) {
  if (!binding || !binding.constant || binding.constantViolations.length) return null;
  const requiredKeys = new Set();
  for (const reference of binding.referencePaths) {
    const member = reference.parentPath;
    if (!member.isMemberExpression() || member.node.object !== reference.node || !member.node.computed) return null;
    const key = staticString(member.node.property);
    if (typeof key === 'string') { requiredKeys.add(key); continue; }
    // The captured legacy Pl resolver is dead after current project arrays were
    // replaced. Preserve any resolver that still has callers or is exported.
    const arrow = member.parentPath;
    const declaration = arrow.parentPath;
    if (!arrow.isArrowFunctionExpression() || arrow.node.body !== member.node || !declaration.isVariableDeclarator() || declaration.node.id.type !== 'Identifier') return null;
    const wrapper = immutableBinding(declaration.scope, declaration.node.id.name);
    if (!wrapper || wrapper.referenced || wrapper.path.node !== declaration.node || declaration.parentPath.parentPath.isExportNamedDeclaration()) return null;
  }
  return requiredKeys;
}

function specializeCapturedRegistries(source, protection) {
  const ast = parse(source, { sourceType: 'unambiguous' });
  if (ast.program.sourceType !== 'module') return { source, registries: [] };
  let directEval = false;
  traverse(ast, { CallExpression(p) { if (p.node.callee.type === 'Identifier' && p.node.callee.name === 'eval' && !p.scope.getBinding('eval')) directEval = true; } });
  if (directEval) return { source, registries: [] };
  const edits = [];
  const registries = [];
  const externallyRequired = url => {
    if (/^data:image\//i.test(url)) return protection.requiredAssets.has(url) || protection.externalTexts.some(text => text.includes(url));
    if (/\.svg$/i.test(url)) return true;
    const normalized = assetPath(url);
    if (!normalized) return true;
    if (protection.requiredAssets.has(normalized)) return true;
    const basename = path.posix.basename(normalized);
    return protection.externalTexts.some(text => text.includes(normalized) || text.includes(basename) || text.includes(encodeURIComponent(basename)));
  };
  traverse(ast, {
    VariableDeclarator(p) {
      if (p.node.id.type !== 'Identifier' || !p.scope.path.isProgram() || p.parentPath.parentPath.isExportNamedDeclaration()) return;
      const binding = immutableBinding(p.scope, p.node.id.name);
      if (!binding || binding.path.node !== p.node) return;
      const init = p.node.init;
      let container, entries, remove;
      if (init?.type === 'NewExpression' && init.callee.type === 'Identifier' && init.callee.name === 'Map' && !p.scope.getBinding('Map') && init.arguments.length === 1 && init.arguments[0].type === 'ArrayExpression') {
        if (!['Ma', 'Na', 'Fn'].includes(p.node.id.name)) return;
        container = init.arguments[0]; entries = container.elements;
        if (!entries.length || !entries.every(entry => entry?.type === 'ArrayExpression' && entry.elements.length === 2 && assetPath(resolvedStatic(entry.elements[0], p.scope)) && capturedMapValue(p.node.id.name, entry.elements[1], p.scope)) || !readOnlyMap(binding, protection)) return;
        remove = entries.map(entry => !externallyRequired(resolvedStatic(entry.elements[0], p.scope)));
      } else if (init?.type === 'CallExpression' && init.callee.type === 'MemberExpression' && !init.callee.computed && init.callee.object.name === 'Object' && init.callee.property.name === 'assign' && !p.scope.getBinding('Object') && init.arguments.length === 1 && init.arguments[0].type === 'ObjectExpression') {
        if (p.node.id.name !== 'Nl') return;
        container = init.arguments[0]; entries = container.properties;
        const requiredKeys = readOnlyPosterObject(binding);
        if (!entries.length || !requiredKeys || !entries.every(entry => entry.type === 'ObjectProperty' && !entry.computed && staticString(entry.key)?.startsWith('./img/') && capturedMapValue('Na', entry.value, p.scope))) return;
        remove = entries.map(entry => !requiredKeys.has(staticString(entry.key)) && !externallyRequired(resolvedStatic(entry.value, p.scope)));
      } else return;
      const removedEntries = remove.filter(Boolean).length;
      if (!removedEntries) return;
      edits.push(...childRemovalEdits(container, entries, remove));
      registries.push({ binding: p.node.id.name, removedEntries, retainedEntries: entries.length - removedEntries });
    },
  });
  return { source: applyEdits(source, edits), registries };
}

/** Remove side-effect-free dead media aliases from a deployment copy only. */
export function pruneSitesDeadAssetBindings({ root, clientDirectory }) {
  clientDirectory = path.resolve(clientDirectory);
  if (clientDirectory.split(path.sep).includes('public')) throw new Error('Never prune canonical public source scripts.');
  if (!lstatSync(clientDirectory).isDirectory() || lstatSync(clientDirectory).isSymbolicLink()) throw new Error('Sites client output must be a regular directory.');
  const assets = path.join(clientDirectory, 'assets');
  const protection = currentAssetProtection(root && path.resolve(root), clientDirectory);
  const result = { removedBindings: 0, removedRegistryEntries: 0, specializedRegistries: [], savedBytes: 0, changedFiles: [], removedAssetPaths: [] };
  const removedAssets = new Set();
  for (const file of builtScripts(assets)) {
    const original = readFileSync(file, 'utf8');
    let source = original;
    if (protection && capturedModule.test(path.basename(file))) {
      const specialized = specializeCapturedRegistries(source, protection);
      source = specialized.source;
      for (const registry of specialized.registries) {
        result.removedRegistryEntries += registry.removedEntries;
        result.specializedRegistries.push({ file: path.relative(clientDirectory, file).split(path.sep).join('/'), ...registry });
      }
    }
    const ast = parse(source, { sourceType: 'unambiguous' });
    const evalScopes = new Set();
    // A direct eval can refer to a binding that ordinary AST references miss.
    traverse(ast, {
      CallExpression(p) {
        if (p.node.callee.type !== 'Identifier' || p.node.callee.name !== 'eval' || p.scope.getBinding('eval')) return;
        for (let scope = p.scope; scope; scope = scope.parent) evalScopes.add(scope);
      },
    });
    const edits = [];
    let removedBindings = 0;
    traverse(ast, {
      VariableDeclaration(p) {
        if (p.parentPath.isExportNamedDeclaration() || p.parentPath.isExportDefaultDeclaration()) return;
        const declarations = p.node.declarations;
        const remove = declarations.map(declaration => {
          if (declaration.id.type !== 'Identifier') return false;
          const value = staticString(declaration.init);
          if (typeof value !== 'string' || !localMedia.test(value) || value.split(/[/?#]/).includes('..')) return false;
          const binding = p.scope.getBinding(declaration.id.name);
          if (!binding || binding.path.node !== declaration || binding.referenced || !binding.constant || binding.constantViolations.length || evalScopes.has(binding.scope)) return false;
          // Classic scripts can expose top-level bindings to another script or
          // through globalThis even when this file has no lexical references.
          if (ast.program.sourceType === 'script' && binding.scope.path.isProgram()) return false;
          removedAssets.add(value);
          return true;
        });
        const count = remove.filter(Boolean).length;
        if (!count) return;
        removedBindings += count;
        if (count === declarations.length) {
          const isForInitializer = p.parentPath.isForStatement() && p.key === 'init';
          edits.push({ start: p.node.start, end: p.node.end, replacement: isForInitializer ? '' : ';' });
          return;
        }
        for (let index = 0; index < remove.length;) {
          if (!remove[index]) { index++; continue; }
          const first = index;
          while (index < remove.length && remove[index]) index++;
          if (index < remove.length) {
            // Consume the following comma while preserving the previous one.
            edits.push({ start: declarations[first].start, end: declarations[index].start, replacement: '' });
          } else {
            // A final run consumes its preceding comma instead.
            edits.push({ start: declarations[first - 1].end, end: declarations[index - 1].end, replacement: '' });
          }
        }
      },
    });
    if (!edits.length && source === original) continue;
    const updated = applyEdits(source, edits);
    writeFileSync(file, updated);
    result.removedBindings += removedBindings;
    result.savedBytes += Buffer.byteLength(original) - Buffer.byteLength(updated);
    result.changedFiles.push(path.relative(clientDirectory, file).split(path.sep).join('/'));
  }
  result.removedAssetPaths = [...removedAssets].sort();
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  console.log(JSON.stringify(pruneSitesDeadAssetBindings({ root, clientDirectory: path.resolve(process.argv[2] ?? path.join(root, 'dist/client')) })));
}
