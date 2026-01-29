# Oddo Language Syntax Guide

This document describes the complete syntax of the Oddo language. AI agents should reference this to generate valid Oddo code.

## What Oddo Does NOT Have

**These constructs do NOT exist in Oddo:**

- `if` / `else` / `else if` - use ternary `? :` instead
- `switch` / `case` - use ternary chains or object lookups
- `for` / `while` / `do` loops - use `.map()`, `.filter()`, `.reduce()`, etc.
- `try` / `catch` / `finally` / `throw`
- `class` / `extends` / `super` / `new` / `this`
- `const` / `let` / `var` keywords (declarations use `=` directly)
- `function` keyword (use arrow functions `=>`)
- `async` / `await`

- `===` / `!==` (use `==` / `!=`)

## Statements

### Expression Statements

```oddo
x = 5                    // Declaration (immutable)
x := 10                  // Mutation (reassignment)
doSomething()            // Function call
```

### Modifier Statements

```oddo
@state count = 0         // Reactive state
@computed double = count * 2   // Computed value
@mutable temp = 0        // Mutable (non-reactive) variable
@effect => console.log(count)  // Side effect
@mutate count := count + 1     // State mutation
@react result = fetchData()    // Reactive expression
```

### Modifier Blocks

```oddo
@state:
  count = 0
  name = "default"
```

### Return Statement

Only valid inside arrow function block bodies:

```oddo
fn = (x) => {
  return x + 1
}
```

### Import Statements

```oddo
import Btn from "../components/Btn"
import { x, y } from "./utils"
import { x as renamed } from "./utils"
import Default, { named } from "./module"
import * as ns from "./module"
```

### Export Statements

```oddo
export default MyComponent
export { x, y }
export { x as renamed }
export myVar = 42
```

## Expressions

### Literals

```oddo
42                       // Number
3.14                     // Float
0xFF                     // Hex
0b1010                   // Binary
0o755                    // Octal
"hello"                  // String (double quotes only)
`template ${expr}`       // Template literal
true                     // Boolean
false
null
```

### Arrays

```oddo
[]                       // Empty array
[1, 2, 3]                // Array literal
[a, b, ...rest]          // With spread
[1, 2,]                  // Trailing comma allowed
```

### Objects

```oddo
{}                       // Empty object
{ a: 1, b: 2 }           // Object literal
{ a, b }                 // Shorthand properties
{ [computed]: value }    // Computed keys
{ ...spread, a: 1 }      // With spread
{ a: 1, }                // Trailing comma allowed
```

### Arrow Functions

```oddo
x => x + 1                        // Single param, expression body
x => { return x + 1 }             // Single param, block body
(x, y) => x + y                   // Multiple params
() => 42                          // No params
({ a, b }) => a + b               // Destructuring param
([first, ...rest]) => first       // Array destructuring
(x = 10) => x                     // Default value
(...args) => args.length          // Rest param
```

### Destructuring

```oddo
[a, b] = arr                      // Array destructuring
[a, , c] = arr                    // Skipping elements
[a, ...rest] = arr                // Rest element
{ a, b } = obj                    // Object destructuring
{ a: renamed } = obj              // Renaming
{ a = default } = obj             // Default value
{ a, ...rest } = obj              // Rest property
```

### Member Access

```oddo
obj.property                      // Dot notation
obj["property"]                   // Bracket notation
obj[expression]                   // Computed access
obj?.property                     // Optional chaining
obj?.["property"]                 // Optional bracket
arr[0]                            // Array index
```

### Array Slicing

```oddo
arr[1...3]                        // Slice from index 1 to 3
arr[1...]                         // Slice from index 1 to end
arr[...3]                         // Slice from start to index 3
arr[...]                          // Copy entire array
```

### Function Calls

```oddo
fn()                              // No arguments
fn(a, b)                          // With arguments
fn(...args)                       // Spread arguments
fn(a, b,)                         // Trailing comma allowed
obj.method()                      // Method call
fn?.()                            // Optional call
tag`template`                     // Tagged template
```

