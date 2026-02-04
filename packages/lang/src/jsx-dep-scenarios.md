# JSX Dependency Collection - Test Scenarios

## Problem Statement

When collecting deps for a JSX expression `{...}`, we currently collect ALL identifiers including those inside nested JSX expressions. This breaks reactivity granularity.

## Proposed Fix

When collecting identifiers for a JSX expression, **stop at nested `jsxExpression` nodes** - each `{...}` is its own reactivity boundary.

---

## Test Scenarios

### Scenario 1: Basic nested JSX (original case)

**Oddo Input:**
```
@component Table = ({ props: { columns, data }, children }) => {
  return <tbody>{data.map(row => <tr>{columns.map(field => <td>{field.label}</td>)}</tr>)}</tbody>
}
```

**Expected JS Output:**
```javascript
import { e as _e, x as _x } from "@oddo/ui";
const Table = function ({ props: { columns, data }, children }) {
  return _e("tbody", null, 
    _x(data => data().map(row => 
      _e("tr", null, 
        _x(columns => columns().map(field => 
          _e("td", null, 
            _x(() => field.label, [])
          )
        ), [columns])
      )
    ), [data])
  );
};
```

**Key points:**
- Outer `_x` captures only `[data]`, NOT `[data, columns]`
- Inner `_x` captures `[columns]`
- Innermost `_x` has empty deps `[]` (field is callback param)

---

### Scenario 2: Same variable at multiple levels

**Oddo Input:**
```
@component List = ({ props: { data }, children }) => {
  return <div>{data.length > 0 && <ul>{data.map(item => <li>{item.name}</li>)}</ul>}</div>
}
```

**Expected JS Output:**
```javascript
import { e as _e, x as _x } from "@oddo/ui";
const List = function ({ props: { data }, children }) {
  return _e("div", null,
    _x(data => data().length > 0 && 
      _e("ul", null, 
        _x(data => data().map(item => 
          _e("li", null, 
            _x(() => item.name, [])
          )
        ), [data])
      )
    , [data])
  );
};
```

**Key points:**
- Both outer and inner capture `[data]` independently - this is correct
- Each is a separate reactivity boundary 

---

### Scenario 3: Multiple sibling expressions

**Oddo Input:**
```
@component Card = ({ props: { title, count, items }, children }) => {
  return <div>
    {title}
    <span>{count}</span>
    {items.map(i => <li>{i.name}</li>)}
  </div>
}
```

**Expected JS Output:**
```javascript
import { e as _e, x as _x } from "@oddo/ui";
const Card = function ({ props: { title, count, items }, children }) {
  return _e("div", null,
    _x(title => title(), [title]),
    _e("span", null, _x(count => count(), [count])),
    _x(items => items().map(i => 
      _e("li", null, _x(() => i.name, []))
    ), [items])
  );
};
```

**Key points:**
- Each `{...}` is independent: `[title]`, `[count]`, `[items]`
- No cross-contamination of deps

---

### Scenario 4: Conditional with nested JSX

**Oddo Input:**
```
@component Toggle = ({ props: { condition, x, y }, children }) => {
  return <div>{condition ? <A>{x}</A> : <B>{y}</B>}</div>
}
```

**Expected JS Output:**
```javascript
import { e as _e, x as _x } from "@oddo/ui";
const Toggle = function ({ props: { condition, x, y }, children }) {
  return _e("div", null,
    _x(condition => condition() ? 
      _e(A, null, _x(x => x(), [x])) : 
      _e(B, null, _x(y => y(), [y]))
    , [condition])
  );
};
```

**Key points:**
- Outer captures only `[condition]`
- `{x}` captures `[x]`
- `{y}` captures `[y]`

---

### Scenario 5: Chained methods (no nested JSX boundaries)

**Oddo Input:**
```
@component Tags = ({ props: { data }, children }) => {
  return <span>{data.filter(x => x.active).map(x => x.name).join(", ")}</span>
}
```

**Expected JS Output:**
```javascript
import { e as _e, x as _x } from "@oddo/ui";
const Tags = function ({ props: { data }, children }) {
  return _e("span", null,
    _x(data => data().filter(x => x.active).map(x => x.name).join(", "), [data])
  );
};
```

**Key points:**
- Single `_x` with `[data]`
- Arrow functions `x => x.active` have no `_liftFn` (non-reactive scope)

---

### Scenario 6: Deep nesting (4 levels)

**Oddo Input:**
```
@component Deep = ({ props: { a, b, c, d }, children }) => {
  return <div>{a.map(() => <div>{b.map(() => <span>{c.map(() => <i>{d}</i>)}</span>)}</div>)}</div>
}
```

**Expected JS Output:**
```javascript
import { e as _e, x as _x } from "@oddo/ui";
const Deep = function ({ props: { a, b, c, d }, children }) {
  return _e("div", null,
    _x(a => a().map(() => 
      _e("div", null, 
        _x(b => b().map(() => 
          _e("span", null, 
            _x(c => c().map(() => 
              _e("i", null, 
                _x(d => d(), [d])
              )
            ), [c])
          )
        ), [b])
      )
    ), [a])
  );
};
```

**Key points:**
- Level 1: `[a]`
- Level 2: `[b]`
- Level 3: `[c]`
- Level 4: `[d]`
- Each level captures only its own dep

---

### Scenario 7: Mixed callback params and reactive

**Oddo Input:**
```
@component ItemList = ({ props: { items, count }, children }) => {
  return <ul>{items.map(item => <li>{item.name + " - " + count}</li>)}</ul>
}
```

