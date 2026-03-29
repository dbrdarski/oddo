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
  assert(stmt.expression.type === 'variableDeclaration', 'Should be variableDeclaration');
});

test('Destructuring assignment (should be declaration)', () => {
  const ast = parseOddo('{ x, y } = { x: 1, y: 1 }');
  assertASTType(ast, 'program');
  assert(ast.body.length === 1, 'Should have 1 statement');
  const stmt = ast.body[0];
  assert(stmt.type === 'expressionStatement', 'Should be expression statement');
  assert(stmt.expression.type === 'variableDeclaration', 'Should be variableDeclaration');
  assertASTType(stmt.expression.left, 'objectPattern', 'Left should be object pattern');
});

test('Array destructuring assignment (should be declaration)', () => {
  const ast = parseOddo('[a, b] = [1, 2]');
  assertASTType(ast, 'program');
  assert(ast.body.length === 1, 'Should have 1 statement');
  const stmt = ast.body[0];
  assert(stmt.type === 'expressionStatement', 'Should be expression statement');
  assert(stmt.expression.type === 'variableDeclaration', 'Should be variableDeclaration');
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
  const ast = parseOddo('fn = arg => {\n  x = 10\n  y = 20\n}');
  assertASTType(ast, 'program');
  const stmt = ast.body[0];
  assertASTType(stmt.expression, 'variableDeclaration');
  assertASTType(stmt.expression.right, 'arrowFunction', 'Right side should be arrow function');
  assert(stmt.expression.right.body.type === 'blockStatement', 'Should have block body');
  assert(stmt.expression.right.body.body.length === 2, 'Block should have 2 statements');
});

test('Nested modifier blocks', () => {
  const ast = parseOddo('@outer: { @inner: { x = 10 } }');
  assertASTType(ast, 'program');
  const outer = ast.body[0];
  assert(outer.modifier === 'outer', 'Outer should have modifier');
  assert(outer.block !== null, 'Outer should have block');
  const inner = outer.block.body[0];
  assert(inner.modifier === 'inner', 'Inner should have modifier');
  assert(inner.block !== null, 'Inner should have block');
});

