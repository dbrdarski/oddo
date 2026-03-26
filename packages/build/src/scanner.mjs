import fs from 'fs';
import path from 'path';
import { computeHash } from './cache.mjs';

/**
 * Scan a source directory for .oddo files and diff against in-memory build state.
 * @param {string} srcDir - Absolute path to source directory
 * @param {import('./state.mjs').BuildState} buildState - Current in-memory state
 * @returns {{ new: string[], deleted: string[], updated: string[] }}
 */
export function scanAndDiff(srcDir, buildState) {
  const onDisk = new Map();
  scanDir(srcDir, onDisk);

  const knownFiles = new Set(buildState.allFiles());
  const result = { new: [], deleted: [], updated: [] };

  for (const [filePath, sourceHash] of onDisk) {
    if (!knownFiles.has(filePath)) {
      result.new.push(filePath);
    } else if (buildState.sourceHashes.get(filePath) !== sourceHash) {
      result.updated.push(filePath);
    }
  }

  for (const filePath of knownFiles) {
    if (!onDisk.has(filePath)) {
      result.deleted.push(filePath);
    }
  }

  return result;
}

/**
 * Recursively scan directory for .oddo files, computing source hashes.
 * @param {string} dir
 * @param {Map<string, string>} results - Map of filePath → sourceHash
 */
function scanDir(dir, results) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.oddo')) {
      const source = fs.readFileSync(fullPath, 'utf-8');
      results.set(fullPath, computeHash(source));
    }
  }
}
