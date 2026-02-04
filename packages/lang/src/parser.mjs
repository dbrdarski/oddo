/**
 * Oddo Language Parser using Chevrotain
 * Implements the Oddo language specification
 */

import { CstParser } from 'chevrotain';
import {
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
  // Literals
  NumberLiteral,
  StringLiteral,
  TemplateLiteral,
  Identifier,
  Modifier,
  // Operators
  PlusPlus,
  MinusMinus,
  Plus,
  Minus,
  StarStar,
  Star,
  Slash,
  Percent,
  LessThanEqual,
  GreaterThanEqual,
  Pipe,
  Compose,
  LessThan,
  GreaterThan,
  EqualEqual,
  BangEqual,
  AndAnd,
  OrOr,
  QuestionDot,
  QuestionQuestion,
  Question,
  ColonEqual,
  Colon,
  Bang,
  Tilde,
  And,
  Or,
  Caret,
  LeftShift,
  RightShift,
  UnsignedRightShift,
  // Assignment
  PlusColonEqual,
  MinusColonEqual,
  StarStarColonEqual,
  StarColonEqual,
  SlashColonEqual,
  PercentColonEqual,
  LeftShiftColonEqual,
  RightShiftColonEqual,
  UnsignedRightShiftColonEqual,
  AndColonEqual,
  CaretColonEqual,
  OrColonEqual,
  AndAndColonEqual,
  OrOrColonEqual,
  QuestionQuestionColonEqual,
  Equal,
  // Punctuation
  LeftParen,
  RightParen,
  LeftBracket,
  RightBracket,
  LeftBrace,
  RightBrace,
  Comma,
  DotDotDot,
  Dot,
  Semicolon,
  // JSX
  JSXSelfClosing,
  JSXCloseTagStart,
  // Whitespace (for JSX text)
  WhiteSpace,
} from './lexer.mjs';

// Maximum number of tokens to look ahead when parsing arrow function parameters
// This prevents infinite loops and excessive lookahead for malformed input
const MAX_TOKEN_LOOKAHEAD_COUNT = 30;