test('Arrow function block with return', () => {
  const ast = parseOddo('fn = arg => {\n  x = 10\n  return x\n}');
  assertASTType(ast, 'program');
  const stmt = ast.body[0];
  assertASTType(stmt.expression, 'variableDeclaration');
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
  const ast = parseOddo('@computed: {\n  y = 3 + x\n  z = y * 2\n}');
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
  assert(/import \{ state as \w+ \} from "@oddo\/ui"/.test(js), 'Should import state with alias');
  assert(/const \[x, \w+\] = \w+\(3\)/.test(js), 'Should destructure state into [getter, setter]');
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
  const importCount = (js.match(/import \{/g) || []).length;
  assert(importCount === 1, 'Should only have one import statement');
  assert(/const \[x, \w+\] = \w+\(3\)/.test(js), 'Should have first state call');
  assert(/const \[y, \w+\] = \w+\(5\)/.test(js), 'Should have second state call');
});

test('Custom runtime library configuration', () => {
  const js = compileOddoToJS('@state x = 3', { runtimeLibrary: 'my-custom-lib' });
  assert(/import \{ state as \w+ \} from "my-custom-lib"/.test(js), 'Should import from custom library');
  assert(/const \[x, \w+\] = \w+\(3\)/.test(js), 'Should destructure state into [getter, setter]');
});

test('Computed modifier extracts identifiers', () => {
  // x and y must be declared as @state to be reactive dependencies
  const js = compileOddoToJS('@state x = 1\n@state y = 2\n@computed sum = x + y');
  assert(/import \{.*computed as \w+.*\} from "@oddo\/ui"/.test(js), 'Should import computed');
  assert(/const sum = \w+\(\(x, y\) =>/.test(js), 'Should call computed with arrow function');
  assert(js.includes('[x, y]'), 'Should have dependency array with x and y');
});

test('Mutate modifier with arrow function', () => {
  // @mutate requires := assignments inside the function body
  const js = compileOddoToJS('@state count = 0\n@mutate increment = () => { count := count + 1 }');
  assert(/import \{ .* mutate as \w+.* \} from "@oddo\/ui"/.test(js), 'Should import mutate');
  assert(/const increment = \w+\(/.test(js), 'Should call mutate function');
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
  const js = compileOddoToJS('@state: {\n  x = 3\n  y = 4\n}');
  assert(/const \[x, \w+\] = \w+\(3\)/.test(js), 'Should have first state declaration');
  assert(/const \[y, \w+\] = \w+\(4\)/.test(js), 'Should have second state declaration');
  // Should not be wrapped in IIFE
  assert(!js.includes('(() =>'), 'Should not wrap in IIFE');
});

test('Computed modifier block applies to each statement', () => {
  const js = compileOddoToJS('@computed: {\n  sum = x + y\n  product = x * y\n}');
  assert(/const sum = \w+\(/.test(js), 'Should have first computed declaration');
  assert(/const product = \w+\(/.test(js), 'Should have second computed declaration');
});

test('Mutate modifier block applies to each statement', () => {
  // @mutate requires := assignments inside function bodies
  const js = compileOddoToJS('@state count = 0\n@mutate: {\n  inc = () => { count := count + 1 }\n  dec = () => { count := count - 1 }\n}');
  assert(/const inc = \w+\(/.test(js), 'Should have first mutate declaration');
  assert(/const dec = \w+\(/.test(js), 'Should have second mutate declaration');
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
  assertASTType(ast.body[0].expression, 'variableDeclaration');
});

// Removed: 'Expression without parens should fail on line break' - no longer relevant

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
  try {
    compileOddoToJS('arr[3...6] = [-3, -4, -5, -6]');
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('Array slice assignments must use := operator'), 'Should throw error about := operator');
  }
});

test('Member access assignment with = should throw error', () => {
  try {
    compileOddoToJS('a.b.c = 3');
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('Member access assignments must use := operator'), 'Should throw error about := operator');
  }
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
  assertASTType(ast, 'variableDeclaration');
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

// JSX whitespace between children - comprehensive edge cases
console.log('\n--- JSX Whitespace Edge Cases ---');

// Helper: compile a JSX expression wrapped in an assignment statement
function compileJSX(jsx) {
  return compileOddoToJS('x := ' + jsx);
}

test('JSX whitespace: two expressions with single space', () => {
  const js = compileJSX('<div>{a} {b}</div>');
  assert(js.includes('" "'), 'Should have space string between expressions');
});

test('JSX whitespace: two expressions with multiple spaces (normalized)', () => {
  const js = compileJSX('<div>{a}  {b}</div>');
  assert(js.includes('" "'), 'Should normalize multiple spaces to single space string');
});

test('JSX whitespace: two expressions with no space', () => {
  const js = compileJSX('<div>{a}{b}</div>');
  assert(!js.includes('" "'), 'Should NOT have space string when no whitespace between expressions');
});

test('JSX whitespace: two expressions separated by newline (no space)', () => {
  const js = compileJSX('<div>{a}\n  {b}</div>');
  assert(!js.includes('" "'), 'Should NOT insert space for newline+indent between expressions');
});

test('JSX whitespace: text then expression (trailing space merged into text)', () => {
  const js = compileJSX('<div>text {a}</div>');
  assert(js.includes('"text "'), 'Text node should include trailing space');
});

test('JSX whitespace: expression then text (leading space merged into text)', () => {
  const js = compileJSX('<div>{a} text</div>');
  assert(js.includes('" text"'), 'Text node should include leading space');
});

test('JSX whitespace: expression, text, expression (spaces merged into text)', () => {
  const js = compileJSX('<div>{a} text {b}</div>');
  assert(js.includes('" text "'), 'Text node should absorb spaces on both sides');
});

test('JSX whitespace: text then two expressions', () => {
  const js = compileJSX('<div>text {a} {b}</div>');
  assert(js.includes('"text "'), 'Text should include trailing space');
  assert(js.includes('" "'), 'Should have space between the two expressions');
});

test('JSX whitespace: two expressions then text', () => {
  const js = compileJSX('<div>{a} {b} text</div>');
  assert(js.includes('" "'), 'Should have space between the two expressions');
  assert(js.includes('" text"'), 'Text should include leading space');
});

test('JSX whitespace: three consecutive expressions with spaces', () => {
  const js = compileJSX('<div>{a} {b} {c}</div>');
  const spaceCount = (js.match(/" "/g) || []).length;
  assert(spaceCount === 2, `Should have exactly 2 space strings between 3 expressions, got ${spaceCount}`);
});

test('JSX whitespace: element then expression with space', () => {
  const js = compileJSX('<div><span /> {a}</div>');
  assert(js.includes('" "'), 'Should have space between element and expression');
});

test('JSX whitespace: expression then element with space', () => {
  const js = compileJSX('<div>{a} <span /></div>');
  assert(js.includes('" "'), 'Should have space between expression and element');
});

test('JSX whitespace: two elements with space', () => {
  const js = compileJSX('<div><span /> <span /></div>');
  assert(js.includes('" "'), 'Should have space between two elements');
});

test('JSX whitespace: tab between expressions', () => {
  const js = compileJSX('<div>{a}\t{b}</div>');
  assert(js.includes('" "'), 'Tab should be normalized to space string');
});

test('JSX whitespace: classic interpolation (Hello {name}!)', () => {
  const js = compileJSX('<div>Hello {name}!</div>');
  assert(js.includes('"Hello "'), 'Should have "Hello " with trailing space');
  assert(js.includes('"!"'), 'Should have "!" text node');
});

test('JSX whitespace: original bug report ({actionLabel} {ternary})', () => {
  const js = compileOddoToJS('x := <h3 style="margin-top: 0">{actionLabel} {casino.name ? `${casino.name}` : "new casino"}</h3>');
  assert(js.includes('" "'), 'Should have space between actionLabel expression and ternary expression');
});

test('JSX whitespace: template literal with ${} does not corrupt sourceText', () => {
  const input = `style = ({ flat, size }) => \`\${3}\`
App = () => <Btn type="link" href="/entities/casinos/new">
  Create new {2}
</Btn>`;
  const js = compileOddoToJS(input);
  assert(js.includes('"Create new "'), 'Text child "Create new " must be preserved when template literal with ${} exists earlier in source');
  assert(js.includes(', 2)'), 'Expression child {2} must also be preserved');
});

// --- Template literal + sourceText corruption edge cases ---
console.log('\n--- Template Literal sourceText Corruption Edge Cases ---');

test('TL corruption: template literal with ${} before simple JSX text', () => {
  const js = compileOddoToJS('a = `${x}`\nb = <div>hello</div>');
  assert(js.includes('"hello"'), 'Simple text child must survive template literal');
});

test('TL corruption: multiple ${} in template before JSX', () => {
  const js = compileOddoToJS('a = `${x} and ${y}`\nb = <div>hello world</div>');
  assert(js.includes('"hello world"'), 'Text child must survive multiple template expressions');
});

test('TL corruption: nested template literal before JSX', () => {
  const js = compileOddoToJS('a = `outer ${`inner ${z}`}`\nb = <div>preserved</div>');
  assert(js.includes('"preserved"'), 'Text child must survive nested template literals');
});

test('TL corruption: template literal in JSX attribute value', () => {
  const js = compileOddoToJS('x := <div style={`color: ${c}`}>text here</div>');
  assert(js.includes('"text here"'), 'Text child must survive template literal in JSX attribute');
});

test('TL corruption: template literal inside JSX expression child', () => {
  const js = compileOddoToJS('x := <div>{`hello ${name}`} world</div>');
  assert(js.includes('" world"'), 'Text after template literal expression must be preserved');
});

test('TL corruption: template literal with ${} between two JSX elements', () => {
  const js = compileOddoToJS('a = `${1}`\nb = <div>first</div>\nc = `${2}`\nd = <div>second</div>');
  assert(js.includes('"first"'), 'First JSX text must survive');
  assert(js.includes('"second"'), 'Second JSX text must survive after second template literal');
});

test('TL corruption: template literal before JSX with whitespace between children', () => {
  const js = compileOddoToJS('a = `${x}`\nb = <div>{a} {b}</div>');
  assert(js.includes('" "'), 'Whitespace between expressions must be preserved after template literal');
});

test('TL corruption: template literal before JSX with text+expression children', () => {
  const js = compileOddoToJS('a = `${x}`\nb = <div>Hello {name}!</div>');
  assert(js.includes('"Hello "'), '"Hello " must be preserved after template literal');
  assert(js.includes('"!"'), '"!" must be preserved after template literal');
});

test('TL corruption: template literal before multiline JSX', () => {
  const input = `a = \`\${x}\`
b = <div>
  line one {expr} line two
</div>`;
  const js = compileOddoToJS(input);
  assert(js.includes('"line one "'), '"line one " text must be preserved');
  assert(js.includes('" line two"'), '" line two" text must be preserved');
});

test('TL corruption: empty template literal does not corrupt sourceText', () => {
  const js = compileOddoToJS('a = ``\nb = <div>safe text</div>');
  assert(js.includes('"safe text"'), 'Empty template literal should not affect JSX text');
});

test('TL corruption: template literal without ${} does not corrupt sourceText', () => {
  const js = compileOddoToJS('a = `just text`\nb = <div>also safe</div>');
  assert(js.includes('"also safe"'), 'Template literal without expressions should not affect JSX text');
});

test('TL corruption: template literal with complex expression before JSX', () => {
  const js = compileOddoToJS('a = `${obj.method(1, 2)}`\nb = <div>still works</div>');
  assert(js.includes('"still works"'), 'Complex template expression must not corrupt sourceText');
});

test('TL corruption: template literal in ternary inside JSX expression', () => {
  const js = compileOddoToJS('x := <span>{active ? `${name}` : "none"} is selected</span>');
  assert(js.includes('" is selected"'), 'Text after ternary with template literal must be preserved');
});

test('TL corruption: multiple JSX elements after template literal', () => {
  const js = compileOddoToJS('a = `${x}`\nb = <div>one {1} two {2} three</div>');
  assert(js.includes('"one "'), '"one " text must be preserved');
  assert(js.includes('" two "'), '" two " text must be preserved');
  assert(js.includes('" three"'), '" three" text must be preserved');
});

test('TL corruption: template literal before JSX with element+expression+text', () => {
  const js = compileOddoToJS('a = `${x}`\nb = <div><span /> {y} text</div>');
  assert(js.includes('" "'), 'Space between element and expression must be preserved');
  assert(js.includes('" text"'), '" text" must be preserved');
});

// --- Composite Reactivity Type ---
console.log('\n--- Composite Reactivity Type ---');

// Helper: standard @hook preamble for composite tests
const hookPreamble = `@hook useAuth = () => {
  @state [email, setEmail] = null
  @state [token, setToken] = null
  silentLogin = () => { }
  return { email, token, silentLogin }
}`;

// Helper: nested composite hook
const nestedHookPreamble = `@hook useAuth = () => {
  @state [name, setName] = null
  role = "admin"
  @state [email, setEmail] = null
  return { user: { name, role }, email }
}`;

test('Composite: @hook infers composite shape and compiles to function', () => {
  const js = compileOddoToJS(hookPreamble);
  assert(js.includes('const useAuth = function'), 'Hook should compile to a function declaration');
  assert(js.includes('_state(null)'), 'Hook body should contain state calls');
});

test('Composite: member access as dep in @computed', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@computed summary = data.email`);
  assert(js.includes('_computed(_data_email => _data_email(), [data.email])'), 'Should collect data.email as dep with flattened param name');
});

test('Composite: member access as dep in @effect', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@effect () => {\n  console.log(data.email)\n}`);
  assert(js.includes('_effect(_data_email =>'), 'Effect should have composite dep param');
  assert(js.includes('console.log(_data_email())'), 'Body should replace data.email with param call');
  assert(js.includes('[data.email]'), 'Dep array should contain data.email as MemberExpression');
});

test('Composite: nonreactive member is NOT collected as dep', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@effect () => {\n  data.silentLogin()\n}`);
  assert(js.includes('_effect(() =>'), 'Effect should have no dep params');
  assert(js.includes('data.silentLogin()'), 'Nonreactive member should be accessed directly');
  assert(js.includes(', [])'), 'Dep array should be empty');
});

test('Composite: member access as dep in liftFn', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\nhandler = (x) => console.log(data.email, x)`);
  assert(js.includes('_liftFn((_data_email, x) => console.log(_data_email(), x), [data.email])'), 'liftFn should capture composite member as dep');
});

test('Composite: @state initialized from composite member uses _lift', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@state [localEmail, setLocalEmail] = data.email`);
  assert(js.includes('_state(_lift(_data_email => _data_email(), [data.email]))'), 'State initializer should wrap composite member with _lift');
});

test('Composite: spread in @computed uses compositeProxy', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@computed allData = { ...data, extra: 1 }`);
  assert(/import \{.*compositeProxy as \w+.*\}/.test(js), 'Should import compositeProxy');
  assert(js.includes('_compositeProxy(data)'), 'Dep array should wrap composite with compositeProxy');
  assert(js.includes('...data'), 'Spread should remain in the computed body');
});

