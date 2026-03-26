import { DAG } from './dag.mjs';

/**
 * In-memory build state — the sole source of truth during execution.
 * Initialized from cache on startup (or empty). Updated by the pipeline.
 * Persisted to disk after each pipeline run (excluding ASTs).
 */
export class BuildState {
  constructor() {
    this.dag = new DAG();
    this.signatures = new Map();
    this.sourceHashes = new Map();
    this.asts = new Map();
  }

  /**
   * Initialize state from cached data.
   * ASTs are NOT restored from cache — they are populated on first parse.
   * @param {object} cached - { dag: serialized DAG, entries: { [filePath]: { sourceHash, signature, importEdges } } }
   */
  initFromCache(cached) {
    if (cached.dag) {
      this.dag = DAG.deserialize(cached.dag);
    }
    if (cached.entries) {
      for (const [filePath, entry] of Object.entries(cached.entries)) {
        this.sourceHashes.set(filePath, entry.sourceHash);
        this.signatures.set(filePath, entry.signature);
      }
    }
  }

  /** Get all known file paths */
  allFiles() {
    return this.dag.allFiles();
  }

  /** Remove a file from all state maps */
  removeFile(filePath) {
    this.dag.removeFile(filePath);
    this.signatures.delete(filePath);
    this.sourceHashes.delete(filePath);
    this.asts.delete(filePath);
  }
}
