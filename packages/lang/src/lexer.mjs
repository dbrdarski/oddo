/**
 * Oddo Language Lexer
 * Token definitions for Chevrotain
 */

import { createToken, Lexer } from 'chevrotain';

// Tokens are defined in order of precedence (most specific first)

// Identifiers (defined first for use in keyword definitions)
export const Identifier = createToken({
  name: 'Identifier',
  pattern: /[a-zA-Z_$][a-zA-Z0-9_$]*/,
});

// Keywords
export const Return = createToken({
  name: 'Return',
  pattern: /return\b/,
  longer_alt: Identifier,
});

export const True = createToken({
  name: 'True',
  pattern: /true\b/,
  longer_alt: Identifier,
});

export const False = createToken({
  name: 'False',
  pattern: /false\b/,
  longer_alt: Identifier,
});

export const Null = createToken({
  name: 'Null',
  pattern: /null\b/,
  longer_alt: Identifier,
});

export const Typeof = createToken({
  name: 'Typeof',
  pattern: /typeof\b/,
  longer_alt: Identifier,
});

export const Void = createToken({
  name: 'Void',
  pattern: /void\b/,
  longer_alt: Identifier,
});

export const Delete = createToken({
  name: 'Delete',
  pattern: /delete\b/,
  longer_alt: Identifier,
});

export const Instanceof = createToken({
  name: 'Instanceof',
  pattern: /instanceof\b/,
  longer_alt: Identifier,
});

export const In = createToken({
  name: 'In',
  pattern: /in\b/,
  longer_alt: Identifier,
});

export const Export = createToken({
  name: 'Export',
  pattern: /export\b/,
  longer_alt: Identifier,
});

export const Import = createToken({
  name: 'Import',
  pattern: /import\b/,
  longer_alt: Identifier,
});

export const From = createToken({
  name: 'From',
  pattern: /from\b/,
  longer_alt: Identifier,
});

export const Default = createToken({
  name: 'Default',
  pattern: /default\b/,
  longer_alt: Identifier,
});

export const As = createToken({
  name: 'As',
  pattern: /as\b/,
  longer_alt: Identifier,
});

// Modifier
export const Modifier = createToken({
  name: 'Modifier',
  pattern: /@[a-zA-Z_$][a-zA-Z0-9_$]*/,
});

// Literals
export const NumberLiteral = createToken({
  name: 'NumberLiteral',
  pattern: /-?(0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+(\.\d+)?([eE][+-]?\d+)?)/,
});

export const StringLiteral = createToken({
  name: 'StringLiteral',
  pattern: /"([^"\\]|\\.)*"/,
});

// Template literal token with custom pattern function to handle escapes correctly
// Handles: `text`, `text ${expr} text`, `text \` text`, `text \${expr} text`, etc.
export const TemplateLiteral = createToken({
  name: 'TemplateLiteral',
  line_breaks: true, // Template literals can span multiple lines
  pattern: (text, offset) => {
    // Must start with backtick
    if (text[offset] !== '`') {
      return null;
    }

    let pos = offset + 1;
    let escaped = false;
    let braceDepth = 0; // Track depth of ${...} expressions

    while (pos < text.length) {
      const char = text[pos];

      if (escaped) {
        // After backslash, skip the escaped character
        escaped = false;
        pos++;
        continue;
      }

      if (char === '\\') {
        // Escape sequence
        escaped = true;
        pos++;
        continue;
      }

      if (char === '`' && braceDepth === 0) {
        // Found closing backtick (not escaped, and not inside ${...})
        return [text.substring(offset, pos + 1)];
      }

      if (char === '$' && pos + 1 < text.length && text[pos + 1] === '{') {
        // Found ${ - start of expression
        // Check if it's escaped: \${ or $\{
        if (pos > offset && text[pos - 1] === '\\') {
          // Escaped as \${ - treat as literal text
          pos += 2;
          continue;
        }
        // Not escaped - enter expression
        braceDepth++;
        pos += 2;
        continue;
      }

      if (char === '{' && braceDepth > 0) {
        // Nested brace inside ${...}
        braceDepth++;
        pos++;
        continue;
      }

      if (char === '}' && braceDepth > 0) {
        // Closing brace for ${...} expression
        braceDepth--;
        pos++;
        continue;
      }

      pos++;
    }

    // Reached end of input without closing backtick
    return null;
  },
});

