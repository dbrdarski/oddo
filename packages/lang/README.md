# @oddo/lang

A high-performance parser and compiler for the Oddo language built with Chevrotain.

## Installation

```bash
npm install @oddo/lang
```

You'll also need Babel packages for code generation:

```bash
npm install @babel/generator @babel/traverse @babel/types
```

## Features

- Complete Oddo language support
- Brace-based blocks (JavaScript-style)
- JSX syntax
- Modifiers (`@state`, `@computed`, `@effect`, `@mutate`)
- All JavaScript operators with correct precedence
- Arrow functions
- Arrays, objects, and all data types

## Usage

### Parsing

```javascript
import { parseOddo, parseOddoExpression } from '@oddo/lang';

// Parse a full program
const ast = parseOddo(`
  x = 10
  y = 20
  return x + y
`);

// Parse an expression
const exprAst = parseOddoExpression('1 + 2 * 3');
```

### Compiling to JavaScript

```javascript
import { compileOddoToJS } from '@oddo/lang';

const jsCode = compileOddoToJS(`
Counter = () => {
  @state count = 0
  @mutate increment = () => {
    count := count + 1
  }
  return <button onclick={increment}>
    Count: {count}
  </button>
}
`, { runtimeLibrary: '@oddo/ui' });
```

### Syntax Highlighting

```javascript
import { highlightOddo, getHighlightingCSS } from '@oddo/lang';

// Get CSS for highlighting
const css = getHighlightingCSS();

// Highlight code
const html = highlightOddo('@state count = 0');
```

## API

### `parseOddo(input: string): AST`
Parses Oddo source code and returns an Abstract Syntax Tree.

### `parseOddoExpression(input: string): ASTNode`
Parses a single Oddo expression.

### `compileOddoToJS(input: string, config?: CompileConfig): string`
Compiles Oddo source code to JavaScript.

### `highlightOddo(input: string): string`
Returns syntax-highlighted HTML for the given Oddo code.

### `getHighlightingCSS(): string`
Returns CSS styles for syntax highlighting.

## License

MIT
