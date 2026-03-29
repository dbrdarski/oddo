# Oddo Build System

## What Problem Does This Solve?

Previously, the Oddo compiler treated **every import from a `.oddo` file as reactive**. This meant if you imported a plain constant like `API_URL` from another `.oddo` file, the compiler would wrap it with `_lift()` — adding unnecessary runtime overhead and incorrect reactive tracking.

The build system fixes this by extracting **signatures** from each `.oddo` file that describe exactly what each export is (reactive state, computed value, composite hook, plain immutable, etc.), then feeding those signatures to downstream files during compilation.

## How It Works

### The Core Idea

Instead of compiling each `.oddo` file in isolation, the build system:

1. **Discovers** all `.oddo` files and their import relationships
2. **Orders** them so dependencies are compiled before the files that import them
3. **Extracts** each file's export signature after compilation
4. **Feeds** those signatures into downstream files so they know exactly how to classify each import

### Example

Suppose you have two files:

**hooks.oddo**
```
@hook useAuth = () => {
  @state [email, setEmail] = null
  login = () => { }
  return { email, login }
}
export { useAuth }
```

**app.oddo**
```
import { useAuth } from "./hooks.oddo"
data = useAuth()
@computed val = data.email
```

**Without the build system**, the compiler doesn't know what `useAuth` is. It sees it's from a `.oddo` file and blindly wraps `useAuth()` with `_lift()`, treating it as a reactive value. It also can't tell that `data.email` is a reactive member while `data.login` is not.

**With the build system**, `hooks.oddo` is compiled first. Its signature tells us:
```json
{
  "useAuth": {
    "type": "hook",
    "reactive": false,
    "composite": {
      "kind": "function",
      "returns": {
        "kind": "object",
        "members": {
          "email": { "reactive": true },
          "login": { "reactive": false }
        }
      }
    }
  }
}
```

When `app.oddo` is compiled, it receives this signature. Now the compiler knows `useAuth` is a composite hook — no `_lift()` wrapping, and `data.email` is correctly tracked as a reactive dependency while `data.login` is left alone.

## Architecture

### Module Dependency Graph (DAG)

The build system constructs a Directed Acyclic Graph where each node is an `.oddo` file and edges represent imports. "A imports B" creates an edge from A to B.

This DAG serves three purposes:

1. **Topological ordering** — compile B before A, since A needs B's signature
2. **Cycle detection** — circular imports between `.oddo` files are a compile error
3. **Change propagation** — when B changes, find all files that directly or transitively depend on B so they can be recompiled with B's updated signature

### Build Pipeline

Every build (first build, dev restart, watch mode file change) flows through the same unified pipeline:

```
Input: { new: [...], deleted: [...], updated: [...] }
                            │
                    ┌───────▼────────┐
                    │ Remove deleted  │
                    │ from state      │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Parse new +     │
                    │ updated files   │
                    │ (stages 1-4)    │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Update DAG      │
                    │ edges           │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Check for       │
                    │ cycles          │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Determine       │
                    │ affected set    │
                    │ (changed files  │
                    │ + downstream)   │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Compile in      │
                    │ topological     │
                    │ order with      │
                    │ signatures      │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Cascade: if     │
                    │ signature       │
                    │ changed, add    │
                    │ downstream to   │
                    │ affected set    │
                    └───────┬────────┘
                            │
                  Output: compiled JS
                  for affected files
```

The three scenarios differ only in their starting state and input:

| Scenario | Starting State | Diff Source |
|----------|---------------|-------------|
| First build (no cache) | Empty | All files are "new" |
| Dev restart (with cache) | Loaded from disk | Scanner compares file hashes to cached hashes |
| Watch mode file change | In-memory from previous run | Watcher classifies the event |

### Caching

The disk cache (optional, configured via `cacheDir`) persists build state between process restarts. This is what gives you fast cold starts — on a dev restart, only files that actually changed (different SHA-256 hash) get recompiled, plus any files downstream of them in the DAG.

**What's cached:**
- The DAG structure (which files import which)
- Per-file: source hash, export signature, compiled JavaScript, import edges

**What's NOT cached:**
- ASTs — they're kept in memory during a single build run (to avoid re-parsing during signature cascades) but discarded afterward

### File Watcher

The watcher uses two safety mechanisms:

- **Debouncing** (default 150ms) — multiple rapid file changes (e.g., git branch switch, find-and-replace across files) are batched into a single pipeline run
- **Serialization** — pipeline runs never overlap. If a change arrives while a build is running, it waits for the current build to finish

## Files

| File | Purpose |
|------|---------|
| `src/index.mjs` | Public API: `createBuildContext()` |
| `src/pipeline.mjs` | The unified build pipeline |
| `src/state.mjs` | In-memory `BuildState` class |
| `src/dag.mjs` | DAG with topo sort, cycle detection, downstream traversal |
| `src/cache.mjs` | Disk persistence: read on init, write after each run |
| `src/resolver.mjs` | Resolve relative `.oddo` import paths to absolute paths |
| `src/scanner.mjs` | Scan directory for `.oddo` files, diff against state |
| `src/test.mjs` | 34 tests covering all modules |

## Usage

### Full Build

```javascript
import { createBuildContext } from '@oddo/build';

const ctx = createBuildContext({
  srcDir: './src',
  cacheDir: '.cache',        // optional, enables disk caching
  runtimeLibrary: '@oddo/ui'  // optional, defaults to '@oddo/ui'
});

const { results, affected, warnings } = await ctx.build();

// results: Map<filePath, { filePath, js }> — all files with compiled JS
// affected: Map<filePath, { js, signature }> — only files that were recompiled
// warnings: string[] — e.g., imports pointing outside srcDir

for (const [filePath, { js }] of results) {
  fs.writeFileSync(filePath.replace('.oddo', '.js'), js);
}
```

### Incremental Update

```javascript
const { results, affected } = await ctx.update({
  updated: ['/absolute/path/to/changed-file.oddo']
});
// Only returns files that were actually recompiled (including downstream cascade)
```

### Watch Mode

```javascript
const watcher = ctx.createWatcher({
  debounceMs: 150,  // default
  onChange: ({ results, affected }) => {
    for (const [filePath, { js }] of results) {
      // Write updated JS to disk, trigger bundler, etc.
    }
  }
});

// Later:
watcher.close();
```

## Backward Compatibility

The single-file compiler (`compileOddoToJS`) works exactly as before when used without `importSignatures`. The build system is purely additive — existing code that compiles individual `.oddo` files (like the playground's `/compile` endpoint) continues to work unchanged, with `.oddo` imports treated as reactive by default.
