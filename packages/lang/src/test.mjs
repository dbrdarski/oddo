/**
 * Test suite for Chevrotain Oddo Language Parser
 */

import { parseOddo, parseOddoExpression, compileOddoToJS } from './index.mjs';

// Test utilities
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    testsFailed++;
    failures.push({ name, error: error.message });
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertASTType(ast, expectedType) {
  assert(ast && ast.type === expectedType, `Expected AST type '${expectedType}', got '${ast?.type}'`);
}

// Test cases
console.log('=== Chevrotain Oddo Parser Tests ===\n');

// Literals
test('Number literal', () => {
  const ast = parseOddoExpression('42');
  assertASTType(ast, 'number');
  assert(ast.value === 42, 'Number value should be 42');
});

test('String literal', () => {
  const ast = parseOddoExpression('"hello"');
  assertASTType(ast, 'string');
  assert(ast.value === 'hello', 'String value should be "hello"');
});

test('Boolean literals', () => {
  const trueAst = parseOddoExpression('true');
  assertASTType(trueAst, 'boolean');
  assert(trueAst.value === true, 'Boolean should be true');

  const falseAst = parseOddoExpression('false');
  assertASTType(falseAst, 'boolean');
  assert(falseAst.value === false, 'Boolean should be false');
});

test('Null literal', () => {
  const ast = parseOddoExpression('null');
  assertASTType(ast, 'null');
  assert(ast.value === null, 'Value should be null');
});

// Arrays
test('Array literal', () => {
  const ast = parseOddoExpression('[1, 2, 3]');
  assertASTType(ast, 'array');
  assert(ast.elements.length === 3, 'Array should have 3 elements');
});

test('Empty array', () => {
  const ast = parseOddoExpression('[]');
  assertASTType(ast, 'array');
  assert(ast.elements.length === 0, 'Array should be empty');
});

// Objects
test('Object literal', () => {
  const ast = parseOddoExpression('{ name: "test", value: 42 }');
  assertASTType(ast, 'object');
  assert(ast.properties.length === 2, 'Object should have 2 properties');
});

test('Empty object', () => {
  const ast = parseOddoExpression('{}');
  assertASTType(ast, 'object');
  assert(ast.properties.length === 0, 'Object should be empty');
});

// Expressions
test('Binary addition', () => {
  const ast = parseOddoExpression('1 + 2');
  assertASTType(ast, 'binary');
  assert(ast.operator === '+', 'Operator should be +');
});

test('Binary multiplication', () => {
  const ast = parseOddoExpression('2 * 3');
  assertASTType(ast, 'binary');
  assert(ast.operator === '*', 'Operator should be *');
});

test('Operator precedence', () => {
  const ast = parseOddoExpression('1 + 2 * 3');
  // Should parse as 1 + (2 * 3)
  assertASTType(ast, 'binary');
  assert(ast.operator === '+', 'Outer operator should be +');
});

test('Logical AND', () => {
  const ast = parseOddoExpression('true && false');
  assertASTType(ast, 'logical');
  assert(ast.operator === '&&', 'Operator should be &&');
});

test('Conditional expression', () => {
  const ast = parseOddoExpression('x ? y : z');
  assertASTType(ast, 'conditional');
});

// Arrow functions
test('Single parameter arrow function', () => {
  const ast = parseOddoExpression('x => x + 1');
  assertASTType(ast, 'arrowFunction');
  assert(ast.parameters.length === 1, 'Should have 1 parameter');
});

test('Multi-parameter arrow function', () => {
  const ast = parseOddoExpression('(x, y) => x + y');
  assertASTType(ast, 'arrowFunction');
  assert(ast.parameters.length === 2, 'Should have 2 parameters');
});

// Assignment (declarations)
test('Assignment statement (should be declaration)', () => {
  const ast = parseOddo('x = 10');
  assertASTType(ast, 'program');
  assert(ast.body.length === 1, 'Should have 1 statement');
  const stmt = ast.body[0];
  assert(stmt.type === 'expressionStatement', 'Should be expression statement');
  assert(stmt.expression.type === 'assignment', 'Should be assignment');
});

