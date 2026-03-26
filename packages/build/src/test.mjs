/**
 * Test suite for @oddo/build — DAG, signatures, pipeline, cache
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { DAG } from './dag.mjs';
import { computeHash, loadCache, persistState, loadCachedJs } from './cache.mjs';
import { BuildState } from './state.mjs';
import { resolveImport } from './resolver.mjs';
import { scanAndDiff } from './scanner.mjs';
import { runPipeline } from './pipeline.mjs';
import { createBuildContext } from './index.mjs';
import { parseOddo, extractSignature, extractImportEdges } from '../../lang/src/index.mjs';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    testsFailed++;
    failures.push({ name, error: error.message });
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

async function testAsync(name, fn) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    testsFailed++;
    failures.push({ name, error: error.message });
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oddo-build-test-'));
}

function cleanup(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// DAG Tests
// ---------------------------------------------------------------------------
console.log('\n--- DAG: Basic Operations ---');

test('DAG: addFile and allFiles', () => {
  const dag = new DAG();
  dag.addFile('/a.oddo', ['/b.oddo']);
  dag.addFile('/b.oddo', []);
  const files = dag.allFiles();
  assert(files.includes('/a.oddo'));
  assert(files.includes('/b.oddo'));
});

test('DAG: getDownstream returns dependents', () => {
  const dag = new DAG();
  dag.addFile('/a.oddo', []);
  dag.addFile('/b.oddo', ['/a.oddo']);
  dag.addFile('/c.oddo', ['/b.oddo']);
  const ds = dag.getDownstream('/a.oddo');
  assert(ds.has('/b.oddo'));
  assert(ds.has('/c.oddo'));
});

test('DAG: topologicalOrder returns correct order', () => {
  const dag = new DAG();
  dag.addFile('/a.oddo', []);
  dag.addFile('/b.oddo', ['/a.oddo']);
  dag.addFile('/c.oddo', ['/b.oddo']);
  const order = dag.topologicalOrder();
  assert(order.indexOf('/a.oddo') < order.indexOf('/b.oddo'));
  assert(order.indexOf('/b.oddo') < order.indexOf('/c.oddo'));
});

test('DAG: cycle detection', () => {
  const dag = new DAG();
  dag.addFile('/a.oddo', ['/b.oddo']);
  dag.addFile('/b.oddo', ['/a.oddo']);
  const cycle = dag.hasCycle();
  assert(cycle !== null, 'Should detect cycle');
});

test('DAG: removeFile cleans up edges', () => {
  const dag = new DAG();
  dag.addFile('/a.oddo', []);
  dag.addFile('/b.oddo', ['/a.oddo']);
  dag.removeFile('/b.oddo');
  assert(!dag.allFiles().includes('/b.oddo'));
  const ds = dag.getDownstream('/a.oddo');
  assert(!ds.has('/b.oddo'));
});

test('DAG: updateFile changes edges', () => {
  const dag = new DAG();
  dag.addFile('/a.oddo', []);
  dag.addFile('/b.oddo', []);
  dag.addFile('/c.oddo', ['/a.oddo']);
  dag.updateFile('/c.oddo', ['/b.oddo']);
  const dsA = dag.getDownstream('/a.oddo');
  assert(!dsA.has('/c.oddo'), 'c should no longer depend on a');
  const dsB = dag.getDownstream('/b.oddo');
  assert(dsB.has('/c.oddo'), 'c should now depend on b');
});

test('DAG: serialize and deserialize', () => {
  const dag = new DAG();
  dag.addFile('/a.oddo', []);
  dag.addFile('/b.oddo', ['/a.oddo']);
  const data = dag.serialize();
  const dag2 = DAG.deserialize(data);
  const ds = dag2.getDownstream('/a.oddo');
  assert(ds.has('/b.oddo'));
  assertEqual(dag2.allFiles().sort(), ['/a.oddo', '/b.oddo']);
});

test('DAG: topologicalOrder with subset', () => {
  const dag = new DAG();
  dag.addFile('/a.oddo', []);
  dag.addFile('/b.oddo', ['/a.oddo']);
  dag.addFile('/c.oddo', ['/b.oddo']);
  const subset = new Set(['/a.oddo', '/c.oddo']);
  const order = dag.topologicalOrder(subset);
  assertEqual(order.length, 2);
  assert(order.indexOf('/a.oddo') < order.indexOf('/c.oddo'));
});

// ---------------------------------------------------------------------------
// Resolver Tests
// ---------------------------------------------------------------------------
console.log('\n--- Resolver ---');

test('resolveImport resolves relative path', () => {
  const result = resolveImport('./auth.oddo', '/project/src/app.oddo');
  assert(result === '/project/src/auth.oddo');
});

test('resolveImport resolves parent path', () => {
  const result = resolveImport('../shared/hooks.oddo', '/project/src/pages/app.oddo');
  assert(result === '/project/src/shared/hooks.oddo' || result === path.resolve('/project/src/shared/hooks.oddo'));
});

// ---------------------------------------------------------------------------
// Signature Extraction Tests
// ---------------------------------------------------------------------------
console.log('\n--- Signature Extraction ---');

test('extractSignature: exports reactive computed', () => {
  const ast = parseOddo(`
@state [count, setCount] = 0
@computed double = count * 2
export { double }
`);
  const sig = extractSignature(ast);
  assert(sig.double.reactive === true);
  assert(sig.double.type === 'computed');
});

test('extractSignature: exports composite hook', () => {
  const ast = parseOddo(`
@hook useAuth = () => {
  @state [email, setEmail] = null
  login = () => { }
  return { email, login }
}
export { useAuth }
`);
  const sig = extractSignature(ast);
  assert(sig.useAuth.composite !== null);
  assert(sig.useAuth.composite.kind === 'function');
  assert(sig.useAuth.composite.returns.members.email.reactive === true);
  assert(sig.useAuth.composite.returns.members.login.reactive === false);
});

test('extractSignature: exports nonreactive immutable', () => {
  const ast = parseOddo(`
API_URL = "https://example.com"
export { API_URL }
`);
  const sig = extractSignature(ast);
  assert(sig.API_URL.reactive === false);
  assert(sig.API_URL.type === 'immutable');
});

test('extractSignature: default export', () => {
  const ast = parseOddo(`
@state [x, setX] = 0
export default x
`);
  const sig = extractSignature(ast);
  assert(sig.default.reactive === true);
  assert(sig.default.type === 'state');
});

test('extractImportEdges: collects .oddo imports only', () => {
  const ast = parseOddo(`
import { x } from "./a.oddo"
import { y } from "react"
import z from "./b.oddo"
`);
  const edges = extractImportEdges(ast);
  assertEqual(edges, ['./a.oddo', './b.oddo']);
});

// ---------------------------------------------------------------------------
// Import Signatures in Compiler
// ---------------------------------------------------------------------------
console.log('\n--- Import Signatures Classification ---');

test('importSignatures: composite hook from .oddo import classified correctly', () => {
  const ast = parseOddo(`
import { useAuth } from "./auth.oddo"
data = useAuth()
@computed val = data.email
export { val }
`);
  const sig = extractSignature(ast, {
    importSignatures: {
      './auth.oddo': {
        useAuth: {
          type: 'hook',
          reactive: false,
          composite: {
            kind: 'function',
            returns: {
              kind: 'object',
              members: { email: { reactive: true }, login: { reactive: false } }
            }
          }
        }
      }
    }
  });
  assert(sig.val.reactive === true, 'val should be reactive (computed from reactive member)');
});

test('importSignatures: nonreactive export classified correctly', () => {
  const ast = parseOddo(`
import { API_URL } from "./config.oddo"
url = API_URL
export { url }
`);
  const sig = extractSignature(ast, {
    importSignatures: {
      './config.oddo': {
        API_URL: { type: 'immutable', reactive: false, composite: null }
      }
    }
  });
  assert(sig.url.reactive === false);
});

test('importSignatures: backward compat without signatures', () => {
  const ast = parseOddo(`
import { count } from "./counter.oddo"
@computed double = count * 2
export { double }
`);
  const sig = extractSignature(ast);
  assert(sig.double.reactive === true, 'Without signatures, .oddo imports treated as reactive');
});

// ---------------------------------------------------------------------------
// Cache Tests
// ---------------------------------------------------------------------------
console.log('\n--- Cache ---');

test('computeHash returns consistent SHA-256', () => {
  const h1 = computeHash('hello world');
  const h2 = computeHash('hello world');
  assertEqual(h1, h2);
  assert(h1.length === 64, 'SHA-256 produces 64-char hex');
});

test('computeHash differs for different inputs', () => {
  const h1 = computeHash('hello');
  const h2 = computeHash('world');
  assert(h1 !== h2);
});

test('loadCache returns empty for nonexistent dir', () => {
  const result = loadCache('/nonexistent/dir/12345');
  assertEqual(result, { dag: null, entries: {} });
});

test('persistState and loadCache roundtrip', () => {
  const tmpDir = makeTempDir();
  const cacheDir = path.join(tmpDir, '.cache');
  try {
    const state = new BuildState();
    state.dag.addFile('/a.oddo', []);
    state.sourceHashes.set('/a.oddo', 'abc123');
    state.signatures.set('/a.oddo', { count: { type: 'state', reactive: true, composite: null } });

    const compiledJsMap = new Map([['/a.oddo', 'const x = 1;']]);
    const importEdgesMap = new Map([['/a.oddo', []]]);

    persistState(cacheDir, state, compiledJsMap, importEdgesMap);

    const cached = loadCache(cacheDir);
    assert(cached.dag !== null);
    assert(cached.entries['/a.oddo'] !== undefined);
    assertEqual(cached.entries['/a.oddo'].sourceHash, 'abc123');
    assertEqual(cached.entries['/a.oddo'].compiledJs, 'const x = 1;');
  } finally {
    cleanup(tmpDir);
  }
});

test('loadCachedJs retrieves compiled JS', () => {
  const tmpDir = makeTempDir();
  const cacheDir = path.join(tmpDir, '.cache');
  try {
    const state = new BuildState();
    state.dag.addFile('/a.oddo', []);
    state.sourceHashes.set('/a.oddo', 'hash1');
    state.signatures.set('/a.oddo', {});
    const compiledJsMap = new Map([['/a.oddo', 'const y = 2;']]);
    persistState(cacheDir, state, compiledJsMap, new Map([['/a.oddo', []]]));

    const js = loadCachedJs(cacheDir, '/a.oddo');
    assertEqual(js, 'const y = 2;');
  } finally {
    cleanup(tmpDir);
  }
});

// ---------------------------------------------------------------------------
// Scanner Tests
// ---------------------------------------------------------------------------
console.log('\n--- Scanner ---');

test('scanAndDiff detects new files', () => {
  const tmpDir = makeTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.oddo'), 'x = 1', 'utf-8');
    const state = new BuildState();
    const diff = scanAndDiff(tmpDir, state);
    assertEqual(diff.new.length, 1);
    assert(diff.new[0].endsWith('a.oddo'));
    assertEqual(diff.deleted.length, 0);
    assertEqual(diff.updated.length, 0);
  } finally {
    cleanup(tmpDir);
  }
});

test('scanAndDiff detects deleted files', () => {
  const tmpDir = makeTempDir();
  try {
    const filePath = path.join(tmpDir, 'a.oddo');
    const state = new BuildState();
    state.dag.addFile(filePath, []);
    state.sourceHashes.set(filePath, 'oldhash');
    const diff = scanAndDiff(tmpDir, state);
    assertEqual(diff.deleted.length, 1);
    assertEqual(diff.new.length, 0);
  } finally {
    cleanup(tmpDir);
  }
});

test('scanAndDiff detects updated files', () => {
  const tmpDir = makeTempDir();
  try {
    const filePath = path.join(tmpDir, 'a.oddo');
    fs.writeFileSync(filePath, 'x = 2', 'utf-8');
    const state = new BuildState();
    state.dag.addFile(filePath, []);
    state.sourceHashes.set(filePath, 'stale-hash');
    const diff = scanAndDiff(tmpDir, state);
    assertEqual(diff.updated.length, 1);
    assertEqual(diff.new.length, 0);
    assertEqual(diff.deleted.length, 0);
  } finally {
    cleanup(tmpDir);
  }
});

test('scanAndDiff reports no changes for matching hashes', () => {
  const tmpDir = makeTempDir();
  try {
    const filePath = path.join(tmpDir, 'a.oddo');
    const content = 'x = 1';
    fs.writeFileSync(filePath, content, 'utf-8');
    const state = new BuildState();
    state.dag.addFile(filePath, []);
    state.sourceHashes.set(filePath, computeHash(content));
    const diff = scanAndDiff(tmpDir, state);
    assertEqual(diff.new.length, 0);
    assertEqual(diff.deleted.length, 0);
    assertEqual(diff.updated.length, 0);
  } finally {
    cleanup(tmpDir);
  }
});

// ---------------------------------------------------------------------------
// Full Pipeline Integration Tests
// ---------------------------------------------------------------------------
console.log('\n--- Pipeline Integration ---');

await testAsync('Pipeline: first build compiles all files', async () => {
  const tmpDir = makeTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.oddo'), 'x = 1\nexport { x }', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'b.oddo'), 'import { x } from "./a.oddo"\ny = x\nexport { y }', 'utf-8');
    const ctx = createBuildContext({ srcDir: tmpDir });
    const { results, affected } = await ctx.build();
    assertEqual(results.size, 2);
    assert(affected.size === 2);
    for (const [_, { js }] of results) {
      assert(js !== null && js.length > 0);
    }
  } finally {
    cleanup(tmpDir);
  }
});

await testAsync('Pipeline: signature propagation across files', async () => {
  const tmpDir = makeTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'hooks.oddo'), `
@hook useAuth = () => {
  @state [email, setEmail] = null
  login = () => { }
  return { email, login }
}
export { useAuth }
`, 'utf-8');

    fs.writeFileSync(path.join(tmpDir, 'app.oddo'), `
import { useAuth } from "./hooks.oddo"
data = useAuth()
@computed val = data.email
export { val }
`, 'utf-8');

    const ctx = createBuildContext({ srcDir: tmpDir });
    const { results } = await ctx.build();

    const appJs = results.get(path.join(tmpDir, 'app.oddo'))?.js;
    assert(appJs !== undefined, 'app.oddo should be compiled');
    assert(!appJs.includes('_lift(useAuth'), 'useAuth should NOT be _lift-wrapped (it is a composite hook, not blindly reactive)');
  } finally {
    cleanup(tmpDir);
  }
});

await testAsync('Pipeline: circular dependency throws', async () => {
  const tmpDir = makeTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.oddo'), 'import { y } from "./b.oddo"\nx = 1\nexport { x }', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'b.oddo'), 'import { x } from "./a.oddo"\ny = 1\nexport { y }', 'utf-8');
    const ctx = createBuildContext({ srcDir: tmpDir });
    let threw = false;
    try {
      await ctx.build();
    } catch (e) {
      threw = true;
      assert(e.message.includes('Circular dependency'), `Expected circular dep error, got: ${e.message}`);
    }
    assert(threw, 'Should throw on circular dependency');
  } finally {
    cleanup(tmpDir);
  }
});

await testAsync('Pipeline: incremental update recompiles affected files', async () => {
  const tmpDir = makeTempDir();
  const cacheDir = path.join(tmpDir, '.cache');
  try {
    const aPath = path.join(tmpDir, 'a.oddo');
    const bPath = path.join(tmpDir, 'b.oddo');
    fs.writeFileSync(aPath, 'x = 1\nexport { x }', 'utf-8');
    fs.writeFileSync(bPath, 'import { x } from "./a.oddo"\ny = x\nexport { y }', 'utf-8');

    const ctx = createBuildContext({ srcDir: tmpDir, cacheDir });
    await ctx.build();

    fs.writeFileSync(aPath, 'x = 2\nexport { x }', 'utf-8');
    const { results, affected } = await ctx.update({ updated: [aPath] });
    assert(affected.has(aPath), 'a.oddo should be recompiled');
    assert(affected.has(bPath), 'b.oddo should be recompiled (downstream of a)');
  } finally {
    cleanup(tmpDir);
  }
});

await testAsync('Pipeline: cache roundtrip preserves state', async () => {
  const tmpDir = makeTempDir();
  const cacheDir = path.join(tmpDir, '.cache');
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.oddo'), 'x = 1\nexport { x }', 'utf-8');

    const ctx1 = createBuildContext({ srcDir: tmpDir, cacheDir });
    await ctx1.build();

    const ctx2 = createBuildContext({ srcDir: tmpDir, cacheDir });
    const { results, affected } = await ctx2.build();

    assertEqual(affected.size, 0, 'No files should be recompiled on identical cold start');
    assert(results.size === 1, 'Should still return all files');
    const js = results.get(path.join(tmpDir, 'a.oddo'))?.js;
    assert(js !== null && js.length > 0, 'Should load compiled JS from cache');
  } finally {
    cleanup(tmpDir);
  }
});

await testAsync('Pipeline: new file added to existing build', async () => {
  const tmpDir = makeTempDir();
  const cacheDir = path.join(tmpDir, '.cache');
  try {
    const aPath = path.join(tmpDir, 'a.oddo');
    fs.writeFileSync(aPath, 'x = 1\nexport { x }', 'utf-8');

    const ctx = createBuildContext({ srcDir: tmpDir, cacheDir });
    await ctx.build();

    const bPath = path.join(tmpDir, 'b.oddo');
    fs.writeFileSync(bPath, 'import { x } from "./a.oddo"\ny = x\nexport { y }', 'utf-8');

    const { affected } = await ctx.update({ new: [bPath] });
    assert(affected.has(bPath), 'New file should be compiled');
  } finally {
    cleanup(tmpDir);
  }
});

await testAsync('Pipeline: deleted file updates state', async () => {
  const tmpDir = makeTempDir();
  try {
    const aPath = path.join(tmpDir, 'a.oddo');
    const bPath = path.join(tmpDir, 'b.oddo');
    fs.writeFileSync(aPath, 'x = 1\nexport { x }', 'utf-8');
    fs.writeFileSync(bPath, 'y = 2\nexport { y }', 'utf-8');

    const ctx = createBuildContext({ srcDir: tmpDir });
    await ctx.build();

    fs.unlinkSync(bPath);
    await ctx.update({ deleted: [bPath] });
    assert(!ctx.state.dag.allFiles().includes(bPath), 'Deleted file should be removed from DAG');
  } finally {
    cleanup(tmpDir);
  }
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(50));
if (testsFailed > 0) {
  console.error(`\n✗ ${testsFailed} of ${testsRun} tests failed:\n`);
  for (const f of failures) {
    console.error(`  - ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log(`\n✓ All ${testsRun} tests passed!`);
}