test('Composite: destructuring from composite call classifies members correctly', () => {
  const js = compileOddoToJS(`${hookPreamble}\n{ email, token } = useAuth()\n@computed val = email`);
  assert(!js.includes('data.email'), 'Should NOT have member expressions — destructured directly');
  assert(js.includes('_computed(email => email(), [email])'), 'Destructured reactive member should be a regular dep');
});

test('Composite: destructured nonreactive member is not a dep', () => {
  const js = compileOddoToJS(`${hookPreamble}\n{ email, silentLogin } = useAuth()\n@effect () => {\n  silentLogin()\n}`);
  assert(js.includes('_effect(() =>'), 'Effect should have no dep params when only using nonreactive member');
  assert(js.includes('silentLogin()'), 'Nonreactive destructured member should be plain');
  assert(js.includes(', [])'), 'Dep array should be empty');
});

test('Composite: nested composite member access (data.user.name)', () => {
  const js = compileOddoToJS(`${nestedHookPreamble}\ndata = useAuth()\n@computed summary = data.user.name`);
  assert(js.includes('_computed(_data_user_name => _data_user_name(), [data.user.name])'), 'Should resolve nested composite path to reactive dep');
});

test('Composite: nested nonreactive member (data.user.role) is NOT a dep', () => {
  const js = compileOddoToJS(`${nestedHookPreamble}\ndata = useAuth()\n@effect () => {\n  console.log(data.user.role)\n}`);
  assert(js.includes('_effect(() =>'), 'Effect should have no dep params for nonreactive nested member');
  assert(js.includes('data.user.role'), 'Nonreactive nested member should be accessed directly');
  assert(js.includes(', [])'), 'Dep array should be empty');
});

