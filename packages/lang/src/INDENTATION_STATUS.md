# Indentation-Based Blocks Status

## Current Implementation

**Status: ⚠️ Partially Implemented**

The Chevrotain parser currently has:
- ✅ Structure for blocks (`expressionStatement` with optional `:` and `blockBody`)
- ✅ Basic block parsing (parses statements sequentially)
- ❌ **No indentation checking** - blocks don't verify indentation levels

## The Problem

The `blockBody` rule in `parser.mjs` currently does:
```javascript
this.RULE('blockBody', () => {
  this.MANY(() => {
    this.SUBRULE(this.statement);
  });
});
```

This just parses statements sequentially without checking if they're properly indented. It will parse:
```
fn:
x = 10  // Wrong - not indented!
y = 20  // Wrong - not indented!
```

When it should only parse:
```
fn:
  x = 10  // Correct - indented
  y = 20  // Correct - indented
```

## Why It's Hard

Chevrotain is a token-based parser, and whitespace (including indentation) is typically skipped. To implement proper indentation-based parsing, we need to:

1. **Option A: Custom Lexer Mode**
   - Create INDENT/DEDENT tokens
   - Track indentation levels in the lexer
   - Insert INDENT/DEDENT tokens when indentation changes

2. **Option B: Post-Processing**
   - Parse blocks without indentation checking
   - Post-process the AST to validate indentation
   - Reject invalid blocks

3. **Option C: Hybrid Approach**
   - Preprocess input to insert INDENT/DEDENT markers
   - Modify lexer to recognize these markers
   - Use them in parser rules

## Current Workaround

The `preprocessIndentation` function in `index.mjs` validates indentation but doesn't actually enforce it during parsing. Blocks are parsed, but indentation isn't checked.

## Next Steps

To properly implement indentation-based blocks:

1. Add INDENT/DEDENT tokens to the lexer
2. Modify lexer to track indentation and emit these tokens
3. Update `blockBody` rule to require INDENT before statements
4. Handle DEDENT tokens to end blocks

This is a significant change that requires modifying the lexer architecture.