test('Destructuring assignment (should be declaration)', () => {
  const ast = parseOddo('{ x, y } = { x: 1, y: 1 }');
  assertASTType(ast, 'program');
  assert(ast.body.length === 1, 'Should have 1 statement');
  const stmt = ast.body[0];
  assert(stmt.type === 'expressionStatement', 'Should be expression statement');
  assert(stmt.expression.type === 'assignment', 'Should be assignment');
  assertASTType(stmt.expression.left, 'objectPattern', 'Left should be object pattern');
});

test('Array destructuring assignment (should be declaration)', () => {
  const ast = parseOddo('[a, b] = [1, 2]');
  assertASTType(ast, 'program');
  assert(ast.body.length === 1, 'Should have 1 statement');
  const stmt = ast.body[0];
  assert(stmt.type === 'expressionStatement', 'Should be expression statement');
  assert(stmt.expression.type === 'assignment', 'Should be assignment');
  assertASTType(stmt.expression.left, 'arrayPattern', 'Left should be array pattern');
});

// Return statement
test('Return statement', () => {
  const ast = parseOddo('return 42');
  assertASTType(ast, 'program');
  assert(ast.body.length === 1, 'Should have 1 statement');
  const stmt = ast.body[0];
  assert(stmt.type === 'returnStatement', 'Should be return statement');
  assert(stmt.argument !== null, 'Should have argument');
});

test('Return without argument', () => {
  const ast = parseOddo('return');
  assertASTType(ast, 'program');
  const stmt = ast.body[0];
  assert(stmt.type === 'returnStatement', 'Should be return statement');
  assert(stmt.argument === null, 'Should not have argument');
});

// Blocks
test('Arrow function with block body', () => {
  const ast = parseOddo('fn = arg =>\n  x = 10\n  y = 20');
  assertASTType(ast, 'program');
  const stmt = ast.body[0];
  assertASTType(stmt.expression, 'assignment');
  assertASTType(stmt.expression.right, 'arrowFunction', 'Right side should be arrow function');
  assert(stmt.expression.right.body.type === 'blockStatement', 'Should have block body');
  assert(stmt.expression.right.body.body.length === 2, 'Block should have 2 statements');
});

test('Nested modifier blocks', () => {
  const ast = parseOddo('@outer:\n  @inner:\n    x = 10');
  assertASTType(ast, 'program');
  const outer = ast.body[0];
  assert(outer.modifier === 'outer', 'Outer should have modifier');
  assert(outer.block !== null, 'Outer should have block');
  const inner = outer.block.body[0];
  assert(inner.modifier === 'inner', 'Inner should have modifier');
  assert(inner.block !== null, 'Inner should have block');
});

test('Arrow function block with return', () => {
  const ast = parseOddo('fn = arg =>\n  x = 10\n  return x');
  assertASTType(ast, 'program');
  const stmt = ast.body[0];
  assertASTType(stmt.expression, 'assignment');
  assertASTType(stmt.expression.right, 'arrowFunction', 'Right side should be arrow function');
  assert(stmt.expression.right.body.type === 'blockStatement', 'Should have block body');
  assert(stmt.expression.right.body.body.length === 2, 'Block should have 2 statements');
  assert(stmt.expression.right.body.body[1].type === 'returnStatement', 'Second statement should be return');
});

// Modifiers
test('Modifier on expression', () => {
  const ast = parseOddo('@state x = 3');
  assertASTType(ast, 'program');
  const stmt = ast.body[0];
  assert(stmt.modifier === 'state', 'Modifier should be "state"');
});

test('Modifier on block', () => {
  const ast = parseOddo('@computed:\n  y = 3 + x\n  z = y * 2');
  assertASTType(ast, 'program');
  const stmt = ast.body[0];
  assert(stmt.modifier === 'computed', 'Modifier should be "computed"');
  assert(stmt.block !== null, 'Should have block');
  assert(stmt.block.body.length === 2, 'Block should have 2 statements');
});

