import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Compute SHA-256 hash of a string.
 * @param {string} content
 * @returns {string} Hex-encoded hash
 */
export function computeHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate a safe filename from an absolute file path.
 * @param {string} filePath
 * @returns {string}
 */
function cacheKey(filePath) {
  return computeHash(filePath) + '.json';
}

/**
 * Load all cached state from disk.
 * @param {string} cacheDir - Absolute path to cache directory
 * @returns {{ dag: object|null, entries: { [filePath]: { sourceHash, signature, compiledJs, importEdges } } }}
 */
export function loadCache(cacheDir) {
  const result = { dag: null, entries: {} };
  if (!cacheDir || !fs.existsSync(cacheDir)) return result;

  const dagPath = path.join(cacheDir, '_dag.json');
  if (fs.existsSync(dagPath)) {
    try {
      result.dag = JSON.parse(fs.readFileSync(dagPath, 'utf-8'));
    } catch {}
  }

  for (const file of fs.readdirSync(cacheDir)) {
    if (file === '_dag.json' || !file.endsWith('.json')) continue;
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf-8'));
      if (entry.filePath) {
        result.entries[entry.filePath] = entry;
      }
    } catch {}
  }

  return result;
}

/**
 * Persist build state + compiled JS to disk cache.
 * @param {string} cacheDir - Absolute path to cache directory
 * @param {import('./state.mjs').BuildState} buildState
 * @param {Map<string, string>} compiledJsMap - filePath → compiled JS (only for affected files)
 * @param {Map<string, string[]>} importEdgesMap - filePath → raw import source strings
 */
export function persistState(cacheDir, buildState, compiledJsMap, importEdgesMap) {
  if (!cacheDir) return;
  fs.mkdirSync(cacheDir, { recursive: true });

  fs.writeFileSync(
    path.join(cacheDir, '_dag.json'),
    JSON.stringify(buildState.dag.serialize()),
    'utf-8'
  );

  for (const filePath of buildState.allFiles()) {
    const key = cacheKey(filePath);
    const cachePath = path.join(cacheDir, key);

    let existingCompiledJs = null;
    if (!compiledJsMap.has(filePath) && fs.existsSync(cachePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        existingCompiledJs = existing.compiledJs || null;
      } catch {}
    }

    const entry = {
      filePath,
      sourceHash: buildState.sourceHashes.get(filePath) || null,
      signature: buildState.signatures.get(filePath) || null,
      compiledJs: compiledJsMap.get(filePath) ?? existingCompiledJs,
      importEdges: importEdgesMap.get(filePath) || []
    };

    fs.writeFileSync(cachePath, JSON.stringify(entry), 'utf-8');
  }

  cleanupDeletedEntries(cacheDir, buildState);
}

/**
 * Remove cache entries for files no longer in the build state.
 */
function cleanupDeletedEntries(cacheDir, buildState) {
  const knownFiles = new Set(buildState.allFiles());
  for (const file of fs.readdirSync(cacheDir)) {
    if (file === '_dag.json' || !file.endsWith('.json')) continue;
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf-8'));
      if (entry.filePath && !knownFiles.has(entry.filePath)) {
        fs.unlinkSync(path.join(cacheDir, file));
      }
    } catch {}
  }
}

/**
 * Load cached compiled JS for a specific file.
 * Used when the consumer needs JS for an unchanged file on cold start.
 * @param {string} cacheDir
 * @param {string} filePath
 * @returns {string|null}
 */
export function loadCachedJs(cacheDir, filePath) {
  if (!cacheDir) return null;
  const key = cacheKey(filePath);
  const cachePath = path.join(cacheDir, key);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const entry = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    return entry.compiledJs || null;
  } catch {
    return null;
  }
}