class OddoParser extends CstParser {
  constructor() {
    super([
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
      // Literals
      NumberLiteral,
      StringLiteral,
      Identifier,
      Modifier,
      // Operators
      PlusPlus,
      MinusMinus,
      Plus,
      Minus,
      StarStar,
      Star,
      Slash,
      Percent,
      LessThanEqual,
      GreaterThanEqual,
      LessThan,
      GreaterThan,
      EqualEqual,
      BangEqual,
      AndAnd,
      OrOr,
      QuestionQuestion,
      Question,
      ColonEqual, // Must come before Colon to match := before :
      Colon,
      Bang,
      Tilde,
      And,
      Or,
      Caret,
      LeftShift,
      RightShift,
      UnsignedRightShift,
      // Assignment
      PlusColonEqual,
      MinusColonEqual,
      StarStarColonEqual,
      StarColonEqual,
      SlashColonEqual,
      PercentColonEqual,
      LeftShiftColonEqual,
      RightShiftColonEqual,
      UnsignedRightShiftColonEqual,
      AndColonEqual,
      CaretColonEqual,
      OrColonEqual,
      AndAndColonEqual,
      OrOrColonEqual,
      QuestionQuestionColonEqual,
      Equal,
      // Punctuation
      LeftParen,
      RightParen,
      LeftBracket,
      RightBracket,
      LeftBrace,
      RightBrace,
      Comma,
      DotDotDot,
      Dot,
      // JSX
      JSXCloseTagStart,
      JSXSelfClosing,
    ]);

    // Define rules
    this.RULE('program', () => {
      let lastStatementStartLine = 0;
      this.MANY(() => {
        // Ensure statements are separated by newlines
        const currentToken = this.LA(1);
        if (currentToken && lastStatementStartLine > 0) {
          // Skip newline check for export/import statements (they're always at top level)
          const isExportOrImport = currentToken.tokenType === Export || currentToken.tokenType === Import;
          if (!isExportOrImport && currentToken.startLine <= lastStatementStartLine) {
            // Statements must be on separate lines
            // Throw an error that will be caught by the parser's error handling
            throw new Error(`Statements must be separated by newlines. Found statement starting at line ${currentToken.startLine}, column ${currentToken.startColumn} on the same line as previous statement (started at line ${lastStatementStartLine}).`);
          }
        }
        // Parse the statement
        this.SUBRULE(this.statement);
        // Update the last statement start line for the next iteration
        // Use the current token's line (which is where this statement started)
        if (currentToken) {
          lastStatementStartLine = currentToken.startLine;
        }
      });
    });

    this.RULE('statement', () => {
      this.OR([
        // Modifier on block: @modifier:\n  ...
        {
          GATE: () => {
            const la1 = this.LA(1);
            const la2 = this.LA(2);
            return la1 && la1.tokenType.name === 'Modifier' &&
                   la2 && la2.tokenType === Colon;
          },
          ALT: () => {
            this.SUBRULE(this.modifierBlockStatement);
          },
        },
        { ALT: () => this.SUBRULE(this.exportStatement) },
        { ALT: () => this.SUBRULE(this.importStatement) },
        { ALT: () => this.SUBRULE(this.returnStatement) },
        { ALT: () => this.SUBRULE(this.expressionStatement) },
      ]);
    });

    this.RULE('modifierBlockStatement', () => {
      this.CONSUME(Modifier);
      this.CONSUME(Colon);
      this.SUBRULE(this.blockStatement);
    });

    // Export statement
    this.RULE('exportStatement', () => {
      this.CONSUME(Export);
      this.OR([
        {
          // export default expression
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === Default;
          },
          ALT: () => {
            this.CONSUME(Default);
            this.SUBRULE(this.expression);
          },
        },
        {
          // export { x, y } or export { x as y }
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === LeftBrace;
          },
          ALT: () => {
            this.CONSUME(LeftBrace);
            this.OPTION(() => {
              this.SUBRULE(this.exportSpecifierList);
            });
            this.CONSUME(RightBrace);
          },
        },
        {
          // export x = 1 (named export of assignment)
          ALT: () => {
            this.SUBRULE(this.expressionStatement);
          },
        },
      ]);
    });

    // Export specifier list: x, y, x as y
    this.RULE('exportSpecifierList', () => {
      this.SUBRULE(this.exportSpecifier);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.SUBRULE1(this.exportSpecifier);
      });
      // Allow trailing comma
      this.OPTION(() => {
        this.CONSUME1(Comma);
      });
    });

    // Export specifier: identifier or identifier as identifier
    this.RULE('exportSpecifier', () => {
      this.CONSUME(Identifier);
      this.OPTION(() => {
        this.CONSUME(As);
        this.CONSUME1(Identifier);
      });
    });

    // Import statement
    this.RULE('importStatement', () => {
      this.CONSUME(Import);
      this.OR([
        {
          // import * as ns from "module"
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === Star;
          },
          ALT: () => {
            this.CONSUME(Star);
            this.CONSUME(As);
            this.CONSUME(Identifier);
            this.CONSUME(From);
            this.CONSUME(StringLiteral);
          },
        },
        {
          // import defaultName from "module" or import defaultName, { x } from "module"
          ALT: () => {
            this.CONSUME1(Identifier);
            this.OPTION(() => {
              this.CONSUME(Comma);
              this.CONSUME(LeftBrace);
              this.OPTION1(() => {
                this.SUBRULE(this.importSpecifierList);
              });
              this.CONSUME(RightBrace);
            });
            this.CONSUME1(From);
            this.CONSUME1(StringLiteral);
          },
        },
        {
          // import { x, y } from "module"
          ALT: () => {
            this.CONSUME1(LeftBrace);
            this.OPTION2(() => {
              this.SUBRULE1(this.importSpecifierList);
            });
            this.CONSUME1(RightBrace);
            this.CONSUME2(From);
            this.CONSUME2(StringLiteral);
          },
        },
      ]);
    });

    // Import specifier list: x, y, x as y
    this.RULE('importSpecifierList', () => {
      this.SUBRULE(this.importSpecifier);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.SUBRULE1(this.importSpecifier);
      });
      // Allow trailing comma
      this.OPTION(() => {
        this.CONSUME1(Comma);
      });
    });

    // Import specifier: identifier or identifier as identifier
    this.RULE('importSpecifier', () => {
      this.CONSUME(Identifier);
      this.OPTION(() => {
        this.CONSUME(As);
        this.CONSUME1(Identifier);
      });
    });

    this.RULE('returnStatement', () => {
      this.OPTION1(() => {
        this.CONSUME(Modifier);
      });
      this.CONSUME(Return);
      this.OPTION2(() => {
        this.SUBRULE(this.expression);
      });
    });

    this.RULE('expressionStatement', () => {
      this.OPTION1(() => {
        this.CONSUME(Modifier);
      });
      this.SUBRULE(this.expression);
      // Note: Colon + blockBody is NOT allowed here
      // Only modifiers can have colon + blockBody: @modifier:\n  ...
      // Arrow functions handle block bodies directly: x =>\n  ...
    });

    // Block body with indentation tracking
    // Requires INDENT token before statements, ends on DEDENT
    // Handles nested blocks by tracking indentation depth
    // Block statement with braces (like JavaScript)
    this.RULE('blockStatement', () => {
      this.CONSUME(LeftBrace);
      this.MANY(() => {
        this.SUBRULE(this.statement);
      });
      this.CONSUME(RightBrace);
    });

    // Expression hierarchy (following operator precedence)
    this.RULE('expression', () => {
      this.SUBRULE(this.assignment);
    });

    // Destructuring patterns for assignment (must be defined before assignment rule)
    this.RULE('destructuringPattern', () => {
      this.OR([
        {
          // Array pattern: [a, b, ...rest]
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === LeftBracket;
          },
          ALT: () => {
            this.CONSUME(LeftBracket);
            this.OPTION1(() => {
              this.SUBRULE(this.arrayDestructuringList);
            });
            this.CONSUME(RightBracket);
          },
        },
        {
          // Object pattern: {a, b, ...rest}
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === LeftBrace;
          },
          ALT: () => {
            this.CONSUME(LeftBrace);
            this.OPTION2(() => {
              this.SUBRULE(this.objectDestructuringList);
            });
            this.CONSUME(RightBrace);
          },
        },
      ]);
    });

    this.RULE('arrayDestructuringList', () => {
      this.OR([
        {
          // Rest element: ...rest
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === DotDotDot;
          },
          ALT: () => {
            this.CONSUME(DotDotDot);
            this.CONSUME(Identifier);
          },
        },
        {
          // Regular element: identifier or nested pattern
          ALT: () => {
            this.OR1([
              { ALT: () => this.SUBRULE(this.destructuringPattern) },
              { ALT: () => this.CONSUME1(Identifier) },
            ]);
          },
        },
      ]);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.OR2([
          {
            // Rest element: ...rest (must be last)
            GATE: () => {
              const la1 = this.LA(1);
              return la1 && la1.tokenType === DotDotDot;
            },
            ALT: () => {
              this.CONSUME1(DotDotDot);
              this.CONSUME2(Identifier);
            },
          },
          {
            // Regular element: identifier or nested pattern
            ALT: () => {
              this.OR3([
                { ALT: () => this.SUBRULE1(this.destructuringPattern) },
                { ALT: () => this.CONSUME3(Identifier) },
              ]);
            },
          },
        ]);
      });
      // Allow trailing comma
      this.OPTION(() => {
        this.CONSUME1(Comma);
      });
    });

    this.RULE('objectDestructuringList', () => {
      this.OR([
        {
          // Rest property: ...rest
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === DotDotDot;
          },
          ALT: () => {
            this.CONSUME(DotDotDot);
            this.CONSUME(Identifier);
          },
        },
        {
          // Regular property: key or key: identifier, optionally with default value
          ALT: () => {
            this.OR1([
              { ALT: () => this.CONSUME1(Identifier) },
              { ALT: () => this.CONSUME(StringLiteral) },
            ]);
            this.OPTION(() => {
              this.CONSUME(Colon);
              this.OR2([
                { ALT: () => this.SUBRULE(this.destructuringPattern) },
                { ALT: () => this.CONSUME2(Identifier) },
              ]);
            });
            // Optional default value: = expression
            this.OPTION3(() => {
              this.CONSUME(Equal);
              this.SUBRULE(this.expression);
            });
          },
        },
      ]);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.OR3([
          {
            // Rest property: ...rest (must be last)
            GATE: () => {
              const la1 = this.LA(1);
              return la1 && la1.tokenType === DotDotDot;
            },
            ALT: () => {
              this.CONSUME1(DotDotDot);
              this.CONSUME3(Identifier);
            },
          },
          {
            // Regular property: key or key: identifier, optionally with default value
            ALT: () => {
              this.OR4([
                { ALT: () => this.CONSUME4(Identifier) },
                { ALT: () => this.CONSUME1(StringLiteral) },
              ]);
              this.OPTION1(() => {
                this.CONSUME1(Colon);
                this.OR5([
                  { ALT: () => this.SUBRULE1(this.destructuringPattern) },
                  { ALT: () => this.CONSUME5(Identifier) },
                ]);
              });
              // Optional default value: = expression
              this.OPTION4(() => {
                this.CONSUME1(Equal);
                this.SUBRULE2(this.expression);
              });
            },
          },
        ]);
      });
      // Allow trailing comma
      this.OPTION2(() => {
        this.CONSUME2(Comma);
      });
    });

    // Assignment (right-associative, lowest precedence)
    // Supports destructuring patterns: [a, b] = arr, {a, b} = obj
    this.RULE('assignment', () => {
      this.OR([
        {
          // Destructuring assignment: [pattern] = or {pattern} = or [pattern] := or {pattern} :=
          // Only match if we have [ or { and can find an = or := token after a valid pattern
          GATE: () => {
            const la1 = this.LA(1);
            if (!la1) return false;
            // Only consider destructuring if we start with [ or {
            if (la1.tokenType !== LeftBracket && la1.tokenType !== LeftBrace) {
              return false;
            }
            // Look ahead to find a matching ] or } and check if = or := follows
            // Start depth at 1 since we've already seen the opening [ or {
            let depth = 1;
            let i = 2; // Start at 2 since LA(1) is the opening bracket
            while (i < MAX_TOKEN_LOOKAHEAD_COUNT) {
              const token = this.LA(i);
              if (!token) break;
              if (token.tokenType === LeftBracket || token.tokenType === LeftBrace) {
                depth++;
              } else if (token.tokenType.name === 'RightBracket' || token.tokenType.name === 'RightBrace') {
                depth--;
                if (depth === 0) {
                  // Check if next token is = or :=
                  const nextToken = this.LA(i + 1);
                  return nextToken && (nextToken.tokenType === Equal || nextToken.tokenType === ColonEqual);
                }
              }
              i++;
            }
            return false;
          },
          ALT: () => {
            this.SUBRULE(this.destructuringPattern);
            this.OR2([
              { ALT: () => this.CONSUME1(Equal) },
              { ALT: () => this.CONSUME1(ColonEqual) },
            ]);
            this.SUBRULE(this.assignment); // Right-associative
          },
        },
        {
          // Regular assignment: expr = expr or expr := expr
          ALT: () => {
            this.SUBRULE(this.conditional);
            this.OPTION(() => {
              this.OR1([
                { ALT: () => this.CONSUME(Equal) },
                { ALT: () => this.CONSUME(ColonEqual) },
                { ALT: () => this.CONSUME(PlusColonEqual) },
                { ALT: () => this.CONSUME(MinusColonEqual) },
                { ALT: () => this.CONSUME(StarColonEqual) },
                { ALT: () => this.CONSUME(SlashColonEqual) },
                { ALT: () => this.CONSUME(PercentColonEqual) },
                { ALT: () => this.CONSUME(StarStarColonEqual) },
                { ALT: () => this.CONSUME(LeftShiftColonEqual) },
                { ALT: () => this.CONSUME(RightShiftColonEqual) },
                { ALT: () => this.CONSUME(UnsignedRightShiftColonEqual) },
                { ALT: () => this.CONSUME(AndColonEqual) },
                { ALT: () => this.CONSUME(CaretColonEqual) },
                { ALT: () => this.CONSUME(OrColonEqual) },
                { ALT: () => this.CONSUME(AndAndColonEqual) },
                { ALT: () => this.CONSUME(OrOrColonEqual) },
                { ALT: () => this.CONSUME(QuestionQuestionColonEqual) },
              ]);
              this.SUBRULE1(this.assignment); // Right-associative
            });
          },
        },
      ]);
    });

    // Conditional (right-associative)
    this.RULE('conditional', () => {
      this.SUBRULE(this.logicalOr);
      this.OPTION(() => {
        this.CONSUME(Question);
        this.SUBRULE(this.expression);
        this.CONSUME(Colon);
        this.SUBRULE(this.conditional); // Right-associative
      });
    });

    // Logical OR
    this.RULE('logicalOr', () => {
      this.SUBRULE(this.pipe);
      this.MANY(() => {
        this.CONSUME(OrOr);
        this.SUBRULE2(this.pipe);
      });
    });

    // Pipe operator |> (left-associative)
    this.RULE('pipe', () => {
      this.SUBRULE(this.compose);
      this.MANY(() => {
        this.CONSUME(Pipe);
        this.SUBRULE2(this.compose);
      });
    });

    // Compose operator <| (right-associative)
    this.RULE('compose', () => {
      this.SUBRULE(this.nullishCoalescing);
      this.OPTION(() => {
        this.CONSUME(Compose);
        this.SUBRULE(this.compose); // Right-associative
      });
    });

    // Nullish Coalescing (??)
    this.RULE('nullishCoalescing', () => {
      this.SUBRULE(this.logicalAnd);
      this.MANY(() => {
        this.CONSUME(QuestionQuestion);
        this.SUBRULE2(this.logicalAnd);
      });
    });

    // Logical AND
    this.RULE('logicalAnd', () => {
      this.SUBRULE(this.equality);
      this.MANY(() => {
        this.CONSUME(AndAnd);
        this.SUBRULE2(this.equality);
      });
    });

    // Equality
    this.RULE('equality', () => {
      this.SUBRULE(this.relational);
      this.MANY(() => {
        this.OR([
          { ALT: () => this.CONSUME(EqualEqual) },
          { ALT: () => this.CONSUME(BangEqual) },
        ]);
        this.SUBRULE2(this.relational);
      });
    });

    // Relational
    this.RULE('relational', () => {
      this.SUBRULE(this.additive);
      let lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : null;
      this.MANY(() => {
        const nextToken = this.LA(1);

        // For < and > operators specifically, check if on same line
        // This prevents JSX confusion: `<div>text</div>\n<div>` should not be `< div`
        if (nextToken && (nextToken.tokenType === LessThan || nextToken.tokenType === GreaterThan)) {
          if (lastTokenLine && nextToken.startLine > lastTokenLine) {
            return; // Stop relational operators across lines for < and >
          }
        }

        this.OR([
          { ALT: () => this.CONSUME(LessThanEqual) },
          { ALT: () => this.CONSUME(GreaterThanEqual) },
          { ALT: () => this.CONSUME(LessThan) },
          { ALT: () => this.CONSUME(GreaterThan) },
          { ALT: () => this.CONSUME(Instanceof) },
          { ALT: () => this.CONSUME(In) },
        ]);
        this.SUBRULE2(this.additive);
        lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
      });
    });

    // Additive
    this.RULE('additive', () => {
      this.SUBRULE(this.multiplicative);
      this.MANY(() => {
        this.OR([
          { ALT: () => this.CONSUME(Plus) },
          { ALT: () => this.CONSUME(Minus) },
        ]);
        this.SUBRULE2(this.multiplicative);
      });
    });

    // Multiplicative
    this.RULE('multiplicative', () => {
      this.SUBRULE(this.exponentiation);
      this.MANY(() => {
        this.OR([
          { ALT: () => this.CONSUME(Star) },
          { ALT: () => this.CONSUME(Slash) },
          { ALT: () => this.CONSUME(Percent) },
        ]);
        this.SUBRULE2(this.exponentiation);
      });
    });

    // Exponentiation (right-associative)
    this.RULE('exponentiation', () => {
      this.SUBRULE(this.unary);
      this.OPTION(() => {
        this.CONSUME(StarStar);
        this.SUBRULE(this.exponentiation); // Right-associative
      });
    });

    // Unary operators
    // Arrow functions are also parsed here (before postfix) to avoid ambiguity with parenthesized expressions
    this.RULE('unary', () => {
      this.OR([
        {
          ALT: () => {
            this.OR1([
              { ALT: () => this.CONSUME(Typeof) },
              { ALT: () => this.CONSUME(Void) },
              { ALT: () => this.CONSUME(Delete) },
            ]);
            this.SUBRULE1(this.unary);
          },
        },
        {
          ALT: () => {
            this.OR2([
              { ALT: () => this.CONSUME(Plus) },
              { ALT: () => this.CONSUME(Minus) },
              { ALT: () => this.CONSUME(Bang) },
              { ALT: () => this.CONSUME(Tilde) },
            ]);
            this.SUBRULE2(this.unary);
          },
        },
        {
          ALT: () => {
            this.OR3([
              { ALT: () => this.CONSUME(PlusPlus) },
              { ALT: () => this.CONSUME(MinusMinus) },
            ]);
            this.SUBRULE1(this.postfix);
          },
        },
        { ALT: () => this.SUBRULE2(this.postfix) },
      ]);
    });

    // Postfix operators
    this.RULE('postfix', () => {
      this.SUBRULE(this.functionCall);
      this.OPTION(() => {
        this.OR([
          { ALT: () => this.CONSUME(PlusPlus) },
          { ALT: () => this.CONSUME(MinusMinus) },
        ]);
      });
    });

    // Function calls (including tagged template literals)
    // Note: Function calls and member access have the same precedence and chain together
    // e.g., a.b().c.d() is parsed as ((a.b()).c).d()
    this.RULE('functionCall', () => {
      this.SUBRULE(this.memberAccess);
      let lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : null;
      this.MANY(() => {
        const nextToken = this.LA(1);

        // For function calls (not template literals or method chains), check if on same line
        // This prevents `expr\n(args)` from being parsed as a function call
        // which would break arrow functions: `x => x\n(y) => y` should be two statements
        if (nextToken && (nextToken.tokenType === LeftParen ||
            (nextToken.tokenType === QuestionDot && this.LA(2) && this.LA(2).tokenType === LeftParen))) {
          if (lastTokenLine && nextToken.startLine > lastTokenLine) {
            return; // Stop function calls across lines
          }
        }

        // Tagged template literal, optional function call, or regular function call
        this.OR([
          {
            // Template literals are allowed across lines (for tagged templates)
            GATE: () => {
              const la1 = this.LA(1);
              return la1 && la1.tokenType === TemplateLiteral;
            },
            ALT: () => {
              this.CONSUME(TemplateLiteral);
              lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
            },
          },
          {
            // Optional function call: fn?.(...)
            // NOT allowed across lines (checked above)
            ALT: () => {
              this.CONSUME(QuestionDot);
              this.CONSUME(LeftParen);
              this.OPTION(() => {
                this.SUBRULE(this.argumentList);
              });
              this.CONSUME(RightParen);
              lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
            },
          },
          {
            // Regular function call: fn(...)
            // NOT allowed across lines (checked above)
            ALT: () => {
              this.CONSUME1(LeftParen);
              this.OPTION8(() => {
                this.SUBRULE1(this.argumentList);
              });
              this.CONSUME1(RightParen);
              lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
            },
          },
        ]);
        // After a function call, allow chaining more member access
        this.OPTION1(() => {
          this.MANY1(() => {
            const nextToken = this.LA(1);

            // For bracket access, check if on same line (same logic as memberAccess rule)
            if (nextToken && (nextToken.tokenType === LeftBracket ||
                (nextToken.tokenType === QuestionDot && this.LA(2) && this.LA(2).tokenType === LeftBracket))) {
              if (lastTokenLine && nextToken.startLine > lastTokenLine) {
                return; // Stop bracket access across lines
              }
            }

            this.OR1([
              {
                // Optional chaining property access: obj?.prop
                // Allowed across lines for method chaining
                ALT: () => {
                  this.CONSUME1(QuestionDot);
                  this.CONSUME1(Identifier);
                  lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
                },
              },
              {
                // Regular property access: obj.prop
                // Allowed across lines for method chaining
                ALT: () => {
                  this.CONSUME(Dot);
                  this.CONSUME2(Identifier);
                  lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
                },
              },
              {
                // Optional chaining bracket access: obj?.[expr]
                // NOT allowed across lines (checked above)
                ALT: () => {
                  this.CONSUME2(QuestionDot);
                  this.CONSUME(LeftBracket);
                  const la1 = this.LA(1);

                  // Pattern: [...] - copy entire array
                  if (la1 && la1.tokenType === DotDotDot) {
                    this.CONSUME(DotDotDot);
                    this.CONSUME(RightBracket);
                  } else {
                    // Pattern: [start...end] - array slice
                    this.OPTION2(() => {
                      this.SUBRULE(this.expression);
                    });
                    this.OPTION3(() => {
                      this.CONSUME(DotDotDot);
                      this.OPTION4(() => {
                        this.SUBRULE1(this.expression);
                      });
                    });
                    this.CONSUME(RightBracket);
                  }
                  lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
                },
              },
              {
                // Regular bracket access: obj[expr]
                // NOT allowed across lines (checked above)
                ALT: () => {
                  this.CONSUME1(LeftBracket);
                  const la1 = this.LA(1);

                  // Pattern: [...] - copy entire array
                  if (la1 && la1.tokenType === DotDotDot) {
                    this.CONSUME1(DotDotDot);
                    this.CONSUME1(RightBracket);
                  } else {
                    // Pattern: [start...end] - array slice
                    this.OPTION5(() => {
                      this.SUBRULE2(this.expression);
                    });
                    this.OPTION6(() => {
                      this.CONSUME2(DotDotDot);
                      this.OPTION7(() => {
                        this.SUBRULE3(this.expression);
                      });
                    });
                    this.CONSUME2(RightBracket);
                  }
                  lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
                },
              },
            ]);
          });
        });
      });
    });

    this.RULE('argumentList', () => {
      this.OR([
        {
          // Spread argument: ...expr
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === DotDotDot;
          },
          ALT: () => {
            this.CONSUME(DotDotDot);
            this.SUBRULE(this.expression);
          },
        },
        {
          // Regular argument: expr
          ALT: () => {
            this.SUBRULE1(this.expression);
          },
        },
      ]);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.OR1([
          {
            // Spread argument: ...expr
            GATE: () => {
              const la1 = this.LA(1);
              return la1 && la1.tokenType === DotDotDot;
            },
            ALT: () => {
              this.CONSUME1(DotDotDot);
              this.SUBRULE2(this.expression);
            },
          },
          {
            // Regular argument: expr
            ALT: () => {
              this.SUBRULE3(this.expression);
            },
          },
        ]);
      });
      // Allow trailing comma
      this.OPTION(() => {
        this.CONSUME2(Comma);
      });
    });

    // Member access
    this.RULE('memberAccess', () => {
      this.SUBRULE(this.primary);
      let lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : null;
      this.MANY(() => {
        const nextToken = this.LA(1);

        // Stop if we see QuestionDot followed by LeftParen (that's a function call, not member access)
        if (nextToken && nextToken.tokenType === QuestionDot) {
          const tokenAfter = this.LA(2);
          if (tokenAfter && tokenAfter.tokenType === LeftParen) {
            return; // Let functionCall handle this
          }
        }

        // For bracket access (not dot access), check if on same line
        // This prevents [1,2]\n[3,4] from being parsed as bracket access
        if (nextToken && (nextToken.tokenType === LeftBracket ||
            (nextToken.tokenType === QuestionDot && this.LA(2) && this.LA(2).tokenType === LeftBracket))) {
          if (lastTokenLine && nextToken.startLine > lastTokenLine) {
            return; // Stop bracket access across lines
          }
        }

        this.OR([
          {
            // Optional chaining property access: obj?.prop
            // But NOT obj?.(  which is a function call
            // Allowed across lines for method chaining
            GATE: () => {
              const la1 = this.LA(1);
              const la2 = this.LA(2);
              return la1 && la1.tokenType === QuestionDot && la2 && la2.tokenType === Identifier;
            },
            ALT: () => {
              this.CONSUME(QuestionDot);
              this.CONSUME(Identifier);
              lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
            },
          },
          {
            // Regular property access: obj.prop
            // Allowed across lines for method chaining
            ALT: () => {
              this.CONSUME(Dot);
              this.CONSUME1(Identifier);
              lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
            },
          },
          {
            // Optional chaining bracket access: obj?.[expr]
            // NOT allowed across lines (checked above)
            GATE: () => {
              const la1 = this.LA(1);
              const la2 = this.LA(2);
              return la1 && la1.tokenType === QuestionDot && la2 && la2.tokenType === LeftBracket;
            },
            ALT: () => {
              this.CONSUME1(QuestionDot);
              this.CONSUME(LeftBracket);
              const la1 = this.LA(1);

              // Pattern: [...] - copy entire array
              if (la1 && la1.tokenType === DotDotDot) {
                const la2 = this.LA(2);
                if (la2 && la2.tokenType === RightBracket) {
                  this.CONSUME(DotDotDot);
                  this.CONSUME(RightBracket);
                } else {
                  // This shouldn't happen, but handle it
                  this.CONSUME(DotDotDot);
                  this.CONSUME(RightBracket);
                }
              }
              // Pattern: [expression...] or [expression...expression] or [expression]
              else {
                this.SUBRULE(this.expression);
                const laAfterExpr = this.LA(1);

                // Pattern: [expression...expression] - slice with start and end
                if (laAfterExpr && laAfterExpr.tokenType === DotDotDot) {
                  const laAfterDotDotDot = this.LA(2);
                  // Check if there's an expression after the DotDotDot
                  if (laAfterDotDotDot && laAfterDotDotDot.tokenType !== RightBracket) {
                    this.CONSUME(DotDotDot);
                    this.SUBRULE1(this.expression);
                    this.CONSUME(RightBracket);
                  }
                  // Pattern: [expression...] - slice from start
                  else {
                    this.CONSUME(DotDotDot);
                    this.CONSUME(RightBracket);
                  }
                }
                // Pattern: [expression] - regular bracket access
                else {
                  this.CONSUME(RightBracket);
                }
              }
              lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
            },
          },
          {
            // Regular bracket access: obj[expr]
            // NOT allowed across lines (checked above)
            ALT: () => {
              this.CONSUME1(LeftBracket);
              const la1 = this.LA(1);

              // Pattern: [...] - copy entire array
              if (la1 && la1.tokenType === DotDotDot) {
                const la2 = this.LA(2);
                if (la2 && la2.tokenType === RightBracket) {
                  this.CONSUME1(DotDotDot);
                  this.CONSUME1(RightBracket);
                } else {
                  // This shouldn't happen, but handle it
                  this.CONSUME2(DotDotDot);
                  this.CONSUME2(RightBracket);
                }
              }
              // Pattern: [expression...] or [expression...expression] or [expression]
              else {
                this.SUBRULE1(this.expression);
                const laAfterExpr = this.LA(1);

                // Pattern: [expression...expression] - slice with start and end
                if (laAfterExpr && laAfterExpr.tokenType === DotDotDot) {
                  const laAfterDotDotDot = this.LA(2);
                  // Check if there's an expression after the DotDotDot
                  if (laAfterDotDotDot && laAfterDotDotDot.tokenType !== RightBracket) {
                    this.CONSUME3(DotDotDot);
                    this.SUBRULE2(this.expression);
                    this.CONSUME3(RightBracket);
                  }
                  // Pattern: [expression...] - slice from start
                  else {
                    this.CONSUME4(DotDotDot);
                    this.CONSUME4(RightBracket);
                  }
                }
                // Pattern: [expression] - regular bracket access
                else {
                  this.CONSUME5(RightBracket);
                }
              }
              lastTokenLine = this.LA(0) ? this.LA(0).endLine || this.LA(0).startLine : lastTokenLine;
            },
          },
        ]);
      });
    });

    // Primary expressions
    // Note: Arrow functions with single param (x =>) are unambiguous
    // For multi-param arrow functions ((x, y) =>), we parse them separately
    this.RULE('primary', () => {
      this.OR([
        { ALT: () => this.SUBRULE(this.literal) },
        { ALT: () => this.SUBRULE(this.arrayLiteral) },
        { ALT: () => this.SUBRULE(this.objectLiteral) },
        {
          // JSX Fragment: <> ... </>
          GATE: () => {
            const la1 = this.LA(1);
            const la2 = this.LA(2);
            // Must start with < followed by > (fragment opening)
            return la1 && la1.tokenType === LessThan &&
                   la2 && la2.tokenType === GreaterThan;
          },
          ALT: () => this.SUBRULE(this.jsxFragment)
        },
        {
          // JSX Element: <TagName ...> or <TagName />
          GATE: () => {
            const la1 = this.LA(1);
            const la2 = this.LA(2);
            // Must start with < followed by an identifier (tag name)
            return la1 && la1.tokenType === LessThan &&
                   la2 && la2.tokenType === Identifier;
          },
          ALT: () => this.SUBRULE(this.jsxElement)
        },
        // Single-param arrow function (unambiguous: x =>)
        {
          GATE: () => {
            const la1 = this.LA(1);
            const la2 = this.LA(2);
            const la3 = this.LA(3);
            return la1 && la1.tokenType === Identifier &&
                   la2 && la2.tokenType === Equal &&
                   la3 && la3.tokenType === GreaterThan;
          },
          ALT: () => this.SUBRULE(this.arrowFunction),
        },
        // Parenthesized expression or multi-param arrow function
        { ALT: () => this.SUBRULE(this.parenthesizedExpression) },
        { ALT: () => this.SUBRULE(this.identifier) },
      ]);
    });

    // Literals
    this.RULE('literal', () => {
      this.OR([
        { ALT: () => this.CONSUME(NumberLiteral) },
        { ALT: () => this.CONSUME(StringLiteral) },
        { ALT: () => this.SUBRULE(this.templateLiteral) },
        { ALT: () => this.CONSUME(True) },
        { ALT: () => this.CONSUME(False) },
        { ALT: () => this.CONSUME(Null) },
      ]);
    });

    // Template literal
    this.RULE('templateLiteral', () => {
      this.CONSUME(TemplateLiteral);
    });

    // Array literal
    this.RULE('arrayLiteral', () => {
      this.CONSUME(LeftBracket);
      this.OPTION(() => {
        this.SUBRULE(this.arrayElementList);
      });
      this.CONSUME(RightBracket);
    });

    this.RULE('arrayElementList', () => {
      this.OR([
        {
          // Spread element: ...expr
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === DotDotDot;
          },
          ALT: () => {
            this.CONSUME(DotDotDot);
            this.SUBRULE(this.expression);
          },
        },
        {
          // Regular element: expr
          ALT: () => {
            this.SUBRULE1(this.expression);
          },
        },
      ]);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.OR1([
          {
            // Spread element: ...expr
            GATE: () => {
              const la1 = this.LA(1);
              return la1 && la1.tokenType === DotDotDot;
            },
            ALT: () => {
              this.CONSUME1(DotDotDot);
              this.SUBRULE2(this.expression);
            },
          },
          {
            // Regular element: expr
            ALT: () => {
              this.SUBRULE3(this.expression);
            },
          },
        ]);
      });
      // Allow trailing comma
      this.OPTION(() => {
        this.CONSUME1(Comma);
      });
    });

    // Object literal
    this.RULE('objectLiteral', () => {
      this.CONSUME(LeftBrace);
      this.OPTION(() => {
        this.SUBRULE(this.objectPropertyList);
      });
      this.CONSUME(RightBrace);
    });

    this.RULE('objectPropertyList', () => {
      this.SUBRULE(this.objectProperty);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.SUBRULE2(this.objectProperty);
      });
      // Allow trailing comma
      this.OPTION(() => {
        this.CONSUME1(Comma);
      });
    });

    this.RULE('objectProperty', () => {
      this.OR([
        {
          // Spread property: ...expr
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === DotDotDot;
          },
          ALT: () => {
            this.CONSUME(DotDotDot);
            this.SUBRULE(this.expression);
          },
        },
        {
          // Computed key: [expr]: value
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === LeftBracket;
          },
          ALT: () => {
            this.CONSUME(LeftBracket);
            this.SUBRULE1(this.expression); // Key expression
            this.CONSUME(RightBracket);
            this.CONSUME(Colon);
            this.SUBRULE2(this.expression); // Value expression
          },
        },
        {
          ALT: () => {
            // Key-value: key: value
            this.OR1([
              { ALT: () => this.CONSUME1(Identifier) },
              { ALT: () => this.CONSUME(StringLiteral) },
            ]);
            this.CONSUME1(Colon);
            this.SUBRULE3(this.expression); // Value expression
          },
        },
        {
          ALT: () => {
            // Shorthand: key
            this.CONSUME2(Identifier);
          },
        },
      ]);
    });

    // Arrow function
    // Only single-param arrow functions (x =>) are parsed here to avoid ambiguity
    // Multi-param arrow functions ((x, y) =>) are handled via parenthesizedExpression + optional =>
    this.RULE('arrowFunction', () => {
      // Single parameter without parens: x => expr or x => { ... }
      this.CONSUME(Identifier);
      this.CONSUME(Equal);
      this.CONSUME(GreaterThan);
      this.OR([
        {
          // Block body: x => { ... }
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === LeftBrace;
          },
          ALT: () => {
            this.SUBRULE(this.blockStatement);
          },
        },
        {
          // Expression body: x => expr
          ALT: () => {
            this.SUBRULE(this.expression);
          },
        },
      ]);
    });

    this.RULE('parameterList', () => {
      this.OR([
        {
          // Rest parameter: ...rest
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === DotDotDot;
          },
          ALT: () => {
            this.CONSUME(DotDotDot);
            this.CONSUME(Identifier);
          },
        },
        {
          // Destructuring pattern: [a, b] or {a, b} or [a, b] = default or {a, b} = default
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && (la1.tokenType === LeftBracket || la1.tokenType === LeftBrace);
          },
          ALT: () => {
            this.SUBRULE(this.destructuringPattern);
            this.OPTION(() => {
              this.CONSUME(Equal);
              this.SUBRULE(this.expression);
            });
          },
        },
        {
          // Regular parameter: identifier or identifier = expression
          ALT: () => {
            this.CONSUME1(Identifier);
            this.OPTION1(() => {
              this.CONSUME1(Equal);
              this.SUBRULE1(this.expression);
            });
          },
        },
      ]);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.OR1([
          {
            // Rest parameter: ...rest (must be last)
            GATE: () => {
              const la1 = this.LA(1);
              return la1 && la1.tokenType === DotDotDot;
            },
            ALT: () => {
              this.CONSUME1(DotDotDot);
              this.CONSUME2(Identifier);
            },
          },
          {
            // Destructuring pattern: [a, b] or {a, b} or [a, b] = default or {a, b} = default
            GATE: () => {
              const la1 = this.LA(1);
              return la1 && (la1.tokenType === LeftBracket || la1.tokenType === LeftBrace);
            },
            ALT: () => {
              this.SUBRULE1(this.destructuringPattern);
              this.OPTION2(() => {
                this.CONSUME2(Equal);
                this.SUBRULE2(this.expression);
              });
            },
          },
          {
            // Regular parameter: identifier or identifier = expression
            ALT: () => {
              this.CONSUME3(Identifier);
              this.OPTION3(() => {
                this.CONSUME3(Equal);
                this.SUBRULE3(this.expression);
              });
            },
          },
        ]);
      });
      // Allow trailing comma
      this.OPTION4(() => {
        this.CONSUME1(Comma);
      });
    });

    // JSX Element
    // Note: JSX parsing is complex because < and > are ambiguous
    // For now, we'll use LessThan and GreaterThan tokens
    this.RULE('jsxElement', () => {
      this.CONSUME(LessThan);
      this.SUBRULE1(this.jsxElementName);
      this.MANY1(() => {
        this.SUBRULE(this.jsxAttribute);
      });
      this.OR([
        {
          ALT: () => {
            // Self-closing: />
            this.CONSUME(JSXSelfClosing);
          },
        },
        {
          ALT: () => {
            // Opening tag with children: >
            this.CONSUME1(GreaterThan);
            this.MANY2(() => {
              this.SUBRULE(this.jsxChild);
            });
            this.CONSUME(JSXCloseTagStart);
            this.SUBRULE2(this.jsxElementName);
            this.CONSUME2(GreaterThan);
          },
        },
      ]);
    });

    // JSX Fragment: <> ... </>
    this.RULE('jsxFragment', () => {
      this.CONSUME(LessThan);
      this.CONSUME(GreaterThan);
      this.MANY(() => {
        this.SUBRULE(this.jsxChild);
      });
      this.CONSUME(JSXCloseTagStart);
      this.CONSUME1(GreaterThan);
    });

    this.RULE('jsxElementName', () => {
      this.CONSUME(Identifier);
      this.MANY(() => {
        this.OR([
          {
            ALT: () => {
              this.CONSUME(Dot);
              this.CONSUME1(Identifier);
            },
          },
          {
            ALT: () => {
              this.CONSUME(Minus);
              this.CONSUME2(Identifier);
            },
          },
        ]);
      });
    });

    this.RULE('jsxAttribute', () => {
      this.OR([
        {
          ALT: () => {
            // Spread: {...expr}
            this.CONSUME(LeftBrace);
            this.CONSUME(DotDotDot);
            this.SUBRULE(this.expression);
            this.CONSUME(RightBrace);
          },
        },
        {
          ALT: () => {
            // Regular: key="value" or key={expr} or key
            // Attribute names can contain hyphens: data-value, aria-label, etc.
            this.CONSUME(Identifier);
            this.MANY(() => {
              this.CONSUME(Minus);
              this.CONSUME1(Identifier);
            });
            this.OPTION(() => {
              this.CONSUME(Equal);
              this.SUBRULE(this.jsxAttributeValue);
            });
          },
        },
      ]);
    });

    this.RULE('jsxAttributeValue', () => {
      this.OR([
        { ALT: () => this.CONSUME(StringLiteral) },
        {
          ALT: () => {
            this.CONSUME(LeftBrace);
            this.SUBRULE(this.expression);
            this.CONSUME(RightBrace);
          },
        },
      ]);
    });

    this.RULE('jsxChild', () => {
      this.OR([
        {
          // JSX Fragment: <>...</>
          GATE: () => {
            const la1 = this.LA(1);
            const la2 = this.LA(2);
            // Fragment starts with < followed by >
            return la1 && la1.tokenType === LessThan &&
                   la2 && la2.tokenType === GreaterThan;
          },
          ALT: () => this.SUBRULE(this.jsxFragment),
        },
        {
          // JSX element: <tag> or </tag>
          GATE: () => {
            const la1 = this.LA(1);
            const la2 = this.LA(2);
            // Element starts with < followed by identifier
            return la1 && la1.tokenType === LessThan &&
                   la2 && la2.tokenType === Identifier;
          },
          ALT: () => this.SUBRULE(this.jsxElement),
        },
        {
          // JSX expression: {expr} or {} (empty expression for comments)
          GATE: () => {
            const la1 = this.LA(1);
            return la1 && la1.tokenType === LeftBrace;
          },
          ALT: () => {
            this.CONSUME(LeftBrace);
            // Check if next token is RightBrace (empty expression/comment)
            const la1 = this.LA(1);
            if (la1 && la1.tokenType === RightBrace) {
              // Empty expression {} - used for JSX comments {/* ... */}
              this.CONSUME(RightBrace);
            } else {
              // Regular expression
              this.SUBRULE(this.expression);
              this.CONSUME(RightBrace);
            }
          },
        },
        {
          // JSX text: consume ANY tokens until we hit < or { or </
          ALT: () => {
            // Consume one or more tokens as JSX text
            // Use MANY to repeat, checking each time if we should stop
            this.MANY({
              GATE: () => {
                const la1 = this.LA(1);
                if (!la1) return false;
                // Stop if we hit JSX tag start, closing tag, or expression
                if (la1.tokenType === LessThan ||
                    la1.tokenType.name === 'JSXCloseTagStart' ||
                    la1.tokenType === LeftBrace) {
                  return false;
                }
                return true; // Continue consuming ANY token
              },
              DEF: () => {
                // Consume ANY token type - match all possible tokens
                // This allows any token to be part of JSX text until we hit < or { or </
                // We need to list all token types to ensure everything is matched
                this.OR1([
                  // Literals
                  { ALT: () => this.CONSUME(Identifier) },
                  { ALT: () => this.CONSUME(StringLiteral) },
                  { ALT: () => this.CONSUME(NumberLiteral) },
                  { ALT: () => this.CONSUME(TemplateLiteral) },
                  // Keywords
                  { ALT: () => this.CONSUME(Return) },
                  { ALT: () => this.CONSUME(True) },
                  { ALT: () => this.CONSUME(False) },
                  { ALT: () => this.CONSUME(Null) },
                  { ALT: () => this.CONSUME(Typeof) },
                  { ALT: () => this.CONSUME(Void) },
                  { ALT: () => this.CONSUME(Delete) },
                  { ALT: () => this.CONSUME(Instanceof) },
                  { ALT: () => this.CONSUME(In) },
                  { ALT: () => this.CONSUME(Export) },
                  { ALT: () => this.CONSUME(Import) },
                  { ALT: () => this.CONSUME(From) },
                  { ALT: () => this.CONSUME(Default) },
                  { ALT: () => this.CONSUME(As) },
                  { ALT: () => this.CONSUME(Modifier) },
                  // Operators
                  { ALT: () => this.CONSUME(PlusPlus) },
                  { ALT: () => this.CONSUME(MinusMinus) },
                  { ALT: () => this.CONSUME(StarStarColonEqual) },
                  { ALT: () => this.CONSUME(LeftShiftColonEqual) },
                  { ALT: () => this.CONSUME(RightShiftColonEqual) },
                  { ALT: () => this.CONSUME(UnsignedRightShiftColonEqual) },
                  { ALT: () => this.CONSUME(PlusColonEqual) },
                  { ALT: () => this.CONSUME(MinusColonEqual) },
                  { ALT: () => this.CONSUME(StarColonEqual) },
                  { ALT: () => this.CONSUME(SlashColonEqual) },
                  { ALT: () => this.CONSUME(PercentColonEqual) },
                  { ALT: () => this.CONSUME(AndColonEqual) },
                  { ALT: () => this.CONSUME(OrColonEqual) },
                  { ALT: () => this.CONSUME(CaretColonEqual) },
                  { ALT: () => this.CONSUME(AndAndColonEqual) },
                  { ALT: () => this.CONSUME(OrOrColonEqual) },
                  { ALT: () => this.CONSUME(QuestionQuestionColonEqual) },
                  { ALT: () => this.CONSUME(EqualEqual) },
                  { ALT: () => this.CONSUME(BangEqual) },
                  { ALT: () => this.CONSUME(LessThanEqual) },
                  { ALT: () => this.CONSUME(GreaterThanEqual) },
                  { ALT: () => this.CONSUME(Pipe) },
                  { ALT: () => this.CONSUME(Compose) },
                  { ALT: () => this.CONSUME(LeftShift) },
                  { ALT: () => this.CONSUME(UnsignedRightShift) },
                  { ALT: () => this.CONSUME(RightShift) },
                  { ALT: () => this.CONSUME(StarStar) },
                  { ALT: () => this.CONSUME(AndAnd) },
                  { ALT: () => this.CONSUME(OrOr) },
                  { ALT: () => this.CONSUME(Equal) },
                  { ALT: () => this.CONSUME(Plus) },
                  { ALT: () => this.CONSUME(Minus) },
                  { ALT: () => this.CONSUME(Star) },
                  { ALT: () => this.CONSUME(Percent) },
                  { ALT: () => this.CONSUME(GreaterThan) },
                  { ALT: () => this.CONSUME(Slash) },
                  { ALT: () => this.CONSUME(And) },
                  { ALT: () => this.CONSUME(Or) },
                  { ALT: () => this.CONSUME(Caret) },
                  { ALT: () => this.CONSUME(Bang) },
                  { ALT: () => this.CONSUME(Tilde) },
                  { ALT: () => this.CONSUME(QuestionQuestion) },
                  { ALT: () => this.CONSUME(Question) },
                  { ALT: () => this.CONSUME(ColonEqual) },
                  { ALT: () => this.CONSUME(Colon) },
                  // Punctuation
                  { ALT: () => this.CONSUME(LeftParen) },
                  { ALT: () => this.CONSUME(RightParen) },
                  { ALT: () => this.CONSUME(LeftBracket) },
                  { ALT: () => this.CONSUME(RightBracket) },
                  { ALT: () => this.CONSUME1(RightBrace) },
                  { ALT: () => this.CONSUME(Comma) },
                  { ALT: () => this.CONSUME(DotDotDot) },
                  { ALT: () => this.CONSUME(Dot) },
                  { ALT: () => this.CONSUME(Semicolon) },
                  // Whitespace (if not skipped)
                  { ALT: () => this.CONSUME(WhiteSpace) },
                ]);
              },
            });
          },
        },
      ]);
    });

    // Parenthesized expression
    // Also handles arrow functions: () =>, (a) =>, (x, y) =>, (x, ...rest) =>
    // After parsing (expr), we check if => follows
    this.RULE('parenthesizedExpression', () => {
      this.CONSUME(LeftParen);
      // Check if it's a parameter list or an expression
      this.OR([
        {
          // Arrow function parameter list: () =>, (a) =>, (x, y) =>, (x, ...rest) =>, (...args) =>
          // Check if => follows the closing paren
          GATE: () => {
            // Any parentheses followed by => must be parsed as an arrow function parameter list
            // Look ahead to find the matching closing paren and check if => follows
            let depth = 1;
            let i = 1;
            while (i < MAX_TOKEN_LOOKAHEAD_COUNT) {
              const token = this.LA(i);
              if (!token) break;
              if (token.tokenType === LeftParen) depth++;
              if (token.tokenType === RightParen) {
                depth--;
                if (depth === 0) {
                  // Found the matching closing paren, check if => follows
                  const nextToken = this.LA(i + 1);
                  const afterNext = this.LA(i + 2);
                  return nextToken && nextToken.tokenType === Equal &&
                         afterNext && afterNext.tokenType === GreaterThan;
                }
              }
              i++;
            }
            return false;
          },
          ALT: () => {
            // Parameter list is optional (empty () => is valid)
            this.OPTION(() => {
              this.SUBRULE(this.parameterList);
            });
            this.CONSUME(RightParen);
            // If => follows, this is an arrow function
            this.CONSUME(Equal);
            this.CONSUME1(GreaterThan);
            this.OR1([
              {
                // Block body: (x, y) => { ... }
                GATE: () => {
                  const la1 = this.LA(1);
                  return la1 && la1.tokenType === LeftBrace;
                },
                ALT: () => {
                  this.SUBRULE(this.blockStatement);
                },
              },
              {
                // Expression body: (x, y) => expr
                ALT: () => {
                  this.SUBRULE1(this.expression);
                },
              },
            ]);
          },
        },
        {
          // Regular parenthesized expression: (expr)
          // This alternative should NOT be used if => follows (that's handled by the arrow function alternative above)
          GATE: () => {
            // Look ahead to find the matching closing paren and check if => follows
            // If => follows, we should use the arrow function alternative instead
            let depth = 1;
            let i = 1;
            while (i < MAX_TOKEN_LOOKAHEAD_COUNT) {
              const token = this.LA(i);
              if (!token) break;
              if (token.tokenType === LeftParen) depth++;
              if (token.tokenType === RightParen) {
                depth--;
                if (depth === 0) {
                  // Found the matching closing paren, check if => follows
                  const nextToken = this.LA(i + 1);
                  const afterNext = this.LA(i + 2);
                  // If => follows, return false to prevent this alternative from being used
                  if (nextToken && nextToken.tokenType === Equal &&
                      afterNext && afterNext.tokenType === GreaterThan) {
                    return false;
                  }
                  // => does not follow, this is a regular parenthesized expression
                  return true;
                }
              }
              i++;
            }
            // If we can't find the closing paren, allow this alternative
            return true;
          },
          ALT: () => {
            this.SUBRULE2(this.expression);
            this.CONSUME1(RightParen);
          },
        },
      ]);
    });

    // Identifier
    this.RULE('identifier', () => {
      this.CONSUME(Identifier);
    });

    // Must call this after all rules are defined
    // Note: Chevrotain requires performSelfAnalysis() to succeed
    // We've structured the grammar to avoid ambiguity by:
    // 1. Parsing single-param arrow functions (x =>) separately
    // 2. Handling multi-param arrow functions ((x, y) =>) via parenthesizedExpression + optional =>
    this.performSelfAnalysis();
  }
}

export const parser = new OddoParser();