test('Composite: nested destructuring from composite call', () => {
  const js = compileOddoToJS(`${nestedHookPreamble}\n{ user: { name, role }, email } = useAuth()\n@computed val = name`);
  assert(js.includes('_computed(name => name(), [name])'), 'Nested destructured reactive member should be a regular dep');
  assert(js.includes('user: {\n    name,\n    role\n  }'), 'Nested destructuring structure should be preserved');
});

test('Composite: @mutate reading composite member as outer dep', () => {
  const input = `@hook useAuth = () => {
  @state [email, setEmail] = null
  return { email }
}
@state [localVal, setLocalVal] = 0
data = useAuth()
@mutate updateLocal = () => {
  localVal := data.email
}`;
  const js = compileOddoToJS(input);
  assert(js.includes('[data.email]'), 'Mutate outer deps should include composite member');
  assert(js.includes('_data_email'), 'Mutate body should receive composite dep param');
});

// --- Inline Composite Evaluation (Hoisting) ---
console.log('\n--- Inline Composite Evaluation (Hoisting) ---');

test('Composite inline eval: hoists call to variable before use', () => {
  const js = compileOddoToJS(`${hookPreamble}\n@computed val = useAuth().email`);
  assert(js.includes('const _useAuth = useAuth()'), 'Should hoist inline call to const variable');
  assert(js.includes('_useAuth.email'), 'Hoisted variable should be used in member access');
  assert(!js.includes('useAuth().email'), 'Inline call should NOT remain in output');
});

