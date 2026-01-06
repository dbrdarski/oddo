# Oddo Language Parser (Chevrotain Implementation)

A high-performance parser for the Oddo language built with Chevrotain.

## Features

- ✅ Complete Oddo language support
- ✅ Brace-based blocks (JavaScript-style)
- ✅ JSX syntax
- ✅ Modifiers with runtime library imports
- ✅ All JavaScript operators with correct precedence
- ✅ Arrow functions
- ✅ Arrays, objects, and all data types

## Usage

### Programmatic API

```javascript
import { parseOddo, parseOddoExpression } from './chevrotain/next/index.mjs';

// Parse a full program
const ast = parseOddo(`
  x = 10
  y = 20
  return x + y
`);

// Parse an expression
const exprAst = parseOddoExpression('1 + 2 * 3');
```

### Web Demo

Start the interactive web demo:

```bash
npm run demo:next
```

Then open your browser to `http://localhost:3000`

The web demo provides:
- Live parsing of Oddo code
- AST visualization
- Example code snippets
- Performance statistics

## Testing

Run the test suite:

```bash
npm run test:chevrotain
```

## Performance

The Chevrotain implementation is significantly faster than the parser combinator approach:

- **Average speedup**: ~76x faster
- **Complex expressions**: Up to 22x faster
- **Deep nesting**: Up to 1,500x faster
- **Data structures**: Up to 28x faster

See `benchmarks/compare-next-implementations.mjs` for detailed comparisons.

## Files

- `lexer.mjs` - Token definitions
- `parser.mjs` - Grammar rules (CST parser)
- `ast-converter.mjs` - Converts CST to AST
- `index.mjs` - Main entry point
- `test.mjs` - Test suite
- `web-demo.mjs` - Web server for interactive demo
- `SPEC.md` - Language specification
