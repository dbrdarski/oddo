/**
 * Oddo Language Parser (Chevrotain Implementation)
 * Main entry point
 */

import { lexer } from './lexer.mjs';
import { parser } from './parser.mjs';
import { convertCSTToAST, convertExpression } from './ast-converter.mjs';
import { compileToJS } from './compiler.mjs';
import { highlightOddo, getHighlightingCSS } from './highlighter.mjs';

/**
 * Tokenize input using the standard lexer
 * No indentation processing - blocks use braces like JavaScript
 */
function tokenize(input) {
  return lexer.tokenize(input);
}

/**
 * Parse Oddo language source code
 * @param {string} input - Source code to parse
 * @returns {object} AST (Abstract Syntax Tree)
 */
export function parseOddo(input) {
  // Tokenize using standard lexer
  const lexResult = tokenize(input);

  if (lexResult.errors.length > 0) {
    const errors = lexResult.errors.map(err => ({
      message: err.message,
      line: err.line,
      column: err.column,
    }));
    throw new Error(`Lexer errors: ${JSON.stringify(errors)}`);
  }

  // Parse
  parser.input = lexResult.tokens;
  const cst = parser.program();

  if (parser.errors.length > 0) {
    const errors = parser.errors.map(err => ({
      message: err.message,
      token: err.token?.image,
      line: err.token?.startLine,
      column: err.token?.startColumn,
    }));
    throw new Error(`Parser errors: ${JSON.stringify(errors)}`);
  }

  // Convert CST to AST
  const ast = convertCSTToAST(cst);
  return ast;
}

/**
 * Parse Oddo language expression
 * @param {string} input - Expression to parse
 * @returns {object} AST node
 */
export function parseOddoExpression(input) {
  // Tokenize using standard lexer
  const lexResult = tokenize(input);

  if (lexResult.errors.length > 0) {
    const errors = lexResult.errors.map(err => ({
      message: err.message,
      line: err.line,
      column: err.column,
    }));
    throw new Error(`Lexer errors: ${JSON.stringify(errors)}`);
  }

  // Parse as expression directly
  parser.input = lexResult.tokens;
  const cst = parser.expression();

  if (parser.errors.length > 0) {
    const errors = parser.errors.map(err => ({
      message: err.message,
      token: err.token?.image,
      line: err.token?.startLine,
      column: err.token?.startColumn,
    }));
    throw new Error(`Parser errors: ${JSON.stringify(errors)}`);
  }

  // Convert CST to AST
  const ast = convertExpression(cst);
  return ast;
}

export function compileOddoToJS(input, config = {}) {
  const ast = parseOddo(input);
  return compileToJS(ast, config);
}

export function compileOddoExpressionToJS(input, config = {}) {
  const ast = parseOddoExpression(input);
  return compileToJS(ast, config);
}

// Re-export highlighter functions
export { highlightOddo, getHighlightingCSS };