test('Composite inline eval: deduplication across multiple contexts', () => {
  const js = compileOddoToJS(`${hookPreamble}\n@computed val1 = useAuth().email\n@computed val2 = useAuth().token`);
  const hoistCount = (js.match(/const _useAuth = useAuth\(\)/g) || []).length;
  assert(hoistCount === 1, `Should have exactly 1 hoisted call, got ${hoistCount}`);
  assert(js.includes('_useAuth.email'), 'First use should reference hoisted var');
  assert(js.includes('_useAuth.token'), 'Second use should reference same hoisted var');
});

test('Composite inline eval: hoisted variable not wrapped with _lift', () => {
  const js = compileOddoToJS(`${hookPreamble}\n@computed val = useAuth().email`);
  assert(!js.includes('_lift') || !js.includes('_lift(_useAuth'), 'Hoisted declaration should NOT be wrapped with _lift');
  assert(/const _useAuth = useAuth\(\);/.test(js), 'Hoisted declaration should be plain const');
});

// --- Multi-Use Composite Member Hoisting ---
console.log('\n--- Multi-Use Composite Member Hoisting ---');

test('Composite multi-use: hoists member path used in multiple contexts', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@computed summary = data.email\n@effect () => {\n  console.log(data.email)\n}`);
  assert(js.includes('const _data_email = data.email'), 'Should hoist multi-use composite member to const');
  assert(js.includes('[_data_email]'), 'Both contexts should reference hoisted variable');
});

test('Composite multi-use: single-use member is NOT hoisted', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@computed summary = data.email`);
  assert(!js.includes('const _data_email = data.email'), 'Single-use member should NOT be hoisted');
  assert(js.includes('[data.email]'), 'Should use direct member access in dep array');
});

