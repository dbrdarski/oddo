# Fix: JSX Dep Stealing & Component Return Reactivity

## Problem

Two related bugs in the compiler's conversion phase (`compiler.mjs`):

### Bug 1: JSX deps bubble up to parent expressions

When JSX is assigned to a variable or used in a plain expression, `convertExpressionStatement` collects reactive deps from *inside* JSX expressions and wraps the outer expression with `_lift`. But JSX already handles its own reactivity internally via `_x(...)` in `convertJSXChild` → `createReactiveExpr`. This causes double-wrapping — redundant reactive subscriptions and potentially larger DOM recreation chunks.

**Example:**
```
@state x = 1
temp = <p>{x}</p>
```

**Current output (broken):**
```js
const temp = _lift(_x => createElement("p", null, _x(() => _x(), [x])), [x]);
//           ^^^^^ outer _lift steals {x} dep from JSX
```

**Expected output:**
```js
const temp = createElement("p", null, _x(_x2 => _x2(), [x]));
//           no outer _lift — JSX handles {x} via _x internally
```

### Bug 2: Component return statements don't handle reactive deps

`convertReturnStatement` (line 2274) is a trivial pass-through — it calls `convertExpression` on the argument and returns it. No reactive dep collection, no wrapping. This is correct for JSX returns (JSX handles itself) and hook returns (must preserve composite structure). But when a component returns a non-JSX reactive expression, the deps are silently dropped.

**Example:**
```
@component Foo = () => {
  @state x = 1
  return x + 1
}
```

**Current output (broken):**
```js
const Foo = function () {
  const [x, setX] = _state(1);
  return x + 1;  // raw reactive container + number — nonsense
};
```

**Expected output:**
```js
const Foo = function () {
  const [x, setX] = _state(1);
  return _x(_x2 => _x2() + 1, [x]);  // wrapped as renderable reactive expression
};
```

## Root Cause

Both bugs stem from JSX being "self-contained reactive" — it handles its own deps internally via `_x`/`_computed` — but the rest of the conversion phase doesn't respect that boundary.

- `collectOddoIdentifiersOnly`, `collectCompositeDeps`, and `collectCompositeSpreads` all have a `stopAtJsxExpressions` parameter, but it's only used inside `createReactiveExpr` (for JSX-to-JSX isolation). The variable declaration and plain expression paths in `convertExpressionStatement` don't use it.
- `convertReturnStatement` does zero reactive analysis.

## Fix

### Part 1: Stop JSX dep stealing in `convertExpressionStatement`

Pass `stopAtJsxExpressions = true` to all dep collection calls in `convertExpressionStatement`. There are 6 call sites:

**Variable declaration path (~line 2138):**
```js
// Before:
const identifiers = collectOddoIdentifiersOnly(oddoRight);
const compositeDeps = collectCompositeDeps(oddoRight);
const compositeSpreads = collectCompositeSpreads(oddoRight);

// After:
const identifiers = collectOddoIdentifiersOnly(oddoRight, new Set(), true);
const compositeDeps = collectCompositeDeps(oddoRight, [], new Set(), true);
const compositeSpreads = collectCompositeSpreads(oddoRight, [], new Set(), true);
```

**Plain expression path (~line 2177):**
```js
// Before:
const allIdentifiers = collectOddoIdentifiersOnly(stmt.expression, new Set(), false, true);
const compositeDeps = collectCompositeDeps(stmt.expression, [], new Set(), false, true);
const compositeSpreads = collectCompositeSpreads(stmt.expression, [], new Set(), false, true);

// After:
const allIdentifiers = collectOddoIdentifiersOnly(stmt.expression, new Set(), true, true);
const compositeDeps = collectCompositeDeps(stmt.expression, [], new Set(), true, true);
const compositeSpreads = collectCompositeSpreads(stmt.expression, [], new Set(), true, true);
```

This is safe because:
- `convertJSXChild` and `createReactiveExpr` make their own independent calls to these functions with their own `stopAtJsxExpressions = true`. They are completely unaffected.
- The only behavioral change is: deps inside JSX expressions no longer bubble up to the parent statement level.

### Part 2: Add `componentScope` flag

Create a new Symbol to distinguish component bodies from hook bodies during conversion:

```js
const componentScope = Symbol("component-scope");
```

In `convertReactiveContainer`, accept a parameter to indicate whether this is a component:

```js
function convertReactiveContainer(expr, isComponent = false) {
  // ...existing scope setup...
  if (isComponent) {
    currentScope[componentScope] = true;
  }
  // ...rest unchanged...
}
```

Update the `@component` modifier transform to pass `true`:
```js
const funcExpr = convertReactiveContainer(oddoExpr, true);
```

The `@hook` transform continues passing nothing (defaults to `false`).

### Part 3: Fix `convertReturnStatement`

Add reactive dep analysis and `_x` wrapping for component returns:

```js
function convertReturnStatement(stmt) {
  if (!stmt.argument) return t.returnStatement(null);

  // Inside @component: wrap return with _x if it has reactive deps
  if (currentScope[componentScope]) {
    const savedScope = currentScope;
    currentScope = Object.create(currentScope);
    currentScope[reactiveScope] = false;
    const argument = convertExpression(stmt.argument);
    currentScope = savedScope;
    return t.returnStatement(createReactiveExpr(stmt.argument, argument));
  }

  return t.returnStatement(convertExpression(stmt.argument));
}
```

`createReactiveExpr` already:
- Uses `stopAtJsxExpressions = true` (won't steal JSX child deps)
- Returns the expression unchanged if there are no reactive deps
- Wraps with `_x(fn, deps)` if there are reactive deps

So for `return <p>{x}</p>` — no reactive deps found outside JSX → pass-through (correct).
For `return x + 1` — `x` is reactive → wraps with `_x` (correct).

## Test Coverage

7 new tests added in `test.mjs`:

| Test | Expected | Before Fix |
|------|----------|------------|
| Sibling JSX expressions each get own `_x` | PASS | PASS |
| Nested JSX element does not steal child deps | PASS | PASS |
| Variable assigned JSX should NOT get `_lift` | PASS | FAIL |
| Plain expression with JSX should NOT get `_lift` | PASS | FAIL |
| Component return with reactive deps gets `_x` | PASS | FAIL |
| Component return JSX is NOT double-wrapped | PASS | PASS |
| Hook return is NOT wrapped | PASS | PASS |

## Files Changed

- `packages/lang/src/compiler.mjs` — all 3 parts of the fix
- `packages/lang/src/test.mjs` — 7 new tests (already added)
