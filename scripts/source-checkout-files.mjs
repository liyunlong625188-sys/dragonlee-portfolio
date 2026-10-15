import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function shouldCopySourceFile(filename, sourceDirectory) {
  const basename = path.basename(filename);
  if (basename === '.DS_Store') return false;
  if (path.relative(sourceDirectory, filename).split(path.sep)[0] === 'public') return true;
  const duplicate = basename.match(/^(.*) ([1-9]\d*)(\.[^.]+)$/);
  if (!duplicate || Number(duplicate[2]) < 2) return true;
  const canonical = path.join(path.dirname(filename), duplicate[1] + duplicate[3]);
  const duplicateStat = lstatSync(filename, { throwIfNoEntry: false });
  const canonicalStat = lstatSync(canonical, { throwIfNoEntry: false });
  if (!duplicateStat?.isFile() || !canonicalStat?.isFile() || duplicateStat.size !== canonicalStat.size) return true;
  return !readFileSync(filename).equals(readFileSync(canonical));
}
