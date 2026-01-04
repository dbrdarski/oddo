/**
 * Example usage of Oddo Language Compiler
 * Compiles Oddo code to JavaScript
 */

import { compileOddoToJS, compileOddoExpressionToJS } from './index.mjs';

console.log('=== Oddo Language Compiler Examples ===\n');

// Example 1: Simple program
const code1 = `x = 10
y = 20
return x + y`;

console.log('Example 1: Simple program');
console.log('Oddo:');
console.log(code1);
console.log('\nCompiled to JS:');
console.log(compileOddoToJS(code1));
console.log('\n' + '='.repeat(50) + '\n');

// Example 2: Arrow functions
const code2 = `(x, y) => x + y`;

console.log('Example 2: Arrow function');
console.log('Oddo:', code2);
console.log('JS:', compileOddoExpressionToJS(code2));
console.log('\n' + '='.repeat(50) + '\n');

// Example 3: Object with spread
const code3 = `{ ...obj, key: "value" }`;

console.log('Example 3: Object with spread');
console.log('Oddo:', code3);
console.log('JS:', compileOddoExpressionToJS(code3));
console.log('\n' + '='.repeat(50) + '\n');

// Example 4: Array with spread
const code4 = `[1, 2, ...arr]`;

console.log('Example 4: Array with spread');
console.log('Oddo:', code4);
console.log('JS:', compileOddoExpressionToJS(code4));
console.log('\n' + '='.repeat(50) + '\n');

// Example 5: Destructuring
const code5 = `[a, b] = arr`;

console.log('Example 5: Array destructuring');
console.log('Oddo:', code5);
console.log('JS:', compileOddoExpressionToJS(code5));
console.log('\n' + '='.repeat(50) + '\n');

// Example 6: Complex expression
const code6 = `x = (a + b) * c`;

console.log('Example 6: Complex expression');
console.log('Oddo:', code6);
console.log('JS:', compileOddoExpressionToJS(code6));
console.log('\n' + '='.repeat(50) + '\n');
