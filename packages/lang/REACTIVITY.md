# Oddo Reactivity Rules

This document describes how the Oddo compiler should determine which values are reactive.

## What "Reactive" Means

A reactive value is a signal that must be called as `x()` to get its value. The compiler applies transformations to wrap reactive values so they can be properly unwrapped at runtime. The `@oddo/ui` runtime handles these transformations.

When a value is marked as reactive, transformations lift non-reactive arguments to be callable (`x => x()`), ensuring calling them won't break anything regardless of whether the actual runtime value is a signal or plain value.

## Reactivity Rules

### Reactive Values

1. **`@state` variables** - explicitly create reactive signals
2. **`@computed` variables** - explicitly create computed signals  
3. **Function parameters** - including:
   - Simple parameters (e.g., `(x) => ...`)
   - Destructured parameters (e.g., `({ x, y }) => ...`)
   - Rest parameters (e.g., `(...args) => ...`)
4. **`.oddo` imports** - values imported from `.oddo` files (need cross-file tracking for accuracy, but treat as reactive for now)

### Non-Reactive Values

1. **Globals** - undeclared values that are not imported (e.g., `console`, `Math`)
2. **`@mutable` variables** - explicitly non-reactive
3. **Regular declarations** - variables without modifiers (e.g., `x = 5`)
4. **`.js` imports** - values imported from plain JavaScript files

## Import Handling

- `.js` imports → non-reactive (plain JavaScript)
- `.oddo` imports → need cross-file analysis to know which exports are reactive
  - **Temporary solution**: treat all `.oddo` imports as reactive
  - **Future solution**: multi-file compilation or metadata to track reactive exports

## Language Notes

- Oddo does NOT have `for` loops
- Oddo does NOT have `try/catch`

