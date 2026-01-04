# Oddo Language Specification

Oddo is a JavaScript dialect designed for parsing and manipulation. It supports a subset of JavaScript features with a focus on expressions, data structures, and basic control flow.

## Table of Contents

1. [Overview](#overview)
2. [Data Types](#data-types)
3. [Literals](#literals)
4. [Expressions](#expressions)
5. [Operators](#operators)
6. [Statements](#statements)
7. [Syntax Examples](#syntax-examples)
8. [AST Structure](#ast-structure)

## Overview

Oddo is a functional, expression-oriented language that supports:
- Primitive data types (booleans, numbers, strings, null)
- Referential data types (arrays, objects, functions)
- JSX syntax for declarative UI
- All JavaScript operators with correct precedence
- Arrow function syntax
- Basic control flow statements
- Variable declarations

## Data Types

### Primitive Data Types

#### Booleans
- Values: `true`, `false`
- Type: `boolean`

#### Numbers
- Integer and floating-point numbers
- Examples: `42`, `3.14`, `-10`, `0.5`
- Type: `number`

#### Strings
- Double-quoted string literals
- Examples: `"hello"`, `"world"`, `"test"`
- Type: `string`

#### Null
- The `null` value
- Type: `null`

### Referential Data Types

#### Arrays
- Ordered collections of values
- Syntax: `[element1, element2, ...]`
- Elements can be any expression
- Type: `array`

#### Objects
- Key-value pairs
- Syntax: `{ key: value, ... }` or `{ prop }` (shorthand) or `{ [expr]: value }` (computed key)
- Keys can be identifiers, string literals, or computed expressions (in brackets)
- Values can be any expression
- Supports shorthand property syntax: `{ name }` is equivalent to `{ name: name }`
- Supports computed keys: `{ [key]: value }` or `{ [key + "Suffix"]: value }`
- Type: `object`

#### Functions
- Arrow function syntax only
- Syntax: `(param1, param2, ...) => expression` or `param => expression`
- Single parameter can omit parentheses
- Type: `arrowFunction`

#### JSX Elements
- JSX (JavaScript XML) syntax for declarative UI
- Syntax: `<TagName>`, `<Component>`, `<div className="test">`, etc.
- Supports attributes, children, self-closing tags, and expressions
- Type: `jsxElement`

## Literals

### Boolean Literals
```
true
false
```

### Number Literals
```
42
3.14
-10
0.5
```

### String Literals
```
"hello"
"world"
"test with spaces"
```

### Null Literal
```
null
```

### Array Literals
```
[]
[1, 2, 3]
[1, "two", true, null]
```

### Object Literals
```
{}
{ name: "test" }
{ name: "test", value: 42 }
{ name }  // shorthand for { name: name }
{ "key": "value" }
{ [key]: value }  // computed key
{ [key + "Suffix"]: value }  // computed key with expression
{ key: value, [computed]: other }  // mixed regular and computed keys
```

### Arrow Function Literals
```
x => x + 1
(x, y) => x + y
() => 42
x => { return x }
```

### JSX Element Literals
```
<div></div>
<Component />
<div className="test">Hello</div>
<div id="main" data-value={42}>Content</div>
<div>{expression}</div>
<Button onClick={handler}>Click me</Button>
<div>
  <span>Nested</span>
  <span>Elements</span>
</div>
<div {...props} />
```

## Expressions

### Primary Expressions
Primary expressions are the building blocks of all expressions:
- Literals (booleans, numbers, strings, null)
- Array literals
- Object literals
- Arrow functions
- JSX elements
- Parenthesized expressions: `(expression)`
- Identifiers: variable references

### Member Access
Access properties of objects or elements of arrays:
- Dot notation: `obj.property`
- Bracket notation: `arr[0]`, `obj["key"]`
- Chained access: `obj.prop.subprop`, `arr[0].value`

### Function Calls
Call functions with arguments:
- `fn()`
- `fn(arg1, arg2, arg3)`
- `obj.method(arg1, arg2)`
- `arr[0](arg)`

### Postfix Operators
- Increment: `x++`
- Decrement: `x--`

### Unary Operators
- Unary plus: `+x`
- Unary minus: `-x`
- Logical NOT: `!x`
- Bitwise NOT: `~x`
- Typeof: `typeof x`
- Void: `void x`
- Delete: `delete x`

### Prefix Operators
- Pre-increment: `++x`
- Pre-decrement: `--x`

### Exponentiation
- Right-associative: `x ** y ** z` is `x ** (y ** z)`

### Multiplicative Operators
- Multiplication: `x * y`
- Division: `x / y`
- Remainder: `x % y`

### Additive Operators
- Addition: `x + y`
- Subtraction: `x - y`

### Relational Operators
- Less than: `x < y`
- Greater than: `x > y`
- Less than or equal: `x <= y`
- Greater than or equal: `x >= y`
- Instanceof: `x instanceof y`
- In: `x in y`

### Equality Operators
- Equal: `x == y` (compiles to `===` in JavaScript)
- Not equal: `x != y` (compiles to `!==` in JavaScript)

Note: Oddo only supports `==` and `!=` operators, which are compiled to strict equality (`===` and `!==`) in JavaScript. This simplifies the language by always using strict equality semantics.

### Logical Operators
- Logical AND: `x && y`
- Logical OR: `x || y`

### Conditional Operator
- Ternary: `condition ? valueIfTrue : valueIfFalse`

### Assignment Operators
- Assignment: `x = y`
- Addition assignment: `x += y`
- Subtraction assignment: `x -= y`
- Multiplication assignment: `x *= y`
- Division assignment: `x /= y`
- Remainder assignment: `x %= y`
- Exponentiation assignment: `x **= y`
- Left shift assignment: `x <<= y`
- Right shift assignment: `x >>= y`
- Unsigned right shift assignment: `x >>>= y`
- Bitwise AND assignment: `x &= y`
- Bitwise XOR assignment: `x ^= y`
- Bitwise OR assignment: `x |= y`

## Operators

### Operator Precedence (highest to lowest)

1. **Primary Expressions**
   - Literals, identifiers, parenthesized expressions, arrays, objects, arrow functions, JSX elements

2. **Member Access**
   - `.` (dot notation), `[]` (bracket notation)

3. **Function Calls**
   - `()` (function invocation)

4. **Postfix Operators**
   - `++`, `--`

5. **Unary Operators**
   - `+`, `-`, `!`, `~`, `typeof`, `void`, `delete`

6. **Prefix Operators**
   - `++`, `--`

7. **Exponentiation** (right-associative)
   - `**`

8. **Multiplicative**
   - `*`, `/`, `%`

9. **Additive**
   - `+`, `-`

10. **Relational**
    - `<`, `>`, `<=`, `>=`, `instanceof`, `in`

11. **Equality**
    - `==`, `!=` (compiled to `===`, `!==` in JavaScript)

12. **Logical AND**
    - `&&`

13. **Logical OR**
    - `||`

14. **Conditional** (right-associative)
    - `? :`

15. **Assignment** (right-associative)
    - `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `<<=`, `>>=`, `>>>=`, `&=`, `^=`, `|=`

### Operator Associativity

- **Right-associative**: Exponentiation (`**`), Conditional (`? :`), Assignment operators
- **Left-associative**: All other operators

## Statements

### Expression Statement
Any expression can be used as a statement:
```
x + y
fn()
```

### Variable Declaration
Declare variables with optional initialization:
```
x = 10
```

### Return Statement
Return a value from a function:
```
return
return x
return x + y
```

### Block Statement
Group multiple statements using indentation (Python-style):
```
fn:
  x = 10
  y = 20
  return x + y
```

Blocks start with a colon `:` after an expression and continue with indented statements. The indentation level must be consistent (typically 2 spaces or 1 tab more than the parent).

### Modifiers
Modifiers provide metadata or behavior annotations for expressions and blocks:
```
@state x = 3
@computed:
  y = 3 + x
  z = y * 2
```

Modifiers start with `@` followed by an identifier, and can be applied to:
- **Expressions**: `@modifier expression`
- **Blocks**: `@modifier:\n  ...block...`

Modifiers are optional and can appear before any statement.

### Program
A program is a sequence of statements:
```
statement1
statement2
statement3
```

## Syntax Examples

### Arithmetic Expressions
```javascript
1 + 2 * 3           // 7 (multiplication first)
(1 + 2) * 3         // 9 (parentheses)
2 ** 3 ** 2         // 512 (right-associative: 2 ** (3 ** 2))
```

### Logical Expressions
```javascript
true && false       // false
true || false       // true
!true               // false
x ? y : z           // conditional
```

### String Operations
```javascript
"hello" + " " + "world"  // "hello world"
```

### Arrays
```javascript
[1, 2, 3]
[1, "two", true]
[]
```

### Objects
```javascript
{ name: "test", value: 42 }
{ name }                    // shorthand
{ "key": "value" }
{}
```

### Arrow Functions
```javascript
x => x + 1
(x, y) => x + y
() => 42
```

### JSX Elements
```javascript
<div></div>
<Component />
<div className="test">Hello</div>
<div id="main" data-value={42}>Content</div>
<div>{expression}</div>
<Button onClick={handler}>Click me</Button>
<div>
  <span>Nested</span>
  <span>Elements</span>
</div>
<div {...props} />
```

### Member Access
```javascript
obj.property
arr[0]
obj["key"]
obj.prop.subprop
arr[0].value
```

### Function Calls
```javascript
fn()
fn(1, 2, 3)
obj.method(arg)
arr[0](arg)
```

### Variable Declarations
```javascript
x = 10
y = 20
z = 30
```

### Control Flow
```javascript
fn:
  x = 10
  y = 20
  return x + y

outer:
  inner:
    x = 10
    return x
```

Blocks use indentation-based scoping. Statements indented more than the parent belong to that block. Object literals and JSX still use braces `{}` as they are data structures, not scoping constructs.

## AST Structure

The parser generates an Abstract Syntax Tree (AST) with the following node types:

### Expression Nodes

#### Literals
- `{ type: 'boolean', value: boolean }`
- `{ type: 'number', value: number }`
- `{ type: 'string', value: string }`
- `{ type: 'null', value: null }`

#### Arrays
- `{ type: 'array', elements: Expression[] }`

#### Objects
- `{ type: 'object', properties: Property[] }`
- `{ type: 'property', key: Expression, value: Expression, shorthand: boolean, computed: boolean }`
  - `computed`: `true` if the key is computed (e.g., `[expr]`), `false` otherwise

#### Arrow Functions
- `{ type: 'arrowFunction', parameters: Parameter[], body: Expression }`
- `{ type: 'parameter', name: string }`

#### JSX Elements
- `{ type: 'jsxElement', name: string, attributes: JSXAttribute[], children: JSXChild[] }`
- `{ type: 'jsxAttribute', name: string, value: Expression | string | null }`
- `{ type: 'jsxSpread', expression: Expression }`
- `{ type: 'jsxText', value: string }`
- `{ type: 'jsxExpression', expression: Expression }`

#### Identifiers
- `{ type: 'identifier', name: string }`

#### Member Access
- `{ type: 'memberAccess', object: Expression, property: Expression | string, computed: boolean }`

#### Function Calls
- `{ type: 'call', callee: Expression, arguments: Expression[] }`

#### Unary Operations
- `{ type: 'unary', operator: string, operand: Expression }`
- `{ type: 'prefix', operator: string, operand: Expression }`
- `{ type: 'postfix', operator: string, operand: Expression }`

#### Binary Operations
- `{ type: 'binary', operator: string, left: Expression, right: Expression }`

#### Logical Operations
- `{ type: 'logical', operator: string, left: Expression, right: Expression }`

#### Conditional
- `{ type: 'conditional', test: Expression, consequent: Expression, alternate: Expression }`

#### Assignment
- `{ type: 'assignment', operator: string, left: Expression, right: Expression }`

### Statement Nodes

#### Expression Statement
- `{ type: 'expressionStatement', modifier: string | null, expression: Expression | null, block: BlockStatement | null }`
  - `modifier`: Optional modifier name (e.g., "state", "computed")
  - `expression`: The expression (null if modifier is on block only)
  - `block`: Optional block statement (null if no block)

#### Variable Declaration
- `{ type: 'variableDeclaration', kind: 'let' | 'const' | 'var', name: string, init: Expression | null }`
- `{ type: 'variableStatement', declaration: VariableDeclaration }`

#### Return Statement
- `{ type: 'returnStatement', modifier: string | null, argument: Expression | null }`

#### Block Statement
- `{ type: 'blockStatement', body: Statement[] }`

#### If Statement
- `{ type: 'ifStatement', test: Expression, consequent: Statement, alternate: Statement | null }`

#### Program
- `{ type: 'program', body: Statement[] }`

## Notes

- Oddo is a parsing-focused language and does not include runtime semantics
- All operators follow JavaScript precedence and associativity rules
- Arrow functions support both single-parameter (without parentheses) and multi-parameter (with parentheses) syntax
- Object literals support both key-value pairs and shorthand property syntax
- Variable declarations support `let`, `const`, and `var` keywords
- The language supports nested expressions and statements
- Whitespace is generally ignored (handled by tokenization)
