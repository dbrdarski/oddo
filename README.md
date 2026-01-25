# Oddo

A language that compiles to JavaScript with a reactive UI framework.

## The Language

Oddo is a clean, expressive language with JSX support and built-in reactive primitives. Write components with simple syntax that compiles to efficient JavaScript:

```oddo
Counter = () => {
  @state count = 0
  @mutate increment = () => {
    count := count + 1
  }
  return <button onclick={increment}>
    Count: {count}
  </button>
}
```

## The UI Framework

The `@oddo/ui` package provides reactive primitives that power your components:

| Modifier | Description |
|----------|-------------|
| `@state` | Reactive state that triggers updates when changed |
| `@computed` | Derived values that auto-update when dependencies change |
| `@effect` | Side effects that run when dependencies change |
| `@mutate` | Functions that can modify state |

Example with all modifiers:

```oddo
App = () => {
  @state count = 0
  @computed doubled = count * 2
  @effect () => console.log("Count changed:", count)
  @mutate increment = () => {
    count := count + 1
  }

  return <div>
    <p>Count: {count}, Doubled: {doubled}</p>
    <button onclick={increment}>+1</button>
  </div>
}
```

## Packages

- **`@oddo/lang`** - Parser and compiler for the Oddo language
- **`@oddo/ui`** - Reactive runtime and DOM utilities
- **`@oddo/router`** - Client-side routing

## Quick Start

```bash
npm install
npm run build
```

To start the docs:

```bash
npm run docs:serve
```

## More Info

See the `packages/docs/` directory for full documentation, guides, and interactive examples.
