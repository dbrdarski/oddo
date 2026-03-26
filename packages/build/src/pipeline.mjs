import fs from 'fs';
import { parseOddo, extractSignature, extractImportEdges, compileOddoToJS } from '../../lang/src/index.mjs';
import { resolveImport } from './resolver.mjs';
import { computeHash } from './cache.mjs';

/**
 * Unified build pipeline. Processes a diff of file changes against the current
 * in-memory BuildState. Handles new, deleted, and updated files identically.
 *
 * @param {{ new: string[], deleted: string[], updated: string[] }} diff
 * @param {import('./state.mjs').BuildState} state - Mutated in place
 * @param {{ runtimeLibrary: string }} config
 * @returns {{ affected: Map<string, { js: string, signature: object }>, allFiles: Map<string, { js: string|null, signature: object }> }}
 *   affected: only files that were recompiled
 *   allFiles: all files — recompiled ones have js, unchanged ones have js: null (load from cache)
 */
export function runPipeline(diff, state, config) {
  const { runtimeLibrary = '@oddo/ui' } = config;

  // Step 1: Remove deleted files
  for (const filePath of diff.deleted) {
    state.removeFile(filePath);
  }

  // Step 2: Parse new + updated files (stages 1-4)
  const rawImportEdges = new Map();
  for (const filePath of [...diff.new, ...diff.updated]) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const sourceHash = computeHash(source);
    const ast = parseOddo(source);
    const edges = extractImportEdges(ast);

    state.sourceHashes.set(filePath, sourceHash);
    state.asts.set(filePath, ast);
    rawImportEdges.set(filePath, edges);
  }

  // Step 3: Update DAG
  for (const filePath of diff.updated) {
    const resolvedDeps = (rawImportEdges.get(filePath) || []).map(e => resolveImport(e, filePath));
    state.dag.updateFile(filePath, resolvedDeps);
  }
  for (const filePath of diff.new) {
    const resolvedDeps = (rawImportEdges.get(filePath) || []).map(e => resolveImport(e, filePath));
    state.dag.addFile(filePath, resolvedDeps);
  }

  const cycle = state.dag.hasCycle();
  if (cycle) {
    throw new Error(`Circular dependency detected: ${cycle.join(' → ')}`);
  }

  // Step 4: Determine affected set
  const affected = new Set([...diff.new, ...diff.updated]);
  for (const filePath of [...diff.new, ...diff.updated]) {
    for (const downstream of state.dag.getDownstream(filePath)) {
      affected.add(downstream);
    }
  }

  // Step 5: Compile affected set in topological order
  const affectedOrder = state.dag.topologicalOrder(affected);
  const compiledResults = new Map();
  const allImportEdges = new Map();

  // Preserve existing raw import edges for files we already know about
  for (const filePath of state.dag.allFiles()) {
    if (!rawImportEdges.has(filePath)) {
      const deps = state.dag.dependencies.get(filePath);
      if (deps) {
        allImportEdges.set(filePath, [...deps]);
      }
    }
  }
  for (const [fp, edges] of rawImportEdges) {
    allImportEdges.set(fp, edges);
  }

  for (const filePath of affectedOrder) {
    // Ensure we have an AST (may need to parse for cascade-affected files)
    if (!state.asts.has(filePath)) {
      const source = fs.readFileSync(filePath, 'utf-8');
      state.sourceHashes.set(filePath, computeHash(source));
      const ast = parseOddo(source);
      state.asts.set(filePath, ast);
      const edges = extractImportEdges(ast);
      rawImportEdges.set(filePath, edges);
      const resolvedDeps = edges.map(e => resolveImport(e, filePath));
      state.dag.updateFile(filePath, resolvedDeps);
      allImportEdges.set(filePath, edges);
    }

    // Build importSignatures map for this file
    const importSigs = buildImportSignatures(filePath, state);

    // Extract signature (stage 5 only) to check for cascade
    const ast = state.asts.get(filePath);
    const newSignature = extractSignature(ast, { importSignatures: importSigs });
    const oldSignature = state.signatures.get(filePath);
    const sigChanged = !signaturesEqual(oldSignature, newSignature);

    // Full compile (stages 5-10)
    const source = fs.readFileSync(filePath, 'utf-8');
    const js = compileOddoToJS(source, { runtimeLibrary, importSignatures: importSigs });

    state.signatures.set(filePath, newSignature);
    compiledResults.set(filePath, { js, signature: newSignature });

    // Cascade: if signature changed, add downstream dependents to affected set
    if (sigChanged && oldSignature !== undefined) {
      for (const downstream of state.dag.getDownstream(filePath)) {
        if (!affected.has(downstream)) {
          affected.add(downstream);
          // Insert into affectedOrder at the right position (will be picked up later in the loop)
          // Since we're iterating in topo order and downstream is after current, it's safe
          if (!affectedOrder.includes(downstream)) {
            affectedOrder.push(downstream);
          }
        }
      }
    }
  }

  // Step 6: Build result maps
  const allFiles = new Map();
  for (const filePath of state.dag.allFiles()) {
    if (compiledResults.has(filePath)) {
      allFiles.set(filePath, compiledResults.get(filePath));
    } else {
      allFiles.set(filePath, { js: null, signature: state.signatures.get(filePath) || null });
    }
  }

  return { affected: compiledResults, allFiles, importEdgesMap: allImportEdges };
}

/**
 * Build the importSignatures config for a given file based on current state.
 * Maps each .oddo import source to its signature in the state.
 */
function buildImportSignatures(filePath, state) {
  const sigs = {};
  const ast = state.asts.get(filePath);
  if (!ast) return sigs;

  for (const stmt of ast.body) {
    if (stmt.type === 'importStatement' && stmt.source?.endsWith('.oddo')) {
      const resolvedPath = resolveImport(stmt.source, filePath);
      const sig = state.signatures.get(resolvedPath);
      if (sig) {
        sigs[stmt.source] = sig;
      }
    }
  }
  return sigs;
}

/**
 * Deep-compare two signatures for equality.
 */
function signaturesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