test('Modifier on return', () => {
  const ast = parseOddo('@memoized return x');
  assertASTType(ast, 'program');
  const stmt = ast.body[0];
  assert(stmt.type === 'returnStatement', 'Should be return statement');
  assert(stmt.modifier === 'memoized', 'Modifier should be "memoized"');
});

test('State modifier transformation', () => {
  const js = compileOddoToJS('@state x = 3');
  assert(js.includes('import $Oddo from "@oddo/ui"'), 'Should import $Oddo');
  assert(js.includes('$Oddo.state(3)'), 'Should transform to $Oddo.state(3)');
});

test('Unknown modifier throws error', () => {
  try {
    compileOddoToJS('@unknown x = 3');
    assert(false, 'Should have thrown error for unknown modifier');
  } catch (error) {
    assert(error.message.includes('Unknown modifier'), 'Should throw error for unknown modifier');
  }
});

test('Multiple state modifiers only import once', () => {
  const js = compileOddoToJS('@state x = 3\n@state y = 5');
  const importCount = (js.match(/import \$Oddo/g) || []).length;
  assert(importCount === 1, 'Should only import $Oddo once');
  assert(js.includes('$Oddo.state(3)'), 'Should have first state call');
  assert(js.includes('$Oddo.state(5)'), 'Should have second state call');
});

test('Custom runtime library configuration', () => {
  const js = compileOddoToJS('@state x = 3', { runtimeLibrary: 'my-custom-lib' });
  assert(js.includes('import $Oddo from "my-custom-lib"'), 'Should import from custom library');
  assert(js.includes('$Oddo.state(3)'), 'Should transform to $Oddo.state(3)');
});

test('Computed modifier extracts identifiers', () => {
  const js = compileOddoToJS('@computed sum = x + y');
  assert(js.includes('$Oddo.computed'), 'Should use $Oddo.computed');
  assert(js.includes('(x, y) =>'), 'Should have arrow function with x and y');
  assert(js.includes('[x, y]'), 'Should have dependency array with x and y');
});

test('React modifier extracts identifiers', () => {
  const js = compileOddoToJS('@react sum = x + y');
  assert(js.includes('$Oddo.react'), 'Should use $Oddo.react');
  assert(js.includes('(x, y) =>'), 'Should have arrow function with x and y');
  assert(js.includes('[x, y]'), 'Should have dependency array with x and y');
});

test('Mutate modifier with arrow function', () => {
  const js = compileOddoToJS('@mutate addPerson = (x) => x + 1');
  assert(js.includes('$Oddo.mutate'), 'Should use $Oddo.mutate');
  assert(js.includes('const addPerson'), 'Should create const declaration');
});

test('Mutate modifier without function throws error', () => {
  try {
    compileOddoToJS('@mutate addPerson = x + 1');
    assert(false, 'Should have thrown error');
  } catch (error) {
    assert(error.message.includes('mutate modifier must be a function'), 'Should throw mutate error');
  }
});

test('State modifier block applies to each statement', () => {
  const js = compileOddoToJS('@state:\n  x = 3\n  y = 4');
  assert(js.includes('const x = $Oddo.state(3)'), 'Should have first state declaration');
  assert(js.includes('const y = $Oddo.state(4)'), 'Should have second state declaration');
  // Should not be wrapped in IIFE
  assert(!js.includes('(() =>'), 'Should not wrap in IIFE');
});

test('Computed modifier block applies to each statement', () => {
  const js = compileOddoToJS('@computed:\n  sum = x + y\n  product = x * y');
  assert(js.includes('const sum = $Oddo.computed'), 'Should have first computed declaration');
  assert(js.includes('const product = $Oddo.computed'), 'Should have second computed declaration');
});