### Operators

#### Arithmetic
```oddo
a + b                             // Addition
a - b                             // Subtraction
a * b                             // Multiplication
a / b                             // Division
a % b                             // Modulo
a ** b                            // Exponentiation
```

#### Comparison
```oddo
a == b                            // Equality
a != b                            // Inequality
a < b                             // Less than
a > b                             // Greater than
a <= b                            // Less than or equal
a >= b                            // Greater than or equal
a instanceof B                    // Instance check
key in obj                        // Property check
```

#### Logical
```oddo
a && b                            // Logical AND
a || b                            // Logical OR
!a                                // Logical NOT
a ?? b                            // Nullish coalescing
```

#### Bitwise
```oddo
a & b                             // AND
a | b                             // OR
a ^ b                             // XOR
~a                                // NOT
a << b                            // Left shift
a >> b                            // Right shift
a >>> b                           // Unsigned right shift
```

#### Unary
```oddo
+a                                // Unary plus
-a                                // Unary minus
!a                                // Logical NOT
~a                                // Bitwise NOT
typeof a                          // Type of
void a                            // Void
delete obj.prop                   // Delete property
```

#### Conditional (Ternary)
```oddo
condition ? valueIfTrue : valueIfFalse
```

#### Pipe and Compose
```oddo
value |> fn                       // Pipe: fn(value)
fn <| value                       // Compose: fn(value)
a |> b |> c                       // Chain: c(b(a))
```

### Assignment Operators

```oddo
x = 1                             // Declaration (immutable)
x := 2                            // Mutation (reassignment)
x +:= 1                           // Add and assign
x -:= 1                           // Subtract and assign
x *:= 2                           // Multiply and assign
x /:= 2                           // Divide and assign
x %:= 2                           // Modulo and assign
x **:= 2                          // Exponentiate and assign
x <<:= 1                          // Left shift and assign
x >>:= 1                          // Right shift and assign
x >>>:= 1                         // Unsigned right shift and assign
x &:= mask                        // Bitwise AND and assign
x |:= mask                        // Bitwise OR and assign
x ^:= mask                        // Bitwise XOR and assign
```

## JSX

### Elements

```oddo
<div />                           // Self-closing
<div></div>                       // With closing tag
<MyComponent />                   // Component (capital letter)
<div className="test"></div>      // With attributes
```

### Attributes

```oddo
<div disabled />                  // Boolean attribute
<div id="main" />                 // String attribute
<div count={42} />                // Expression attribute
<div data-value="x" />            // Hyphenated attribute
<div {...props} />                // Spread attributes
```

### Children

```oddo
<div>Hello World</div>            // Text content
<div>{expression}</div>           // Expression child
<div><span>Nested</span></div>    // Nested elements
<div>{/* comment */}</div>        // Empty expression (comment)
```

### Fragments

```oddo
<>
  <div>First</div>
  <div>Second</div>
</>
```

## Comments

```oddo
// Single line comment
/* Multi-line
   comment */
```

## Code Patterns

### Instead of if/else

```oddo
// Use ternary
result = condition ? valueA : valueB

// Nested ternary for else-if
result = condA ? valueA
       : condB ? valueB
       : defaultValue
```

### Instead of loops

```oddo
// Use array methods
items.map(item => transform(item))
items.filter(item => condition(item))
items.reduce((acc, item) => acc + item, 0)
items.forEach(item => doSomething(item))
```

### Instead of switch

```oddo
// Use object lookup
handlers = {
  case1: () => handleCase1(),
  case2: () => handleCase2(),
}
handlers[key]?.() ?? defaultHandler()

// Or ternary chain
result = key == "case1" ? handleCase1()
       : key == "case2" ? handleCase2()
       : defaultValue
```

## Deprecated (To Be Removed)

The following features are currently implemented but will be removed from the language:

```oddo
// Increment/Decrement operators - DO NOT USE
++a
--a
a++
a--

// Modifier on return statement - DO NOT USE
@modifier return x
```

