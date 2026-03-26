import fs from 'fs';
import path from 'path';
import { BuildState } from './state.mjs';
import { loadCache, persistState, loadCachedJs } from './cache.mjs';
import { scanAndDiff } from './scanner.mjs';
import { runPipeline } from './pipeline.mjs';

/**
 * Create a build context for a source directory.
 * @param {{ srcDir: string, cacheDir?: string, runtimeLibrary?: string }} options
 * @returns {BuildContext}
 */
export function createBuildContext(options) {
  const { srcDir, cacheDir, runtimeLibrary = '@oddo/ui' } = options;

  if (!srcDir) throw new Error('srcDir is required');

  const state = new BuildState();
  let initialized = false;
  let pipelineLock = null;

  function init() {
    if (initialized) return;
    if (cacheDir) {
      const cached = loadCache(cacheDir);
      state.initFromCache(cached);
    }
    initialized = true;
  }

  /**
   * Run a full build: scan, diff, pipeline.
   * @returns {{ results: Map<string, { filePath, js }>, affected: Map<string, { js, signature }> }}
   */
  async function build() {
    init();
    const diff = scanAndDiff(srcDir, state);
    const pipelineResult = runPipeline(diff, state, { runtimeLibrary });

    // Persist to disk cache
    if (cacheDir) {
      persistState(cacheDir, state, mapJs(pipelineResult.affected), pipelineResult.importEdgesMap);
    }

    // Build final results: all files with their JS
    const results = new Map();
    for (const [filePath, info] of pipelineResult.allFiles) {
      let js = info.js;
      if (js === null && cacheDir) {
        js = loadCachedJs(cacheDir, filePath);
      }
      if (js !== null) {
        results.set(filePath, { filePath, js });
      }
    }

    // Clear ASTs to free memory after build completes
    state.asts.clear();

    return { results, affected: pipelineResult.affected };
  }

  /**
   * Process an incremental update (e.g., from a file watcher).
   * @param {{ new?: string[], deleted?: string[], updated?: string[] }} diff
   * @returns {{ results: Map<string, { filePath, js }>, affected: Map<string, { js, signature }> }}
   */
  async function update(diff) {
    init();
    const pipelineResult = runPipeline(
      { new: diff.new || [], deleted: diff.deleted || [], updated: diff.updated || [] },
      state,
      { runtimeLibrary }
    );

    if (cacheDir) {
      persistState(cacheDir, state, mapJs(pipelineResult.affected), pipelineResult.importEdgesMap);
    }

    const results = new Map();
    for (const [filePath, info] of pipelineResult.affected) {
      results.set(filePath, { filePath, js: info.js });
    }

    state.asts.clear();

    return { results, affected: pipelineResult.affected };
  }

  /**
   * Create a file watcher with debouncing and serialization.
   * @param {{ onChange?: (results) => void, debounceMs?: number }} watchOptions
   * @returns {{ close: () => void }}
   */
  function createWatcher(watchOptions = {}) {
    const { onChange, debounceMs = 150 } = watchOptions;
    let pendingChanges = { new: new Set(), deleted: new Set(), updated: new Set() };
    let debounceTimer = null;
    let running = false;

    const watchers = [];
    watchDir(srcDir, watchers, (eventType, filePath) => {
      if (!filePath.endsWith('.oddo')) return;

      if (!fs.existsSync(filePath)) {
        pendingChanges.deleted.add(filePath);
        pendingChanges.new.delete(filePath);
        pendingChanges.updated.delete(filePath);
      } else if (state.sourceHashes.has(filePath)) {
        pendingChanges.updated.add(filePath);
        pendingChanges.deleted.delete(filePath);
      } else {
        pendingChanges.new.add(filePath);
        pendingChanges.deleted.delete(filePath);
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => flush(), debounceMs);
    });

    async function flush() {
      if (running) {
        debounceTimer = setTimeout(() => flush(), debounceMs);
        return;
      }

      const diff = {
        new: [...pendingChanges.new],
        deleted: [...pendingChanges.deleted],
        updated: [...pendingChanges.updated]
      };
      pendingChanges = { new: new Set(), deleted: new Set(), updated: new Set() };

      if (diff.new.length === 0 && diff.deleted.length === 0 && diff.updated.length === 0) return;

      running = true;
      try {
        const results = await update(diff);
        onChange?.(results);
      } catch (err) {
        console.error('[oddo-build] Pipeline error:', err.message);
      } finally {
        running = false;
      }
    }

    return {
      close() {
        if (debounceTimer) clearTimeout(debounceTimer);
        for (const w of watchers) w.close();
      }
    };
  }

  return { build, update, createWatcher, state };
}

function watchDir(dir, watchers, callback) {
  if (!fs.existsSync(dir)) return;
  try {
    const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const filePath = path.resolve(dir, filename);
      callback(eventType, filePath);
    });
    watchers.push(watcher);
  } catch {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        watchDir(path.join(dir, entry.name), watchers, callback);
      }
    }
  }
}

function mapJs(affected) {
  const map = new Map();
  for (const [filePath, info] of affected) {
    map.set(filePath, info.js);
  }
  return map;
}