**Expected JS Output:**
```javascript
import { e as _e, x as _x } from "@oddo/ui";
const ItemList = function ({ props: { items, count }, children }) {
  return _e("ul", null,
    _x(items => items().map(item => 
      _e("li", null, 
        _x(count => item.name + " - " + count(), [count])
      )
    ), [items])
  );
};
```

**Key points:**
- Outer captures `[items]`, NOT `[items, count]`
- Inner captures `[count]`
- `item` is callback param, accessed directly without `()`

---

### Scenario 8: Logical AND short-circuit

**Oddo Input:**
```
@component Loader = ({ props: { isLoading, data }, children }) => {
  return <div>
    {isLoading && <Spinner />}
    {!isLoading && <Content>{data}</Content>}
  </div>
}
```

**Expected JS Output:**
```javascript
import { e as _e, x as _x } from "@oddo/ui";
const Loader = function ({ props: { isLoading, data }, children }) {
  return _e("div", null,
    _x(isLoading => isLoading() && _e(Spinner, null), [isLoading]),
    _x(isLoading => !isLoading() && _e(Content, null, 
      _x(data => data(), [data])
    ), [isLoading])
  );
};
```

**Key points:**
- First expr: `[isLoading]`
- Second expr: `[isLoading]`, NOT `[isLoading, data]`
- Inner `{data}`: `[data]`

---

## Additional Scenarios: Verifying Prefixing Doesn't Break Modifiers

These scenarios verify that prefixing params works correctly with nested functions in `@computed`, `@effect`, etc.

### Scenario 9: @computed with nested map callback

**Oddo Input:**
```
@state items = [1, 2, 3]
@state multiplier = 2
@computed doubled = items.map(x => x * multiplier)
```

**Expected JS Output (with prefixing):**
```javascript
import { state as _state, computed as _computed } from "@oddo/ui";
const [items, setItems] = _state([1, 2, 3]);
const [multiplier, setMultiplier] = _state(2);
const doubled = _computed((_items, _multiplier) => _items().map(x => x * _multiplier()), [items, multiplier]);
```

**Key points:**
- Params are prefixed: `_items`, `_multiplier`
- Deps array uses original names: `[items, multiplier]`
- `multiplier` inside nested `x => ...` becomes `_multiplier()`

---

### Scenario 10: @computed with multiple nested callbacks

**Oddo Input:**
```
@state data = [1, 2, 3]
@state factor = 10
@computed result = data.map(item => item * factor).filter(x => x > factor)
```

**Expected JS Output (with prefixing):**
```javascript
import { state as _state, computed as _computed } from "@oddo/ui";
const [data, setData] = _state([1, 2, 3]);
const [factor, setFactor] = _state(10);
const result = _computed((_data, _factor) => _data().map(item => item * _factor()).filter(x => x > _factor()), [data, factor]);
```

**Key points:**
- Both `factor` references (in `.map` and `.filter`) become `_factor()`
- Nested callback params (`item`, `x`) are NOT prefixed - they're local

---

### Scenario 11: @effect with nested function

**Oddo Input:**
```
@state items = []
@state logger = console.log
@effect () => { items.forEach(item => logger(item)) }
```

**Expected JS Output (with prefixing):**
```javascript
import { state as _state, effect as _effect } from "@oddo/ui";
const [items, setItems] = _state([]);
const [logger, setLogger] = _state(console.log);
_effect((_items, _logger) => {
  _items().forEach(item => _logger()(item));
}, [items, logger]);
```

**Key points:**
- `items` → `_items()`, `logger` → `_logger()`
- Inside nested callback, `logger(item)` becomes `_logger()(item)`
- Local `item` param is unchanged

---

### Scenario 12: Mixed JSX and @computed (verify independence)

**Oddo Input:**
```
@component Example = ({ props: { data, count }, children }) => {
  @computed total = data.reduce((sum, x) => sum + x * count, 0)
  return <div>
    {total}
    {data.map(item => <span>{item + count}</span>)}
  </div>
}
```

**Expected JS Output (with prefixing):**
```javascript
import { state as _state, computed as _computed, e as _e, x as _x } from "@oddo/ui";
const Example = function ({ props: { data, count }, children }) {
  const total = _computed((_data, _count) => _data().reduce((sum, x) => sum + x * _count(), 0), [data, count]);
  return _e("div", null,
    _x(_total => _total(), [total]),
    _x(_data => _data().map(item => 
      _e("span", null, _x(_count => item + _count(), [count]))
    ), [data])
  );
};
```

**Key points:**
- `@computed` uses prefixed params correctly
- JSX `_x` uses prefixed params correctly
- Outer `{data.map(...)}` captures only `[data]`, not `[data, count]`
- Inner `{item + count}` captures `[count]`
- Local callback param `item` is not prefixed

---

## Implementation Notes

### Change 1: Stop at JSX boundaries when collecting deps

In `collectOddoIdentifiersOnly` - add a flag to stop traversal at `jsxExpression` nodes:

```javascript
function collectOddoIdentifiersOnly(node, stopAtJsxExpressions = false) {
  // ... existing traversal ...
  // If stopAtJsxExpressions && node.type === 'jsxExpression', skip children
}
```

Then in `createReactiveExpr`:
```javascript
const allIdentifiers = collectOddoIdentifiersOnly(oddoExpr, true);
```

### Change 2: Prefix params to avoid shadowing

Modify `wrapDependenciesWithCalls` to accept a prefix option, or create a new function that:
1. Replaces `identifier('foo')` with `callExpression(identifier('_foo'), [])`
2. Used by `createReactiveExpr` for JSX expressions

For modifiers (`@computed`, `@effect`, etc.), either:
- Also use prefixing (simpler, consistent)
- Keep current behavior (requires separate function)

