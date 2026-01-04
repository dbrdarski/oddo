# Chevrotain Oddo Parser - Current Status

## ✅ Completed

1. **Lexer (`lexer.mjs`)**
   - All token definitions (keywords, operators, literals, JSX tokens)
   - Proper token ordering to handle operator precedence
   - Modifier token support (`@identifier`)

2. **Parser Structure (`parser.mjs`)**
   - Complete grammar rules for all expression types
   - Operator precedence hierarchy (15 levels)
   - Arrays, objects, arrow functions
   - JSX elements (basic structure)
   - Statements (return, expression statements)
   - Modifiers support

3. **AST Converter (`ast-converter.mjs`)**
   - Framework for converting CST to AST
   - Basic conversion logic implemented

4. **Main Entry (`index.mjs`)**
   - Public API with `parseOddo()` function

## ⚠️ Known Issues

### 1. Arrow Function Ambiguity (Critical)

**Problem:** Chevrotain detects an ambiguity between:
- Arrow function parameters: `(x, y) => ...`
- Parenthesized expressions: `(x)`

**Error:** `Ambiguous Alternatives Detected: <4 ,5> in <OR> inside <unary> Rule`

**Why it happens:** Both can start with `LeftParen Identifier RightParen`, and Chevrotain's static analysis can't determine which one to use without lookahead.

**Solutions attempted:**
1. ❌ GATE predicates - caused infinite recursion during self-analysis
2. ❌ Error suppression - Chevrotain requires `performSelfAnalysis()` to succeed
3. ❌ Grammar restructuring - still ambiguous

**Recommended Solution:**
Use Chevrotain's proper GATE mechanism with careful lookahead, or restructure the grammar to parse arrow functions only in unambiguous contexts (e.g., after certain operators or in specific statement contexts).

### 2. JSX Text Parsing

**Problem:** JSX text content (like `"Hello"` between tags) needs special handling.

**Current Status:** Basic structure in place, but needs proper token/parsing logic for JSX text.

### 3. Indentation-Based Blocks

**Problem:** Oddo language uses indentation for blocks (Python-style), not curly braces.

**Current Status:** Not yet implemented. Requires custom parsing logic or a separate pass.

## 🔧 Next Steps

1. **Fix Arrow Function Ambiguity**
   - Option A: Use proper GATE predicates with limited lookahead
   - Option B: Restructure grammar to parse arrow functions only in unambiguous contexts
   - Option C: Use Chevrotain's backtracking features

2. **Complete AST Converter**
   - Finish conversion for all node types
   - Handle edge cases
   - Test with various inputs

3. **Implement JSX Text Parsing**
   - Add proper token handling for JSX text
   - Update parser rules

4. **Add Indentation-Based Block Parsing**
   - Implement indentation tracking
   - Parse blocks based on indentation levels

5. **Add Tests**
   - Unit tests for each grammar rule
   - Integration tests for full programs
   - Error handling tests

## 📝 Notes

- Chevrotain is strict about ambiguities and won't allow the parser to proceed if `performSelfAnalysis()` fails
- The parser structure is correct, but the ambiguity needs to be resolved before it can be used
- Consider consulting Chevrotain documentation on handling ambiguities: https://chevrotain.io/docs/guide/resolving_grammar_errors.html#AMBIGUOUS_ALTERNATIVES

## 🚀 Quick Start (Once Fixed)

```javascript
import { parseOddo } from './chevrotain/next/index.mjs';

const ast = parseOddo('x = 10');
console.log(ast);
```
