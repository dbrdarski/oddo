/**
 * Oddo Syntax Highlighter
 * Uses the Chevrotain lexer to tokenize and highlight code
 */

import { lexer, allTokens } from './lexer.mjs';

// Token type to CSS class mapping
const tokenClassMap = {
  // Keywords
  'Return': 'keyword',
  'Import': 'keyword',
  'Export': 'keyword',
  'From': 'keyword',
  'Default': 'keyword',
  'As': 'keyword',
  
  // Keyword operators
  'Typeof': 'keyword',
  'Void': 'keyword',
  'Delete': 'keyword',
  'Instanceof': 'keyword',
  'In': 'keyword',
  
  // Constants
  'True': 'constant',
  'False': 'constant',
  'Null': 'constant',
  
  // Literals
  'NumberLiteral': 'number',
  'StringLiteral': 'string',
  'TemplateLiteral': 'string',
  
  // Modifier
  'Modifier': 'modifier',
  
  // Comments
  'LineComment': 'comment',
  'MultiLineComment': 'comment',
  
  // Operators
  'Equal': 'operator',
  'ColonEqual': 'operator',
  'PlusPlus': 'operator',
  'MinusMinus': 'operator',
  'Plus': 'operator',
  'Minus': 'operator',
  'Star': 'operator',
  'StarStar': 'operator',
  'Slash': 'operator',
  'Percent': 'operator',
  'EqualEqual': 'operator',
  'BangEqual': 'operator',
  'LessThan': 'tag',
  'GreaterThan': 'tag',
  'LessThanEqual': 'operator',
  'GreaterThanEqual': 'operator',
  'AndAnd': 'operator',
  'OrOr': 'operator',
  'Bang': 'operator',
  'Question': 'operator',
  'QuestionDot': 'operator',
  'QuestionQuestion': 'operator',
  'Colon': 'operator',
  'Pipe': 'operator',
  'Compose': 'operator',
  'DotDotDot': 'operator',
  'And': 'operator',
  'Or': 'operator',
  'Caret': 'operator',
  'Tilde': 'operator',
  'LeftShift': 'operator',
  'RightShift': 'operator',
  'UnsignedRightShift': 'operator',
  
  // Compound assignment
  'PlusColonEqual': 'operator',
  'MinusColonEqual': 'operator',
  'StarColonEqual': 'operator',
  'StarStarColonEqual': 'operator',
  'SlashColonEqual': 'operator',
  'PercentColonEqual': 'operator',
  'LeftShiftColonEqual': 'operator',
  'RightShiftColonEqual': 'operator',
  'UnsignedRightShiftColonEqual': 'operator',
  'AndColonEqual': 'operator',
  'OrColonEqual': 'operator',
  'CaretColonEqual': 'operator',
  'AndAndColonEqual': 'operator',
  'OrOrColonEqual': 'operator',
  'QuestionQuestionColonEqual': 'operator',
  
  // JSX
  'JSXCloseTagStart': 'tag',
  'JSXSelfClosing': 'tag',
  
  // Punctuation
  'LeftParen': 'punctuation',
  'RightParen': 'punctuation',
  'LeftBracket': 'punctuation',
  'RightBracket': 'punctuation',
  'LeftBrace': 'punctuation',
  'RightBrace': 'punctuation',
  'Comma': 'punctuation',
  'Dot': 'punctuation',
  'Semicolon': 'punctuation',
  
  // Identifier - default
  'Identifier': 'identifier',
};

// Escape HTML special characters
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Highlights Oddo code and returns HTML
 * @param {string} code - The Oddo source code
 * @returns {string} - HTML with syntax highlighting spans
 */
export function highlightOddo(code) {
  // Handle reactive wrappers or non-string values
  const text = String(code || '');
  if (!text || text.trim() === '') {
    return '';
  }

  // Tokenize the code
  // Note: The lexer skips whitespace and comments, so we need to handle them differently
  // We'll use a simple regex-based approach to preserve all characters
  
  const result = lexer.tokenize(text);
  const tokens = result.tokens;
  
  // Also get the groups (comments are in groups since they're SKIPPED)
  const comments = [
    ...(result.groups.LineComment || []),
    ...(result.groups.MultiLineComment || []),
  ];
  
  // Combine all tokens and sort by position
  const allTokenInstances = [...tokens, ...comments].sort((a, b) => a.startOffset - b.startOffset);
  
  let html = '';
  let lastEnd = 0;
  
  for (const token of allTokenInstances) {
    // Add any text between tokens (whitespace)
    if (token.startOffset > lastEnd) {
      const between = text.substring(lastEnd, token.startOffset);
      html += escapeHtml(between);
    }
    
    // Add the token with its class
    const tokenType = token.tokenType.name;
    const cssClass = tokenClassMap[tokenType] || 'text';
    const tokenText = escapeHtml(token.image);
    
    html += `<span class="tok-${cssClass}">${tokenText}</span>`;
    
    lastEnd = token.startOffset + token.image.length;
  }
  
  // Add any remaining text after the last token
  if (lastEnd < text.length) {
    html += escapeHtml(text.substring(lastEnd));
  }
  
  return html;
}

/**
 * Creates the CSS for syntax highlighting
 * @returns {string} - CSS rules
 */
export function getHighlightingCSS() {
  return `
    .tok-keyword { color: #ff79c6; }
    .tok-constant { color: #bd93f9; }
    .tok-number { color: #bd93f9; }
    .tok-string { color: #f1fa8c; }
    .tok-modifier { color: #50fa7b; font-weight: 500; }
    .tok-comment { color: #6272a4; font-style: italic; }
    .tok-operator { color: #ff79c6; }
    .tok-tag { color: #8be9fd; }
    .tok-punctuation { color: #f8f8f2; }
    .tok-identifier { color: #f8f8f2; }
    .tok-text { color: #f8f8f2; }
  `;
}

