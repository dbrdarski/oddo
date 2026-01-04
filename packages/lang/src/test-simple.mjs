/**
 * Simple test to verify parser initialization
 */

import { lexer } from './lexer.mjs';
import { parser } from './parser.mjs';

try {
  console.log('Testing lexer...');
  const input = 'x = 10';
  const lexResult = lexer.tokenize(input);
  console.log('Lexer tokens:', lexResult.tokens.map(t => t.image));
  
  console.log('\nTesting parser initialization...');
  console.log('Parser initialized successfully!');
  
  console.log('\nTesting parse...');
  parser.input = lexResult.tokens;
  const cst = parser.program();
  console.log('Parse successful!');
  console.log('CST:', JSON.stringify(cst, null, 2));
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}