// Operators (in order of precedence/ambiguity)
export const PlusPlus = createToken({ name: 'PlusPlus', pattern: /\+\+/ });
export const MinusMinus = createToken({ name: 'MinusMinus', pattern: /--/ });
export const Plus = createToken({ name: 'Plus', pattern: /\+/ });
export const Minus = createToken({ name: 'Minus', pattern: /-/ });
export const StarStar = createToken({ name: 'StarStar', pattern: /\*\*/ });
export const Star = createToken({ name: 'Star', pattern: /\*/ });
// Slash must come after JSXSelfClosing to avoid conflicts
export const Slash = createToken({ name: 'Slash', pattern: /\// });
export const Percent = createToken({ name: 'Percent', pattern: /%/ });
export const LessThanEqual = createToken({ name: 'LessThanEqual', pattern: /<=/ });
export const GreaterThanEqual = createToken({ name: 'GreaterThanEqual', pattern: />=/ });
export const Pipe = createToken({ name: 'Pipe', pattern: /\|>/ });
export const Compose = createToken({ name: 'Compose', pattern: /<\|/ });
export const LessThan = createToken({ name: 'LessThan', pattern: /</ });
export const GreaterThan = createToken({ name: 'GreaterThan', pattern: />/ });
export const EqualEqual = createToken({ name: 'EqualEqual', pattern: /==/ });
export const BangEqual = createToken({ name: 'BangEqual', pattern: /!=/ });
export const AndAnd = createToken({ name: 'AndAnd', pattern: /&&/ });
export const OrOr = createToken({ name: 'OrOr', pattern: /\|\|/ });
export const QuestionDot = createToken({ name: 'QuestionDot', pattern: /\?\./ });
export const QuestionQuestion = createToken({ name: 'QuestionQuestion', pattern: /\?\?/ });
export const Question = createToken({ name: 'Question', pattern: /\?/ });
export const ColonEqual = createToken({ name: 'ColonEqual', pattern: /:=/ });
export const Colon = createToken({ name: 'Colon', pattern: /:/ });
export const Bang = createToken({ name: 'Bang', pattern: /!/ });
export const Tilde = createToken({ name: 'Tilde', pattern: /~/ });
export const And = createToken({ name: 'And', pattern: /&/ });
export const Or = createToken({ name: 'Or', pattern: /\|/ });
export const Caret = createToken({ name: 'Caret', pattern: /\^/ });
export const LeftShift = createToken({ name: 'LeftShift', pattern: /<</ });
export const RightShift = createToken({ name: 'RightShift', pattern: />>/ });
export const UnsignedRightShift = createToken({ name: 'UnsignedRightShift', pattern: />>>/ });

// Assignment operators (using := syntax)
export const PlusColonEqual = createToken({ name: 'PlusColonEqual', pattern: /\+:=/ });
export const MinusColonEqual = createToken({ name: 'MinusColonEqual', pattern: /-:=/ });
export const StarStarColonEqual = createToken({ name: 'StarStarColonEqual', pattern: /\*\*:=/ });
export const StarColonEqual = createToken({ name: 'StarColonEqual', pattern: /\*:=/ });
export const SlashColonEqual = createToken({ name: 'SlashColonEqual', pattern: /\/:=/ });
export const PercentColonEqual = createToken({ name: 'PercentColonEqual', pattern: /%:=/ });
export const LeftShiftColonEqual = createToken({ name: 'LeftShiftColonEqual', pattern: /<<:=/ });
export const RightShiftColonEqual = createToken({ name: 'RightShiftColonEqual', pattern: />>:=/ });
export const UnsignedRightShiftColonEqual = createToken({ name: 'UnsignedRightShiftColonEqual', pattern: />>>:=/ });
export const AndColonEqual = createToken({ name: 'AndColonEqual', pattern: /&:=/ });
export const CaretColonEqual = createToken({ name: 'CaretColonEqual', pattern: /\^:=/ });
export const OrColonEqual = createToken({ name: 'OrColonEqual', pattern: /\|:=/ });
// Logical assignment operators (ES2021)
export const AndAndColonEqual = createToken({ name: 'AndAndColonEqual', pattern: /&&:=/ });
export const OrOrColonEqual = createToken({ name: 'OrOrColonEqual', pattern: /\|\|:=/ });
export const QuestionQuestionColonEqual = createToken({ name: 'QuestionQuestionColonEqual', pattern: /\?\?:=/ });
export const Equal = createToken({ name: 'Equal', pattern: /=/ });

// Punctuation
export const LeftParen = createToken({ name: 'LeftParen', pattern: /\(/ });
export const RightParen = createToken({ name: 'RightParen', pattern: /\)/ });
export const LeftBracket = createToken({ name: 'LeftBracket', pattern: /\[/ });
export const RightBracket = createToken({ name: 'RightBracket', pattern: /\]/ });
export const LeftBrace = createToken({ name: 'LeftBrace', pattern: /\{/ });
export const RightBrace = createToken({ name: 'RightBrace', pattern: /\}/ });
export const Comma = createToken({ name: 'Comma', pattern: /,/ });
export const Dot = createToken({ name: 'Dot', pattern: /\./ });
export const DotDotDot = createToken({ name: 'DotDotDot', pattern: /\.\.\./ });
export const Semicolon = createToken({ name: 'Semicolon', pattern: /;/ });

// JSX tokens (must come before LessThan/GreaterThan to avoid conflicts)
// Note: JSX parsing will need special handling since < and > are ambiguous
export const JSXCloseTagStart = createToken({ name: 'JSXCloseTagStart', pattern: /<\// });
export const JSXSelfClosing = createToken({ name: 'JSXSelfClosing', pattern: /\/>/ });

// Indentation tokens (must come before WhiteSpace)
export const Indent = createToken({
  name: 'Indent',
  pattern: /INDENT/,
  line_breaks: false,
});

export const Dedent = createToken({
  name: 'Dedent',
  pattern: /DEDENT/,
  line_breaks: false,
});

// Whitespace and comments
export const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

export const LineComment = createToken({
  name: 'LineComment',
  pattern: /\/\/.*/,
  group: Lexer.SKIPPED,
});

export const MultiLineComment = createToken({
  name: 'MultiLineComment',
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
});

// All tokens in order
export const allTokens = [
  WhiteSpace,
  LineComment,
  MultiLineComment,
  // Keywords
  Return,
  True,
  False,
  Null,
  Typeof,
  Void,
  Delete,
  Instanceof,
  In,
  Export,
  Import,
  From,
  Default,
  As,
  // Modifier
  Modifier,
  // Literals
  NumberLiteral,
  StringLiteral,
  TemplateLiteral, // Must come before Identifier to match backtick before identifiers
  // Operators (order matters for ambiguity)
  PlusPlus,
  MinusMinus,
  // Assignment operators (must come before their base operators)
  StarStarColonEqual, // **:= must come before **
  LeftShiftColonEqual, // <<:= must come before <<
  RightShiftColonEqual, // >>:= must come before >>
  UnsignedRightShiftColonEqual, // >>>:= must come before >>>
  PlusColonEqual, // +:= must come before +
  MinusColonEqual, // -:= must come before -
  StarColonEqual, // *:= must come before *
  SlashColonEqual, // /:= must come before /
  PercentColonEqual, // %:= must come before %
  AndColonEqual, // &:= must come before &
  OrColonEqual, // |:= must come before |
  CaretColonEqual, // ^:= must come before ^
  AndAndColonEqual, // &&:= must come before &&
  OrOrColonEqual, // ||:= must come before ||
  QuestionQuestionColonEqual, // ??:= must come before ??
  EqualEqual,
  BangEqual,
  LessThanEqual,
  GreaterThanEqual,
  Pipe, // Must come before GreaterThan to match |> before >
  Compose, // Must come before LessThan to match <| before <
  LeftShift,
  UnsignedRightShift, // Must come before RightShift (>>> before >>)
  RightShift,
  StarStar,
  AndAnd,
  OrOr,
  Equal,
  Plus,
  Minus,
  Star,
  Percent,
  // JSX tokens must come before LessThan/GreaterThan/Slash to avoid conflicts
  JSXCloseTagStart, // </ must come before <
  JSXSelfClosing,   // /> must come before /
  LessThan,
  GreaterThan,
  // Slash must come after JSXSelfClosing to avoid conflicts
  Slash,
  And,
  Or,
  Caret,
  Bang,
  Tilde,
  QuestionDot, // Must come before Question to match ?. before ?
  QuestionQuestion,
  Question,
  ColonEqual, // Must come before Colon to match := before :
  Colon,
  // Punctuation
  LeftParen,
  RightParen,
  LeftBracket,
  RightBracket,
  LeftBrace,
  RightBrace,
  Comma,
  DotDotDot, // Must come before Dot to match ... before .
  Dot,
  Semicolon,
  // Note: JSXOpenTag and JSXCloseTag use < and > tokens
  // Identifiers (must be last)
  Identifier,
];

// Create lexer
export const lexer = new Lexer(allTokens);
