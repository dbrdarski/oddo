import path from 'path';

/**
 * Resolve a relative .oddo import path to an absolute file path.
 * @param {string} importSource - The import source string (e.g., './auth.oddo')
 * @param {string} importerPath - Absolute path of the importing file
 * @returns {string} Absolute path to the imported file
 */
export function resolveImport(importSource, importerPath) {
  return path.resolve(path.dirname(importerPath), importSource);
}
