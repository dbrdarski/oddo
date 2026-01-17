# @oddo/ui

The runtime library for the Oddo language. This package provides the reactive primitives and DOM utilities that compiled Oddo code depends on.

## Installation

```bash
npm install @oddo/ui
```

## Overview

`@oddo/ui` is a companion package to `@oddo/lang`. When you write Oddo code and compile it, the generated JavaScript imports from this package.

**You write Oddo:**
```oddo
Counter = () => {
  @state count = 0
  @computed doubled = count * 2
  @mutate increment = () => {
    count := count + 1
  }

  return <button onclick={increment}>
    Count: {count}, Doubled: {doubled}
  </button>
}
```

**Which compiles to JavaScript using `@oddo/ui`:**
```javascript
import { state, computed, mutate, e } from "@oddo/ui";

const Counter = () => {
  const count = state(0);
  const doubled = computed(() => count() * 2);
  const increment = mutate(() => {
    count(count() + 1);
  });

  return e("button", { onclick: increment },
    "Count: ", count, ", Doubled: ", doubled
  );
};
```

## Direct Imports

Some utilities are meant to be imported directly in your Oddo code:

```oddo
import { mount } from "@oddo/ui"

App = () => {
  return <div>Hello Oddo!</div>
}

mount(document.body, <App />)
```

### Available Exports

| Export | Description |
|--------|-------------|
| `mount(container, element)` | Mount an Oddo component to the DOM |

## Used by the Compiler

These exports are used internally by compiled Oddo code:

| Oddo Syntax | Compiles To |
|-------------|-------------|
| `@state x = 0` | `state(0)` |
| `@computed y = x + 1` | `computed(() => x() + 1)` |
| `@effect () => console.log(x)` | `effect(() => console.log(x()))` |
| `@mutate inc = () => { x := x + 1 }` | `mutate(() => { x(x() + 1) })` |

## License

MIT