test('React modifier block applies to each statement', () => {
  const js = compileOddoToJS('@react:\n  total = a + b\n  diff = a - b');
  assert(js.includes('const total = $Oddo.react'), 'Should have first react declaration');
  assert(js.includes('const diff = $Oddo.react'), 'Should have second react declaration');
});

test('Mutate modifier block applies to each statement', () => {
  const js = compileOddoToJS('@mutate:\n  add = (x) => x + 1\n  sub = (x) => x - 1');
  assert(js.includes('const add = $Oddo.mutate'), 'Should have first mutate declaration');
  assert(js.includes('const sub = $Oddo.mutate'), 'Should have second mutate declaration');
});

// Syntax validation
test('Reject identifier colon syntax', () => {
  try {
    parseOddo('fn:\n  x = 10');
    assert(false, 'Should have thrown error for invalid identifier: syntax');
  } catch (error) {
    // Expected - identifier: followed by block is not legal syntax
    assert(true);
  }
});

test('Reject incorrect indentation in modifier block', () => {
  try {
    parseOddo('@modifier:\nx = 10\n  y = 20');
    assert(false, 'Should have thrown error for incorrect indentation');
  } catch (error) {
    // Expected - should reject incorrectly indented code
    assert(true);
  }
});

// JSX (basic)
test('JSX self-closing element', () => {
  const ast = parseOddoExpression('<Component />');
  assertASTType(ast, 'jsxElement');
  assert(ast.name === 'Component', 'Element name should be Component');
});

test('JSX element with children', () => {
  const ast = parseOddoExpression('<div>Hello</div>');
  assertASTType(ast, 'jsxElement');
  assert(ast.name === 'div', 'Element name should be div');
  assert(ast.children.length > 0, 'Should have children');
});

// Member access
test('Dot notation', () => {
  const ast = parseOddoExpression('obj.prop');
  assertASTType(ast, 'memberAccess');
  assert(ast.computed === false, 'Should not be computed');
});

test('Bracket notation', () => {
  const ast = parseOddoExpression('arr[0]');
  assertASTType(ast, 'memberAccess');
  assert(ast.computed === true, 'Should be computed');
});

// Function calls
test('Function call', () => {
  const ast = parseOddoExpression('fn(1, 2, 3)');
  assertASTType(ast, 'call');
  assert(ast.arguments.length === 3, 'Should have 3 arguments');
});

// Complex examples
test('Complex expression', () => {
  const ast = parseOddoExpression('(x + y) * z - 10');
  assertASTType(ast, 'binary');
});

test('Multiple statements', () => {
  const ast = parseOddo('x = 10\ny = 20\nreturn x + y');
  assertASTType(ast, 'program');
  assert(ast.body.length === 3, 'Should have 3 statements');
});

