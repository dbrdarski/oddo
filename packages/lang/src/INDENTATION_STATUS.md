# Block Syntax: Indentation vs Braces

## Current Implementation

**Status: ✅ Brace-Based Blocks (JavaScript-style)**

The Oddo language parser uses **brace-based blocks** with curly braces `{}`, similar to JavaScript, C, and other C-style languages.

## Syntax

Blocks are delimited by curly braces and statements are separated by newlines:

```javascript
// Arrow functions with block bodies
fn = (x) => {
  y = x * 2
  return y
}

// Modifier blocks
@state: {
  x = 3
  y = 4
}

// Nested blocks
@outer: {
  @inner: {
    x = 10
  }
}
```

## History

The parser **originally planned** to use indentation-based blocks (like Python), but this was **dropped in favor of brace-based blocks** for the following reasons:

1. **Simpler Implementation**: Chevrotain is a token-based parser where whitespace is typically skipped. Implementing proper indentation tracking with INDENT/DEDENT tokens would require significant lexer modifications.

2. **JavaScript Compatibility**: Brace-based syntax aligns better with JavaScript, making it easier for developers familiar with JS to adopt Oddo.

3. **Flexibility**: Braces allow more freedom in code formatting without worrying about indentation levels.

4. **Tooling Support**: Most JavaScript tooling (formatters, linters) works better with explicit block delimiters.

## Newline Separation

While blocks use braces, **statements are separated by newlines** rather than semicolons (though semicolons may work in some contexts). This provides a cleaner syntax while maintaining explicit block boundaries:

```javascript
// Statements separated by newlines
x = 10
y = 20
z = x + y

// Not required to use semicolons
x = 10; y = 20; z = x + y  // Works but not idiomatic
```

## Block Examples

```javascript
// Control flow (when implemented)
if condition {
  doSomething()
  doSomethingElse()
}

// Functions
myFunc = (a, b) => {
  result = a + b
  return result
}

// Modifier blocks apply transformation to all statements
@computed: {
  sum = x + y
  product = x * y
}
```