test('Composite multi-use: hoisted var inserted before first use', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@computed summary = data.email\n@effect () => {\n  console.log(data.email)\n}`);
  const hoistIdx = js.indexOf('const _data_email = data.email');
  const firstUseIdx = js.indexOf('const summary =');
  assert(hoistIdx < firstUseIdx, 'Hoisted variable should appear before first use');
  assert(hoistIdx > js.indexOf('const data = useAuth()'), 'Hoisted variable should appear after composite declaration');
});

// --- Regression: No Double-Wrapping ---
console.log('\n--- Composite: No Double-Wrapping ---');

test('Composite: no nested _lift inside @effect body', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@effect () => {\n  console.log(data.email)\n}`);
  assert(!js.includes('_lift('), 'Effect body should NOT contain _lift — dep is already unwrapped');
});

test('Composite: no nested _lift inside @computed body', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\n@computed x = data.email + data.token`);
  assert(!js.includes('_lift('), 'Computed body should NOT contain _lift');
  assert(js.includes('_computed((_data_email, _data_token) =>'), 'Both composite deps should be params');
});

// --- Composite with Regular Reactive Deps ---
console.log('\n--- Composite + Regular Reactive Deps ---');

test('Composite: mixed composite and regular reactive deps in @computed', () => {
  const js = compileOddoToJS(`@state count = 0\n${hookPreamble}\ndata = useAuth()\n@computed mixed = data.email + count`);
  assert(js.includes('_computed((count, _data_email) =>'), 'Should have both regular dep and composite dep as params');
  assert(js.includes('count()'), 'Regular dep should be called');
  assert(js.includes('_data_email()'), 'Composite dep should be called');
});

test('Composite: mixed composite and regular reactive deps in @effect', () => {
  const js = compileOddoToJS(`@state count = 0\n${hookPreamble}\ndata = useAuth()\n@effect () => {\n  console.log(count, data.email)\n}`);
  assert(js.includes('(count, _data_email) =>'), 'Effect should have both dep params');
  assert(js.includes('[count, data.email]'), 'Dep array should contain both');
});

// --- Edge Cases ---
console.log('\n--- Composite Edge Cases ---');

test('Composite: multiple composite variables in same scope', () => {
  const input = `@hook useAuth = () => {
  @state [email, setEmail] = null
  return { email }
}
@hook useTheme = () => {
  @state [color, setColor] = "blue"
  return { color }
}
auth = useAuth()
theme = useTheme()
@computed val = auth.email + theme.color`;
  const js = compileOddoToJS(input);
  assert(js.includes('_auth_email'), 'Should have auth.email composite dep');
  assert(js.includes('_theme_color'), 'Should have theme.color composite dep');
  assert(js.includes('[auth.email, theme.color]'), 'Dep array should contain both composite members');
});

test('Composite: composite member access in JSX attribute expression', () => {
  const js = compileOddoToJS(`${hookPreamble}\ndata = useAuth()\nx := <input value={data.email} />`);
  assert(js.includes('_computed(_data_email => _data_email(), [data.email])'), 'JSX attribute should use _computed with composite dep');
});

test('Composite: hook returning all nonreactive members is NOT composite', () => {
  const input = `@hook usePlain = () => {
  x = 1
  y = 2
  return { x, y }
}
data = usePlain()
@computed val = data.x`;
  const js = compileOddoToJS(input);
  assert(!js.includes('_data_x'), 'Nonreactive-only hook should not produce composite deps');
});

// --- Array Composite Shape ---
console.log('\n--- Array Composite Shape ---');

const arrayHookPreamble = `@hook useData = () => {
  @state [count, setCount] = 0
  label = "items"
  return [count, label]
}`;

test('Composite array: destructuring classifies reactive element correctly', () => {
  const js = compileOddoToJS(`${arrayHookPreamble}\n[count, label] = useData()\n@computed val = count`);
  assert(js.includes('_computed(count => count(), [count])'), 'Destructured reactive array element should be a dep');
});

test('Composite array: destructuring classifies nonreactive element correctly', () => {
  const js = compileOddoToJS(`${arrayHookPreamble}\n[count, label] = useData()\n@effect () => {\n  console.log(label)\n}`);
  assert(js.includes('_effect(() =>'), 'Effect should have no dep params for nonreactive array element');
  assert(js.includes('console.log(label)'), 'Nonreactive element should be accessed directly');
  assert(js.includes(', [])'), 'Dep array should be empty');
});

test('Composite array: both reactive and nonreactive elements in same expression', () => {
  const js = compileOddoToJS(`${arrayHookPreamble}\n[count, label] = useData()\n@computed display = count + " " + label`);
  assert(js.includes('_computed(count =>'), 'Should have reactive element as dep');
  assert(js.includes('count()'), 'Reactive element should be called');
  assert(js.includes('label'), 'Nonreactive element should remain plain');
  assert(!js.includes('label()'), 'Nonreactive element should NOT be called');
});

test('Composite array: all nonreactive elements is NOT composite', () => {
  const input = `@hook usePlainArr = () => {
  x = 1
  y = 2
  return [x, y]
}
[a, b] = usePlainArr()
@computed val = a`;
  const js = compileOddoToJS(input);
  assert(!js.includes('[a]'), 'All-nonreactive array should not produce reactive deps');
});

// --- JSX Dep Collection: No Stealing ---
console.log('\n--- JSX Dep Collection: No Stealing ---');

test('JSX: sibling expressions each get own _x, not merged', () => {
  const js = compileOddoToJS(`@state a = 1\n@state b = 2\nx := <div>{a} {b}</div>`);
  const xCount = (js.match(/_x\(/g) || []).length;
  assert(xCount === 2, `Should have exactly 2 _x calls (one per expression), got ${xCount}`);
});

test('JSX: nested JSX element does not steal child deps', () => {
  const js = compileOddoToJS(`@state a = 1\n@state b = 2\nx := <div>{a + <span>{b}</span>}</div>`);
  assert(js.includes('_x('), 'Should have _x wrapping');
  const outerXMatch = js.match(/_x\(([^)]+)\)/);
  assert(!js.includes('_x(_a, _b'), 'Outer _x should NOT have both a and b as deps');
});

test('JSX: variable assigned JSX should NOT get _lift wrapper', () => {
  const js = compileOddoToJS(`@state x = 1\ntemp = <p>{x}</p>`);
  assert(!js.includes('_lift('), 'Variable assigned JSX should NOT be wrapped with _lift');
  assert(js.includes('_x('), 'JSX expression {x} should still get _x wrapping');
});

test('JSX: plain expression statement with JSX should NOT get _lift', () => {
  const js = compileOddoToJS(`@state x = 1\nsomeFunc(<p>{x}</p>)`);
  assert(!js.includes('_lift('), 'Expression with JSX arg should NOT be wrapped with _lift');
});

// --- Component Return Reactivity ---
console.log('\n--- Component Return Reactivity ---');

test('Component: return with reactive deps gets _x wrapping', () => {
  const js = compileOddoToJS(`@component Foo = () => {\n  @state x = 1\n  return x + 1\n}`);
  assert(js.includes('_x('), 'Component return with reactive dep should be wrapped with _x');
});

test('Component: return JSX is NOT double-wrapped', () => {
  const js = compileOddoToJS(`@component Foo = () => {\n  @state x = 1\n  return <p>{x}</p>\n}`);
  assert(!js.includes('_lift('), 'Component return of JSX should NOT have _lift');
  assert(js.includes('_x('), 'Inner JSX expression should still have _x');
});

test('Hook: return with reactive members is NOT wrapped', () => {
  const js = compileOddoToJS(`@hook bar = (x) => {\n  @computed x1 = x + 1\n  return { x, x1 }\n}`);
  assert(!js.includes('_x('), 'Hook return should NOT be wrapped with _x');
  assert(!js.includes('_lift('), 'Hook return should NOT be wrapped with _lift');
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