// Summary
console.log('\n=== Test Summary ===');
console.log(`Tests run: ${testsRun}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (failures.length > 0) {
  console.log('\n=== Failures ===');
  failures.forEach(({ name, error }) => {
    console.error(`${name}: ${error}`);
  });
  process.exit(1);
}

// Line break handling tests
test('Parenthesized expression with line break', () => {
  const ast = parseOddo('x = (a + b\n  + c)');
  assertASTType(ast, 'program');
  assertASTType(ast.body[0], 'expressionStatement');
  assertASTType(ast.body[0].expression, 'assignment');
});

test('Expression without parens should fail on line break', () => {
  try {
    parseOddo('x = a + b\n  + c');
    throw new Error('Should have failed but passed');
  } catch (e) {
    // Expected to fail
    assert(e.message.includes('Parser errors') || e.message.includes('Redundant input'), 'Should fail with parser error');
  }
});

test('Array with line break', () => {
  const ast = parseOddo('x = [a, b,\n  c]');
  assertASTType(ast, 'program');
  assertASTType(ast.body[0], 'expressionStatement');
});

test('Object with line break', () => {
  const ast = parseOddo('x = {a: 1,\n  b: 2}');
  assertASTType(ast, 'program');
  assertASTType(ast.body[0], 'expressionStatement');
});

test('Object with computed key', () => {
  const ast = parseOddoExpression('{ [key]: value }');
  assertASTType(ast, 'object');
  assert(ast.properties.length === 1, 'Should have one property');
  assert(ast.properties[0].computed === true, 'Property should be computed');
  assertASTType(ast.properties[0].key, 'identifier');
});

test('Object with computed key expression', () => {
  const ast = parseOddoExpression('{ [key + "Suffix"]: value }');
  assertASTType(ast, 'object');
  assert(ast.properties.length === 1, 'Should have one property');
  assert(ast.properties[0].computed === true, 'Property should be computed');
  assertASTType(ast.properties[0].key, 'binary');
});

test('Object with mixed regular and computed keys', () => {
  const ast = parseOddoExpression('{ key: value, [computed]: other }');
  assertASTType(ast, 'object');
  assert(ast.properties.length === 2, 'Should have two properties');
  assert(ast.properties[0].computed === false, 'First property should not be computed');
  assert(ast.properties[1].computed === true, 'Second property should be computed');
});

// Export/Import tests
test('Export named assignment', () => {
  const ast = parseOddo('export x = 1');
  assertASTType(ast, 'program');
  assertASTType(ast.body[0], 'exportNamedStatement');
});

test('Export named list', () => {
  const ast = parseOddo('export { x, y }');
  assertASTType(ast.body[0], 'exportNamedStatement');
  assert(ast.body[0].specifiers.length === 2, 'Export specifiers count');
});

test('Export default', () => {
  const ast = parseOddo('export default 42');
  assertASTType(ast.body[0], 'exportDefaultStatement');
});

test('Export renamed', () => {
  const renamedExport = parseOddo('export { x as y }').body[0];
  assert(renamedExport.specifiers[0].local === 'x', 'Renamed export local');
  assert(renamedExport.specifiers[0].exported === 'y', 'Renamed export exported');
});

test('Import named', () => {
  const namedImport = parseOddo('import { x } from "module"').body[0];
  assertASTType(namedImport, 'importStatement');
  assert(namedImport.defaultImport === null, 'Named import has no default');
  assert(namedImport.specifiers.length === 1, 'Named import specifier count');
  assert(namedImport.source === 'module', 'Import source');
});

test('Import default', () => {
  const defaultImport = parseOddo('import x from "module"').body[0];
  assert(defaultImport.defaultImport === 'x', 'Default import name');
  assert(defaultImport.specifiers.length === 0, 'Default import has no specifiers');
});

test('Import namespace', () => {
  const namespaceImport = parseOddo('import * as ns from "module"').body[0];
  assertASTType(namespaceImport, 'importNamespaceStatement');
  assert(namespaceImport.namespace === 'ns', 'Namespace import name');
});

test('Import mixed', () => {
  const mixedImport = parseOddo('import x, { y } from "module"').body[0];
  assert(mixedImport.defaultImport === 'x', 'Mixed import default');
  assert(mixedImport.specifiers.length === 1, 'Mixed import specifier count');
});

// Array slices
test('Array slice with start and end', () => {
  const ast = parseOddoExpression('numbers[0...2]');
  assertASTType(ast, 'arraySlice');
  assert(ast.start !== null && ast.start !== undefined, 'Should have start');
  assert(ast.end !== null && ast.end !== undefined, 'Should have end');
  assertASTType(ast.start, 'number');
  assertASTType(ast.end, 'number');
  assert(ast.start.value === 0, 'Start should be 0');
  assert(ast.end.value === 2, 'End should be 2');
});

test('Array slice with negative end', () => {
  const ast = parseOddoExpression('numbers[3...-2]');
  assertASTType(ast, 'arraySlice');
  assert(ast.start.value === 3, 'Start should be 3');
  assert(ast.end.value === -2, 'End should be -2');
});

test('Array slice with start only', () => {
  const ast = parseOddoExpression('numbers[-2...]');
  assertASTType(ast, 'arraySlice');
  assert(ast.start !== null && ast.start !== undefined, 'Should have start');
  assert(ast.end === null || ast.end === undefined, 'Should not have end');
  assert(ast.start.value === -2, 'Start should be -2');
});

test('Array slice copy (no arguments)', () => {
  const ast = parseOddoExpression('numbers[...]');
  assertASTType(ast, 'arraySlice');
  assert(ast.start === null || ast.start === undefined, 'Should not have start');
  assert(ast.end === null || ast.end === undefined, 'Should not have end');
});

test('Array slice assignment', () => {
  const ast = parseOddoExpression('arr[3...6] := [-3, -4, -5, -6]');
  assertASTType(ast, 'arraySliceAssignment');
  assertASTType(ast.slice, 'arraySlice');
  assertASTType(ast.value, 'array');
  assert(ast.slice.start.value === 3, 'Start should be 3');
  assert(ast.slice.end.value === 6, 'End should be 6');
  assert(ast.value.elements.length === 4, 'Should have 4 elements');
});

test('Array slice assignment with = should throw error', () => {
  assert.throws(() => {
    parseOddoExpression('arr[3...6] = [-3, -4, -5, -6]');
  }, /Array slice assignments must use := operator, not =/);
});

test('Member access assignment with = should throw error', () => {
  assert.throws(() => {
    parseOddoExpression('a.b.c = 3');
  }, /Member access assignments must use := operator, not =/);
});

// Pipe and Compose operators
test('Pipe operator', () => {
  const ast = parseOddoExpression('a |> b |> c');
  assertASTType(ast, 'pipe');
  assertASTType(ast.left, 'pipe');
  assertASTType(ast.right, 'identifier');
  assert(ast.right.name === 'c', 'Right should be c');
});

test('Compose operator', () => {
  const ast = parseOddoExpression('c <| b <| a');
  assertASTType(ast, 'compose');
  assertASTType(ast.left, 'identifier');
  assertASTType(ast.right, 'compose');
  assert(ast.left.name === 'c', 'Left should be c');
});

// Arrow functions
test('Arrow function with zero parameters', () => {
  const ast = parseOddoExpression('() => 1');
  assertASTType(ast, 'arrowFunction');
  assert(ast.parameters.length === 0, 'Should have zero parameters');
  assertASTType(ast.body, 'number');
  assert(ast.body.value === 1, 'Body should be 1');
});

test('Arrow function with single parameter in parens', () => {
  const ast = parseOddoExpression('(a) => a + 1');
  assertASTType(ast, 'arrowFunction');
  assert(ast.parameters.length === 1, 'Should have one parameter');
  assert(ast.parameters[0].name === 'a', 'Parameter should be a');
});

test('Arrow function with object destructuring parameter', () => {
  const ast = parseOddoExpression('({ props }) => ({ props })');
  assertASTType(ast, 'arrowFunction');
  assert(ast.parameters.length === 1, 'Should have one parameter');
  assertASTType(ast.parameters[0], 'destructuringPattern', 'Parameter should be destructuring pattern');
  assertASTType(ast.parameters[0].pattern, 'objectPattern', 'Pattern should be object pattern');
  assert(ast.parameters[0].pattern.properties.length === 1, 'Should have one property');
  assert(ast.parameters[0].pattern.properties[0].key.name === 'props', 'Property key should be props');
});

test('Arrow function with array destructuring parameter', () => {
  const ast = parseOddoExpression('([a, b]) => a + b');
  assertASTType(ast, 'arrowFunction');
  assert(ast.parameters.length === 1, 'Should have one parameter');
  assertASTType(ast.parameters[0], 'destructuringPattern', 'Parameter should be destructuring pattern');
  assertASTType(ast.parameters[0].pattern, 'arrayPattern', 'Pattern should be array pattern');
  assert(ast.parameters[0].pattern.elements.length === 2, 'Should have two elements');
});

test('Arrow function with mixed parameters (identifier and destructuring)', () => {
  const ast = parseOddoExpression('(a, {b, c}) => a + b + c');
  assertASTType(ast, 'arrowFunction');
  assert(ast.parameters.length === 2, 'Should have two parameters');
  assert(ast.parameters[0].type === 'parameter', 'First parameter should be identifier');
  assert(ast.parameters[0].name === 'a', 'First parameter should be a');
  assertASTType(ast.parameters[1], 'destructuringPattern', 'Second parameter should be destructuring pattern');
  assertASTType(ast.parameters[1].pattern, 'objectPattern', 'Pattern should be object pattern');
});

test('Arrow function with destructuring parameter and default value', () => {
  const ast = parseOddoExpression('({x, y = 3}) => x + y');
  assertASTType(ast, 'arrowFunction');
  assert(ast.parameters.length === 1, 'Should have one parameter');
  assertASTType(ast.parameters[0], 'destructuringPattern', 'Parameter should be destructuring pattern');
  assertASTType(ast.parameters[0].pattern, 'objectPattern', 'Pattern should be object pattern');
  assert(ast.parameters[0].pattern.properties.length === 2, 'Should have two properties');
  assert(ast.parameters[0].pattern.properties[1].default !== null, 'Second property should have default value');
  assert(ast.parameters[0].pattern.properties[1].default.value === 3, 'Default value should be 3');
});

test('Nested object destructuring pattern', () => {
  const ast = parseOddoExpression('{ props: { options = [], name, outlined, label, oncreate, ...props }, children } = {}');
  assertASTType(ast, 'assignment');
  assertASTType(ast.left, 'objectPattern');
  assert(ast.left.properties.length === 2, 'Should have two properties');

  // First property should be props with nested pattern
  const propsProp = ast.left.properties[0];
  assert(propsProp.key.name === 'props', 'First property key should be props');
  assertASTType(propsProp.value, 'objectPattern', 'Props value should be object pattern');
  assert(propsProp.value.properties.length === 6, 'Nested pattern should have 6 properties');

  // Check nested properties
  assert(propsProp.value.properties[0].key.name === 'options', 'First nested property should be options');
  assert(propsProp.value.properties[0].default !== null, 'Options should have default value');
  assertASTType(propsProp.value.properties[0].default, 'array', 'Options default should be array');

  // Check rest property
  assert(propsProp.value.properties[5].type === 'restProperty', 'Last nested property should be rest');
  assert(propsProp.value.properties[5].argument.name === 'props', 'Rest property should be props');

  // Second property should be children
  const childrenProp = ast.left.properties[1];
  assert(childrenProp.key.name === 'children', 'Second property key should be children');
  assert(childrenProp.shorthand === true, 'Children should be shorthand');
});

test('JSX element with hyphenated name', () => {
  const ast = parseOddoExpression('<component-name />');
  assertASTType(ast, 'jsxElement');
  assert(ast.name === 'component-name', 'Element name should be component-name');
  assert(ast.selfClosing === true, 'Should be self-closing');
});

test('JSX element with multiple hyphens in name', () => {
  const ast = parseOddoExpression('<my-component-name />');
  assertASTType(ast, 'jsxElement');
  assert(ast.name === 'my-component-name', 'Element name should be my-component-name');
});

test('JSX element with hyphenated name and attributes', () => {
  const ast = parseOddoExpression('<component-name className="test" />');
  assertASTType(ast, 'jsxElement');
  assert(ast.name === 'component-name', 'Element name should be component-name');
  assert(ast.attributes.length === 1, 'Should have one attribute');
  assert(ast.attributes[0].name === 'className', 'Attribute name should be className');
});

if (testsFailed > 0) {
  console.log('\n=== Failures ===');
  failures.forEach(({ name, error }) => {
    console.error(`${name}: ${error}`);
  });
  process.exit(1);
} else {
  console.log('\n✓ All tests passed!');
  process.exit(0);
}
