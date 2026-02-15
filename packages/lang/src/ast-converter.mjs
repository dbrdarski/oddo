/**
 * AST Converter for Oddo Language
 * Converts Chevrotain CST to Oddo AST format
 */

import { parseOddoExpression } from './index.mjs';

// Module-level variable to store source text for JSX text extraction
let sourceText = '';

// Helper functions
function getTokenValue(token) {
  if (!token) return null;
  if (Array.isArray(token)) return token.map(getTokenValue);
  return token.image || token.tokenType?.name;
}

function getFirstChild(node, ruleName) {
  const children = node.children?.[ruleName];
  return children && children.length > 0 ? children[0] : null;
}

function getAllChildren(node, ruleName) {
  return node.children?.[ruleName] || [];
}

// Helper function to find the first token's start offset in a CST node
function getFirstTokenOffset(node) {
  if (!node) return undefined;

  // If this node has a startOffset, return it
  if (node.startOffset !== undefined) {
    return node.startOffset;
  }

  // If this node has children, recursively search them
  if (node.children) {
    for (const key in node.children) {
      const children = node.children[key];
      if (Array.isArray(children)) {
        for (const child of children) {
          const offset = getFirstTokenOffset(child);
          if (offset !== undefined) {
            return offset;
          }
        }
      }
    }
  }

  return undefined;
}

// Convert statement
function convertStatement(cst) {
  if (cst.children.exportStatement) {
    return convertExportStatement(getFirstChild(cst, 'exportStatement'));
  }
  if (cst.children.importStatement) {
    return convertImportStatement(getFirstChild(cst, 'importStatement'));
  }
  if (cst.children.returnStatement) {
    return convertReturnStatement(getFirstChild(cst, 'returnStatement'));
  }
  if (cst.children.expressionStatement) {
    return convertExpressionStatement(getFirstChild(cst, 'expressionStatement'));
  }
  if (cst.children.modifierBlockStatement) {
    return convertModifierBlockStatement(getFirstChild(cst, 'modifierBlockStatement'));
  }
  return null;
}

function convertModifierBlockStatement(cst) {
  const modifier = cst.children.Modifier?.[0];
  const block = getFirstChild(cst, 'blockStatement');

  return {
    type: 'expressionStatement',
    modifier: modifier ? modifier.image.slice(1) : null, // Remove @
    expression: null,
    block: block ? {
      type: 'blockStatement',
      body: getAllChildren(block, 'statement').map(convertStatement),
    } : null,
  };
}

function convertReturnStatement(cst) {
  const modifier = cst.children.Modifier?.[0];
  const argument = getFirstChild(cst, 'expression');

  return {
      type: 'returnStatement',
      modifier: modifier ? modifier.image.slice(1) : null, // Remove @
      argument: argument ? convertExpression(argument) : null,
    };
  }

function convertExpressionStatement(cst) {
  const modifier = cst.children.Modifier?.[0];
  const expression = getFirstChild(cst, 'expression');
  // Note: Colon + blockStatement is no longer allowed in expressionStatement
  // Blocks are only allowed with modifiers (@modifier: { ... }) or arrow functions (x => { ... })

  return {
      type: 'expressionStatement',
      modifier: modifier ? modifier.image.slice(1) : null,
      expression: expression ? convertExpression(expression) : null,
      block: null,
    };
  }

function convertExportStatement(cst) {
  // Check for export default
  if (cst.children.Default && cst.children.Default.length > 0) {
    const expression = getFirstChild(cst, 'expression');
    return {
      type: 'exportDefaultStatement',
      declaration: expression ? convertExpression(expression) : null,
    };
  }

  // Check for export { x, y }
  if (cst.children.LeftBrace && cst.children.LeftBrace.length > 0) {
    const specifierList = getFirstChild(cst, 'exportSpecifierList');
    const specifiers = specifierList ? getAllChildren(specifierList, 'exportSpecifier').map(convertExportSpecifier) : [];
    return {
      type: 'exportNamedStatement',
      specifiers,
    };
  }

  // export x = 1 (named export of assignment)
  const expressionStatement = getFirstChild(cst, 'expressionStatement');
  if (expressionStatement) {
    return {
      type: 'exportNamedStatement',
      declaration: convertExpressionStatement(expressionStatement),
    };
  }

  return null;
}

function convertExportSpecifier(cst) {
  const local = cst.children.Identifier?.[0]?.image;
  const exported = cst.children.Identifier?.[1]?.image || local; // Use second identifier if 'as' is present

  return {
    type: 'exportSpecifier',
    local,
    exported,
  };
}

function convertImportStatement(cst) {
  // Check for import * as ns from "module"
  if (cst.children.Star && cst.children.Star.length > 0) {
    const namespace = cst.children.Identifier?.[0]?.image;
    const source = cst.children.StringLiteral?.[0]?.image?.slice(1, -1); // Remove quotes

    return {
      type: 'importNamespaceStatement',
      namespace,
      source,
    };
  }

  // Check for import defaultName from "module" or import defaultName, { x } from "module"
  const defaultName = cst.children.Identifier?.[0]?.image;
  const hasComma = cst.children.Comma && cst.children.Comma.length > 0;
  const source = cst.children.StringLiteral?.[0]?.image?.slice(1, -1); // Remove quotes

  if (hasComma) {
    // import defaultName, { x } from "module"
    const specifierList = getFirstChild(cst, 'importSpecifierList');
    const specifiers = specifierList ? getAllChildren(specifierList, 'importSpecifier').map(convertImportSpecifier) : [];

    return {
      type: 'importStatement',
      defaultImport: defaultName,
      specifiers,
      source,
    };
  }

  // Check for import { x, y } from "module"
  if (cst.children.LeftBrace && cst.children.LeftBrace.length > 0) {
    const specifierList = getFirstChild(cst, 'importSpecifierList');
    const specifiers = specifierList ? getAllChildren(specifierList, 'importSpecifier').map(convertImportSpecifier) : [];

    return {
      type: 'importStatement',
      defaultImport: null,
      specifiers,
      source,
    };
  }

  // import defaultName from "module"
  if (defaultName && source) {
    return {
      type: 'importStatement',
      defaultImport: defaultName,
      specifiers: [],
      source,
    };
  }

  return null;
}

function convertImportSpecifier(cst) {
  const imported = cst.children.Identifier?.[0]?.image;
  const local = cst.children.Identifier?.[1]?.image || imported; // Use second identifier if 'as' is present

  return {
    type: 'importSpecifier',
    imported,
    local,
  };
}

// Convert expression
// Optional source parameter for entry point calls (sets sourceText for JSX whitespace)
export function convertExpression(cst, source) {
  if (!cst) return null;
  
  // If source provided (entry point call), store it for JSX text extraction
  if (source !== undefined) {
    sourceText = source;
  }

  // Check node name first (for recursive calls on nested nodes)
  const nodeName = cst.name;
  if (nodeName === 'assignment') return convertAssignment(cst);
  if (nodeName === 'conditional') return convertConditional(cst);
  if (nodeName === 'logicalOr') return convertLogicalOr(cst);
  if (nodeName === 'pipe') return convertPipe(cst);
  if (nodeName === 'compose') return convertCompose(cst);
  if (nodeName === 'nullishCoalescing') return convertNullishCoalescing(cst);
  if (nodeName === 'logicalAnd') return convertLogicalAnd(cst);
  if (nodeName === 'equality') return convertEquality(cst);
  if (nodeName === 'relational') return convertRelational(cst);
  if (nodeName === 'additive') return convertAdditive(cst);
  if (nodeName === 'multiplicative') return convertMultiplicative(cst);
  if (nodeName === 'exponentiation') return convertExponentiation(cst);
  if (nodeName === 'unary') return convertUnary(cst);
  if (nodeName === 'postfix') return convertPostfix(cst);
  if (nodeName === 'functionCall') return convertFunctionCall(cst);
  if (nodeName === 'memberAccess') return convertMemberAccess(cst);
  if (nodeName === 'primary') return convertPrimary(cst);

  // Check children (for top-level expression nodes)
  // Assignment
  if (cst.children.assignment) {
      return convertAssignment(getFirstChild(cst, 'assignment'));
  }

    // Conditional
  if (cst.children.conditional) {
      return convertConditional(getFirstChild(cst, 'conditional'));
  }

    // Logical OR
  if (cst.children.logicalOr) {
      return convertLogicalOr(getFirstChild(cst, 'logicalOr'));
  }

    // Pipe
  if (cst.children.pipe) {
      return convertPipe(getFirstChild(cst, 'pipe'));
  }

    // Compose
  if (cst.children.compose) {
      return convertCompose(getFirstChild(cst, 'compose'));
  }

    // Nullish Coalescing
  if (cst.children.nullishCoalescing) {
      return convertNullishCoalescing(getFirstChild(cst, 'nullishCoalescing'));
  }

    // Logical AND
  if (cst.children.logicalAnd) {
      return convertLogicalAnd(getFirstChild(cst, 'logicalAnd'));
  }

    // Equality
  if (cst.children.equality) {
      return convertEquality(getFirstChild(cst, 'equality'));
  }

    // Relational
  if (cst.children.relational) {
      return convertRelational(getFirstChild(cst, 'relational'));
  }

    // Additive
  if (cst.children.additive) {
      return convertAdditive(getFirstChild(cst, 'additive'));
  }

    // Multiplicative
  if (cst.children.multiplicative) {
      return convertMultiplicative(getFirstChild(cst, 'multiplicative'));
  }

    // Exponentiation
  if (cst.children.exponentiation) {
      return convertExponentiation(getFirstChild(cst, 'exponentiation'));
  }

    // Unary
  if (cst.children.unary) {
      return convertUnary(getFirstChild(cst, 'unary'));
  }

    // Postfix
  if (cst.children.postfix) {
      return convertPostfix(getFirstChild(cst, 'postfix'));
  }

    // Function call
  if (cst.children.functionCall) {
      return convertFunctionCall(getFirstChild(cst, 'functionCall'));
  }

    // Member access
  if (cst.children.memberAccess) {
      return convertMemberAccess(getFirstChild(cst, 'memberAccess'));
  }

    // Primary
  if (cst.children.primary) {
      return convertPrimary(getFirstChild(cst, 'primary'));
  }

  return null;
  }

// Convert destructuring patterns
function convertDestructuringPattern(cst) {
  if (cst.children.LeftBracket) {
    // Array pattern: [a, b, ...rest]
    const arrayList = getFirstChild(cst, 'arrayDestructuringList');
    return {
      type: 'arrayPattern',
      elements: arrayList ? convertArrayDestructuringList(arrayList) : [],
    };
  }

  if (cst.children.LeftBrace) {
    // Object pattern: {a, b, ...rest} or {a: x, b}
    const objectList = getFirstChild(cst, 'objectDestructuringList');
    return {
      type: 'objectPattern',
      properties: objectList ? convertObjectDestructuringList(objectList) : [],
    };
  }

  return null;
}

function convertArrayDestructuringList(cst) {
  const elements = [];

  // Chevrotain flattens the CST structure - identifiers and commas are direct children
  const identifiers = cst.children.Identifier || [];
  const commas = cst.children.Comma || [];
  const dotDotDots = cst.children.DotDotDot || [];
  const destructuringPatterns = getAllChildren(cst, 'destructuringPattern');

  // Track positions to determine order
  let identifierIndex = 0;
  let patternIndex = 0;
  let dotDotDotIndex = 0;

  // Process elements in order
  // First element (before any comma)
  if (dotDotDotIndex < dotDotDots.length && dotDotDots[dotDotDotIndex].startOffset < (identifiers[identifierIndex]?.startOffset || Infinity)) {
    // Rest element first
    if (identifierIndex < identifiers.length) {
      elements.push({
        type: 'restElement',
        argument: { type: 'identifier', name: identifiers[identifierIndex].image },
      });
      dotDotDotIndex++;
      identifierIndex++;
    }
  } else if (patternIndex < destructuringPatterns.length && destructuringPatterns[patternIndex].startOffset < (identifiers[identifierIndex]?.startOffset || Infinity)) {
    // Nested pattern first
    elements.push(convertDestructuringPattern(destructuringPatterns[patternIndex]));
    patternIndex++;
  } else if (identifierIndex < identifiers.length) {
    // Regular identifier first
    elements.push({ type: 'identifier', name: identifiers[identifierIndex].image });
    identifierIndex++;
  }

  // Process remaining elements (after commas)
  for (let i = 0; i < commas.length; i++) {
    // Check what comes after this comma
    if (dotDotDotIndex < dotDotDots.length &&
        dotDotDots[dotDotDotIndex].startOffset < (identifiers[identifierIndex]?.startOffset || Infinity) &&
        dotDotDots[dotDotDotIndex].startOffset < (destructuringPatterns[patternIndex]?.startOffset || Infinity)) {
      // Rest element
      if (identifierIndex < identifiers.length) {
        elements.push({
          type: 'restElement',
          argument: { type: 'identifier', name: identifiers[identifierIndex].image },
        });
        dotDotDotIndex++;
        identifierIndex++;
        break; // Rest must be last
      }
    } else if (patternIndex < destructuringPatterns.length &&
               destructuringPatterns[patternIndex].startOffset < (identifiers[identifierIndex]?.startOffset || Infinity)) {
      // Nested pattern
      elements.push(convertDestructuringPattern(destructuringPatterns[patternIndex]));
      patternIndex++;
    } else if (identifierIndex < identifiers.length) {
      // Regular identifier
      elements.push({ type: 'identifier', name: identifiers[identifierIndex].image });
      identifierIndex++;
    }
  }

  return elements;
}

function convertObjectDestructuringList(cst) {
  const properties = [];

  // Chevrotain flattens the CST - we need to reconstruct the structure
  // Object destructuring can have: Identifier, StringLiteral, Colon, Comma, DotDotDot, destructuringPattern, Equal, expression
  const identifiers = cst.children.Identifier || [];
  const stringLiterals = cst.children.StringLiteral || [];
  const colons = cst.children.Colon || [];
  const commas = cst.children.Comma || [];
  const dotDotDots = cst.children.DotDotDot || [];
  const equals = cst.children.Equal || [];
  const destructuringPatterns = getAllChildren(cst, 'destructuringPattern');
  // Expressions in OPTION subrules are stored as direct children
  const expressions = cst.children.expression || [];

  // Track positions
  let idIndex = 0;
  let strIndex = 0;
  let colonIndex = 0;
  let commaIndex = 0;
  let dotDotDotIndex = 0;
  let patternIndex = 0;
  let exprIndex = 0; // Track expression index for matching defaults

  // Process first property (before any comma)
  // Only process as rest if DotDotDot comes before any identifier
  if (dotDotDotIndex < dotDotDots.length &&
      (idIndex >= identifiers.length || dotDotDots[dotDotDotIndex].startOffset < identifiers[idIndex].startOffset) &&
      (strIndex >= stringLiterals.length || dotDotDots[dotDotDotIndex].startOffset < stringLiterals[strIndex].startOffset)) {
    // Rest property first: ...rest
    // Find the identifier that comes after this DotDotDot
    let restIdIndex = idIndex;
    for (let j = idIndex; j < identifiers.length; j++) {
      if (identifiers[j].startOffset > dotDotDots[dotDotDotIndex].startOffset) {
        restIdIndex = j;
        break;
      }
    }
    if (restIdIndex < identifiers.length) {
      properties.push({
        type: 'restProperty',
        argument: { type: 'identifier', name: identifiers[restIdIndex].image },
      });
      dotDotDotIndex++;
      idIndex = restIdIndex + 1;
      return properties; // Rest must be last
    }
  }

  // Regular property
  let key = null;
  let value = null;

  // Get key (identifier or string literal)
  if (idIndex < identifiers.length && (strIndex >= stringLiterals.length || identifiers[idIndex].startOffset < stringLiterals[strIndex].startOffset)) {
    key = { type: 'identifier', name: identifiers[idIndex].image };
    idIndex++;
  } else if (strIndex < stringLiterals.length) {
    key = { type: 'string', value: stringLiterals[strIndex].image.slice(1, -1) };
    strIndex++;
  }

  // Check if there's a colon (key: value pattern)
  if (colonIndex < colons.length && key) {
    colonIndex++;
    // Get value (identifier or nested pattern)
    // Check if there's a nested pattern after the colon
    if (patternIndex < destructuringPatterns.length) {
      // Get the actual start offset from the opening bracket/brace
      const pattern = destructuringPatterns[patternIndex];
      const leftBracket = pattern.children?.LeftBracket?.[0];
      const leftBrace = pattern.children?.LeftBrace?.[0];
      const patternStart = leftBracket?.startOffset || leftBrace?.startOffset || pattern.startOffset || 0;
      const colon = colons[colonIndex - 1];
      const colonEnd = colon.endOffset || colon.startOffset;

      // Check if this pattern comes after the colon and before any identifier
      if (patternStart > colonEnd &&
          (idIndex >= identifiers.length || patternStart < identifiers[idIndex].startOffset)) {
        value = convertDestructuringPattern(pattern);
        patternIndex++;
      } else if (idIndex < identifiers.length) {
        value = { type: 'identifier', name: identifiers[idIndex].image };
        idIndex++;
      }
    } else if (idIndex < identifiers.length) {
      value = { type: 'identifier', name: identifiers[idIndex].image };
      idIndex++;
    }

    // Check for default value after the value
    let defaultValue = null;
    const valueEnd = value ? (value.startOffset || (identifiers[idIndex - 1]?.endOffset || 0)) : (key.startOffset || 0);
    const defaultEqual = equals.find(eq => eq.startOffset > valueEnd && eq.startOffset < valueEnd + 20);
    if (defaultEqual && expressions.length > 0) {
      const defaultExpr = expressions.find(expr => {
        const exprStart = expr.startOffset ||
                         expr.children?.number?.[0]?.children?.NumberLiteral?.[0]?.startOffset ||
                         expr.children?.identifier?.[0]?.children?.Identifier?.[0]?.startOffset;
        return exprStart && exprStart > defaultEqual.startOffset && exprStart < defaultEqual.startOffset + 20;
      });
      if (defaultExpr) {
        defaultValue = convertExpression(defaultExpr);
      }
    }

    if (key && value) {
      properties.push({
        type: 'property',
        key,
        value,
        shorthand: false,
        default: defaultValue,
      });
    }
  } else if (key) {
    // Shorthand property - check for default value
    let defaultValue = null;
    const keyEnd = key.startOffset || (identifiers[idIndex - 1]?.endOffset || 0);
    const nextCommaStart = commas.length > 0 ? commas[0].startOffset : Infinity;
    const defaultEqual = equals.find(eq =>
      eq.startOffset > keyEnd && eq.startOffset < nextCommaStart
    );

    if (defaultEqual && exprIndex < expressions.length) {
      defaultValue = convertExpression(expressions[exprIndex]);
      exprIndex++;
    }

    properties.push({
      type: 'property',
      key,
      value: key, // Shorthand: same as key
      shorthand: true,
      default: defaultValue,
    });
  }

  // Process remaining properties (after commas)
  for (let i = 0; i < commas.length; i++) {
    const comma = commas[i];

    // Check if the next token after this comma is a DotDotDot (rest property)
    // Find the next DotDotDot that comes after this comma
    let nextDotDotDot = null;
    let nextDotDotDotIndex = -1;
    for (let j = dotDotDotIndex; j < dotDotDots.length; j++) {
      if (dotDotDots[j].startOffset > comma.startOffset) {
        nextDotDotDot = dotDotDots[j];
        nextDotDotDotIndex = j;
        break;
      }
    }

    // Check if next token after comma is the DotDotDot (before any identifier)
    const nextIdOffset = idIndex < identifiers.length ? identifiers[idIndex].startOffset : Infinity;
    const nextStrOffset = strIndex < stringLiterals.length ? stringLiterals[strIndex].startOffset : Infinity;
    const nextTokenOffset = Math.min(nextIdOffset, nextStrOffset);

    if (nextDotDotDot && nextDotDotDot.startOffset < nextTokenOffset) {
      // Rest property - find the identifier that comes after this DotDotDot
      let restIdIndex = idIndex;
      for (let j = idIndex; j < identifiers.length; j++) {
        if (identifiers[j].startOffset > nextDotDotDot.startOffset) {
          restIdIndex = j;
          break;
        }
      }
      if (restIdIndex < identifiers.length) {
        properties.push({
          type: 'restProperty',
          argument: { type: 'identifier', name: identifiers[restIdIndex].image },
        });
        dotDotDotIndex = nextDotDotDotIndex + 1;
        idIndex = restIdIndex + 1;
        break; // Rest must be last
      }
    }

    // Regular property
    key = null;
    value = null;

    // Get key
    if (idIndex < identifiers.length && (strIndex >= stringLiterals.length || identifiers[idIndex].startOffset < stringLiterals[strIndex].startOffset)) {
      key = { type: 'identifier', name: identifiers[idIndex].image };
      idIndex++;
    } else if (strIndex < stringLiterals.length) {
      key = { type: 'string', value: stringLiterals[strIndex].image.slice(1, -1) };
      strIndex++;
    }

    // Check for colon
    let defaultValue = null;
    if (colonIndex < colons.length && key) {
      colonIndex++;
      // Get value
      if (patternIndex < destructuringPatterns.length) {
        // Get the actual start offset from the opening bracket/brace
        const pattern = destructuringPatterns[patternIndex];
        const leftBracket = pattern.children?.LeftBracket?.[0];
        const leftBrace = pattern.children?.LeftBrace?.[0];
        const patternStart = leftBracket?.startOffset || leftBrace?.startOffset || pattern.startOffset || 0;
        const colon = colons[colonIndex - 1];
        const colonEnd = colon.endOffset || colon.startOffset;

        // Check if this pattern comes after the colon and before any identifier
        if (patternStart > colonEnd &&
            (idIndex >= identifiers.length || patternStart < identifiers[idIndex].startOffset)) {
          value = convertDestructuringPattern(pattern);
          patternIndex++;
        } else if (idIndex < identifiers.length) {
          value = { type: 'identifier', name: identifiers[idIndex].image };
          idIndex++;
        }
      } else if (idIndex < identifiers.length) {
        value = { type: 'identifier', name: identifiers[idIndex].image };
        idIndex++;
      }

      // Check for default value after the value
      // Find the equal that comes after this value (before the next comma or end)
      const valueEnd = value ? (value.startOffset || (identifiers[idIndex - 1]?.endOffset || 0)) : (key.startOffset || 0);
      const nextCommaStart = i < commas.length - 1 ? commas[i + 1].startOffset : Infinity;
      const defaultEqual = equals.find(eq =>
        eq.startOffset > valueEnd && eq.startOffset < nextCommaStart
      );

      if (defaultEqual && exprIndex < expressions.length) {
        defaultValue = convertExpression(expressions[exprIndex]);
        exprIndex++;
      }

      if (key && value) {
        properties.push({
          type: 'property',
          key,
          value,
          shorthand: false,
          default: defaultValue,
        });
      }
    } else if (key) {
      // Shorthand property - check for default value
      const keyEnd = key.startOffset || (identifiers[idIndex - 1]?.endOffset || 0);
      const nextCommaStart = i < commas.length - 1 ? commas[i + 1].startOffset : Infinity;
      const defaultEqual = equals.find(eq =>
        eq.startOffset > keyEnd && eq.startOffset < nextCommaStart
      );

      if (defaultEqual && exprIndex < expressions.length) {
        defaultValue = convertExpression(expressions[exprIndex]);
        exprIndex++;
      }

      properties.push({
        type: 'property',
        key,
        value: key,
        shorthand: true,
        default: defaultValue,
      });
    }
  }

  return properties;
}

function convertAssignment(cst) {
  // Check if this is a destructuring assignment
  const destructuringPattern = getFirstChild(cst, 'destructuringPattern');

  if (destructuringPattern) {
    // Destructuring assignment: [pattern] = or {pattern} = or [pattern] := or {pattern} :=
    const opToken = cst.children.Equal?.[0] ||
                      cst.children.ColonEqual?.[0] ||
                      cst.children.PlusColonEqual?.[0] ||
                      cst.children.MinusColonEqual?.[0] ||
                      cst.children.StarColonEqual?.[0] ||
                      cst.children.SlashColonEqual?.[0] ||
                      cst.children.PercentColonEqual?.[0] ||
                      cst.children.StarStarColonEqual?.[0] ||
                      cst.children.LeftShiftColonEqual?.[0] ||
                      cst.children.RightShiftColonEqual?.[0] ||
                      cst.children.UnsignedRightShiftColonEqual?.[0] ||
                      cst.children.AndColonEqual?.[0] ||
                      cst.children.CaretColonEqual?.[0] ||
                      cst.children.OrColonEqual?.[0] ||
                      cst.children.AndAndColonEqual?.[0] ||
                      cst.children.OrOrColonEqual?.[0] ||
                      cst.children.QuestionQuestionColonEqual?.[0];

    if (opToken) {
      const left = convertDestructuringPattern(destructuringPattern);
      const right = convertExpression(getFirstChild(cst, 'assignment'));
      
      // In Oddo, = is a declaration, := is an assignment
      if (opToken.image === '=') {
        return {
          type: 'variableDeclaration',
          operator: '=',
          left,
          right,
        };
      }
      
      return {
        type: 'assignment',
        operator: opToken.image,
        left,
        right,
      };
    }

    // If no operator, just return the pattern (shouldn't happen in valid syntax)
    return convertDestructuringPattern(destructuringPattern);
  }

  // Regular assignment: expr = expr or expr := expr
  const left = convertExpression(getFirstChild(cst, 'conditional'));
  const opToken = cst.children.Equal?.[0] ||
                    cst.children.ColonEqual?.[0] ||
                    cst.children.PlusColonEqual?.[0] ||
                    cst.children.MinusColonEqual?.[0] ||
                    cst.children.StarColonEqual?.[0] ||
                    cst.children.SlashColonEqual?.[0] ||
                    cst.children.PercentColonEqual?.[0] ||
                    cst.children.StarStarColonEqual?.[0] ||
                    cst.children.LeftShiftColonEqual?.[0] ||
                    cst.children.RightShiftColonEqual?.[0] ||
                    cst.children.UnsignedRightShiftColonEqual?.[0] ||
                    cst.children.AndColonEqual?.[0] ||
                    cst.children.CaretColonEqual?.[0] ||
                    cst.children.OrColonEqual?.[0] ||
                    cst.children.AndAndColonEqual?.[0] ||
                    cst.children.OrOrColonEqual?.[0] ||
                    cst.children.QuestionQuestionColonEqual?.[0];

  if (opToken) {
      const right = convertExpression(getFirstChild(cst, 'assignment'));

      // Check if this is a slice assignment: arr[start...end] := value
      if (left && left.type === 'arraySlice') {
        if (opToken.image === '=') {
          throw new Error('Array slice assignments must use := operator, not =');
        }
        // Only := is allowed for array slice assignments
        return {
          type: 'arraySliceAssignment',
          slice: left,
          value: right,
        };
      }

      // Check if left-hand side is member access (a.b.c)
      if (left && left.type === 'memberAccess') {
        if (opToken.image === '=') {
          throw new Error('Member access assignments must use := operator, not =');
        }
      }

      // In Oddo, = is a declaration (const), := is an assignment
      if (opToken.image === '=') {
        return {
          type: 'variableDeclaration',
          operator: '=',
          left,
          right,
        };
      }

      // := and compound assignments (+=:, etc.) are true assignments
      return {
        type: 'assignment',
        operator: opToken.image,
        left,
        right,
      };
  }

  return left;
  }

function convertConditional(cst) {
  const test = convertExpression(getFirstChild(cst, 'logicalOr'));
  const hasQuestion = cst.children.Question && cst.children.Question.length > 0;

  if (hasQuestion) {
      const consequent = convertExpression(getFirstChild(cst, 'expression'));
      const alternate = convertExpression(getFirstChild(cst, 'conditional'));
      return {
        type: 'conditional',
        test,
        consequent,
        alternate,
      };
  }

  return test;
  }

function convertLogicalOr(cst) {
  const left = convertExpression(getFirstChild(cst, 'pipe'));
  const operators = cst.children.OrOr || [];

  return operators.reduce((acc, _, index) => {
      const right = convertExpression(getAllChildren(cst, 'pipe')[index + 1]);
      return {
        type: 'logical',
        operator: '||',
        left: acc,
        right,
      };
  }, left);
  }

function convertPipe(cst) {
  const left = convertExpression(getFirstChild(cst, 'compose'));
  const operators = cst.children.Pipe || [];

  return operators.reduce((acc, _, index) => {
      const right = convertExpression(getAllChildren(cst, 'compose')[index + 1]);
      return {
        type: 'pipe',
        left: acc,
        right,
      };
  }, left);
  }

function convertCompose(cst) {
  const left = convertExpression(getFirstChild(cst, 'nullishCoalescing'));
  const composeOp = cst.children.Compose?.[0];

  if (composeOp) {
      const right = convertExpression(getFirstChild(cst, 'compose'));
      // Right-associative: c <| b <| a means c <| (b <| a)
      // So we want: left(right) where left is the outer function and right is the inner result
      return {
        type: 'compose',
        left: left,  // Outer function (c)
        right: right, // Inner result (b <| a)
      };
  }

  return left;
  }

function convertNullishCoalescing(cst) {
  const left = convertExpression(getFirstChild(cst, 'logicalAnd'));
  const operators = cst.children.QuestionQuestion || [];

  return operators.reduce((acc, _, index) => {
      const right = convertExpression(getAllChildren(cst, 'logicalAnd')[index + 1]);
      return {
        type: 'nullishCoalescing',
        operator: '??',
        left: acc,
        right,
      };
    }, left);
  }

function convertLogicalAnd(cst) {
  const left = convertExpression(getFirstChild(cst, 'equality'));
  const operators = cst.children.AndAnd || [];

  return operators.reduce((acc, _, index) => {
      const right = convertExpression(getAllChildren(cst, 'equality')[index + 1]);
      return {
        type: 'logical',
        operator: '&&',
        left: acc,
        right,
      };
    }, left);
  }

function convertEquality(cst) {
  const left = convertExpression(getFirstChild(cst, 'relational'));
  const operators = [
      ...(cst.children.EqualEqual || []),
      ...(cst.children.BangEqual || []),
    ];

  return operators.reduce((acc, op, index) => {
      const right = convertExpression(getAllChildren(cst, 'relational')[index + 1]);
      return {
        type: 'binary',
        operator: op.image,
        left: acc,
        right,
      };
    }, left);
  }

function convertRelational(cst) {
  const left = convertExpression(getFirstChild(cst, 'additive'));
  const operators = [
      ...(cst.children.LessThanEqual || []),
      ...(cst.children.GreaterThanEqual || []),
      ...(cst.children.LessThan || []),
      ...(cst.children.GreaterThan || []),
      ...(cst.children.Instanceof || []),
      ...(cst.children.In || []),
    ];

  return operators.reduce((acc, op, index) => {
      const right = convertExpression(getAllChildren(cst, 'additive')[index + 1]);
      return {
        type: 'binary',
        operator: op.image,
        left: acc,
        right,
      };
    }, left);
  }

function convertAdditive(cst) {
  const left = convertExpression(getFirstChild(cst, 'multiplicative'));
  const operators = [
      ...(cst.children.Plus || []),
      ...(cst.children.Minus || []),
    ];

  return operators.reduce((acc, op, index) => {
      const right = convertExpression(getAllChildren(cst, 'multiplicative')[index + 1]);
      return {
        type: 'binary',
        operator: op.image,
        left: acc,
        right,
      };
    }, left);
  }

function convertMultiplicative(cst) {
  const left = convertExpression(getFirstChild(cst, 'exponentiation'));
  const operators = [
      ...(cst.children.Star || []),
      ...(cst.children.Slash || []),
      ...(cst.children.Percent || []),
    ];

  return operators.reduce((acc, op, index) => {
      const right = convertExpression(getAllChildren(cst, 'exponentiation')[index + 1]);
      return {
        type: 'binary',
        operator: op.image,
        left: acc,
        right,
      };
    }, left);
  }

function convertExponentiation(cst) {
  const left = convertExpression(getFirstChild(cst, 'unary'));
  const hasStarStar = cst.children.StarStar && cst.children.StarStar.length > 0;

  if (hasStarStar) {
      const right = convertExpression(getFirstChild(cst, 'exponentiation'));
      return {
        type: 'binary',
        operator: '**',
        left,
        right,
      };
  }

  return left;
  }

function convertUnary(cst) {
    // Check for prefix operators
  const prefixOp = cst.children.PlusPlus?.[0] ||
                     cst.children.MinusMinus?.[0];

  if (prefixOp) {
      const operand = convertExpression(getFirstChild(cst, 'postfix'));
      return {
        type: 'prefix',
        operator: prefixOp.image,
        operand,
      };
  }

    // Check for unary operators
  const unaryOp = cst.children.Typeof?.[0] ||
                    cst.children.Void?.[0] ||
                    cst.children.Delete?.[0] ||
                    cst.children.Plus?.[0] ||
                    cst.children.Minus?.[0] ||
                    cst.children.Bang?.[0] ||
                    cst.children.Tilde?.[0];

  if (unaryOp) {
      const operand = convertExpression(getFirstChild(cst, 'unary'));
      return {
        type: 'unary',
        operator: unaryOp.image,
        operand,
      };
  }

    // Otherwise it's a postfix expression
  return convertExpression(getFirstChild(cst, 'postfix'));
  }

function convertPostfix(cst) {
  const operand = convertExpression(getFirstChild(cst, 'functionCall'));
  const op = cst.children.PlusPlus?.[0] || cst.children.MinusMinus?.[0];

  if (op) {
      return {
        type: 'postfix',
        operator: op.image,
        operand,
      };
  }

  return operand;
  }

function convertFunctionCall(cst) {
  let callee = convertExpression(getFirstChild(cst, 'memberAccess'));
  const leftParens = cst.children.LeftParen || [];
  const rightParens = cst.children.RightParen || [];
  const questionDots = cst.children.QuestionDot || [];
  const templateLiterals = cst.children.TemplateLiteral || [];

  // Handle tagged template literals: fn`template`
  if (templateLiterals.length > 0 && leftParens.length === 0) {
    // This is a tagged template literal
    const templateLiteral = convertTemplateLiteralFromToken(templateLiterals[0]);
    return {
      type: 'taggedTemplate',
      tag: callee,
      template: templateLiteral,
    };
  }

  // Collect all operations: calls, dots, brackets, optional access
  const dots = cst.children.Dot || [];
  const identifiers = cst.children.Identifier || [];
  const brackets = cst.children.LeftBracket || [];
  const rightBrackets = cst.children.RightBracket || [];
  const argLists = getAllChildren(cst, 'argumentList');
  const allExprs = getAllChildren(cst, 'expression');

  // Build unified operations list sorted by offset
  // For function calls, include the matching RightParen offset for argument matching
  const ops = [
    ...leftParens.map((t, i) => ({ 
      k: 'c', 
      off: t.startOffset, 
      token: t,
      rightParen: rightParens[i]
    })),
    ...dots.map((t, i) => ({ k: 'd', off: t.startOffset, i })),
    ...brackets.map((t, i) => ({ k: 'b', off: t.startOffset, i, end: rightBrackets[i]?.endOffset })),
    ...questionDots.filter(q => !leftParens.some(p => Math.abs(p.startOffset - q.endOffset) <= 1))
      .map((t, i) => ({ k: 'q', off: t.startOffset, i }))
  ].sort((a, b) => a.off - b.off);

  let identIdx = 0;

  for (const op of ops) {
    if (op.k === 'c') {
      // Function call
      const isOptional = questionDots.some(q => q.endOffset < op.token.startOffset && op.token.startOffset - q.endOffset <= 1);
      
      // Find the argumentList that falls between this LeftParen and its matching RightParen
      // argumentList nodes are only created when there are arguments, so we match by position
      const leftOff = op.token.startOffset;
      const rightOff = op.rightParen?.endOffset;
      const argsCST = argLists.find(al => {
        const alStart = getFirstTokenOffset(al);
        return alStart !== undefined && alStart > leftOff && (rightOff === undefined || alStart < rightOff);
      });
      
      const args = [];
      if (argsCST) {
        const exprs = getAllChildren(argsCST, 'expression');
        const spreads = argsCST.children.DotDotDot || [];
        for (const expr of exprs) {
          const start = getFirstTokenOffset(expr);
          const isSpread = start !== undefined && spreads.some(s => Math.abs(s.endOffset + 1 - start) <= 1);
          args.push(isSpread ? { type: 'spreadElement', argument: convertExpression(expr) } : convertExpression(expr));
        }
      }
      callee = { type: 'call', callee, arguments: args, optional: isOptional };
    } else if (op.k === 'd') {
      const id = identifiers[identIdx++];
      if (id) callee = { type: 'memberAccess', object: callee, property: id.image, computed: false, optional: false };
    } else if (op.k === 'q') {
      const nextBracket = brackets.find(b => b.startOffset > op.off && b.startOffset - op.off <= 2);
      if (nextBracket) {
        const bIdx = brackets.indexOf(nextBracket);
        const expr = allExprs.find(e => { const o = getFirstTokenOffset(e); return o > nextBracket.startOffset && o < rightBrackets[bIdx]?.endOffset; });
        if (expr) callee = { type: 'memberAccess', object: callee, property: convertExpression(expr), computed: true, optional: true };
        ops.splice(ops.findIndex(o => o.k === 'b' && o.i === bIdx), 1);
      } else {
        const id = identifiers[identIdx++];
        if (id) callee = { type: 'memberAccess', object: callee, property: id.image, computed: false, optional: true };
      }
    } else if (op.k === 'b') {
      const expr = allExprs.find(e => { const o = getFirstTokenOffset(e); return o > op.off && o < op.end; });
      if (expr) callee = { type: 'memberAccess', object: callee, property: convertExpression(expr), computed: true, optional: false };
    }
  }

  return callee;
}

function convertMemberAccess(cst) {
  let object = convertExpression(getFirstChild(cst, 'primary'));
  const dots = cst.children.Dot || [];
  const questionDots = cst.children.QuestionDot || [];
  const brackets = cst.children.LeftBracket || [];
  const rightBrackets = cst.children.RightBracket || [];
  const dotDotDots = cst.children.DotDotDot || [];

  // If no member access operators, just return the object
  if (dots.length === 0 && questionDots.length === 0 && brackets.length === 0) {
    return object;
  }

  // Build a list of all member access operations in order
  const allOps = [];

  // Add dots (regular property access)
  for (const dot of dots) {
    allOps.push({ type: 'dot', token: dot, optional: false });
  }

  // Add question dots (optional property access) - but only those followed by an identifier, not brackets
  for (const qDot of questionDots) {
    // Check if this questionDot is followed by a bracket (optional bracket access)
    const isFollowedByBracket = brackets.some(b => b.startOffset > qDot.endOffset && b.startOffset - qDot.endOffset <= 1);
    if (!isFollowedByBracket) {
      allOps.push({ type: 'dot', token: qDot, optional: true });
    }
  }

  // Add brackets (computed property access or array slices)
  for (let i = 0; i < brackets.length; i++) {
    const bracket = brackets[i];
    const rightBracket = rightBrackets[i];
    if (!rightBracket) continue;

    // Check if this bracket is preceded by a QuestionDot (optional chaining)
    const isOptional = questionDots.some(qDot => 
      qDot.endOffset < bracket.startOffset && bracket.startOffset - qDot.endOffset <= 1
    );

    // Check for DotDotDot tokens between this bracket pair (slice)
    const dotDotDotsInRange = dotDotDots.filter(ddd =>
      ddd.startOffset > bracket.startOffset && ddd.startOffset < rightBracket.startOffset
    );

    allOps.push({ 
      type: 'bracket', 
      token: bracket, 
      rightBracket,
      optional: isOptional,
      isSlice: dotDotDotsInRange.length > 0
    });
  }

  // Sort by offset to maintain original order
  allOps.sort((a, b) => a.token.startOffset - b.token.startOffset);

  // Identifiers and expressions are consumed in order
  const identifiers = cst.children.Identifier || [];
  const expressions = getAllChildren(cst, 'expression');
  let identifierIndex = 0;
  let expressionIndex = 0;

  // Process all operations in source order
  for (const op of allOps) {
    if (op.type === 'dot') {
      // Dot notation: obj.prop or obj?.prop
      const identifier = identifiers[identifierIndex];
      if (identifier) {
        identifierIndex++;
        object = {
          type: 'memberAccess',
          object,
          property: identifier.image,
          computed: false,
          optional: op.optional,
        };
      }
    } else if (op.type === 'bracket') {
      if (op.isSlice) {
        // Array slice patterns
        // Count expressions that fall within this bracket pair
        const exprsInBracket = expressions.filter((e, idx) => {
          if (idx < expressionIndex) return false;
          const exprStart = getFirstTokenOffset(e);
          return exprStart > op.token.startOffset && exprStart < op.rightBracket.startOffset;
        });

        if (exprsInBracket.length === 0) {
          // Pattern: [...] - copy entire array
          object = {
            type: 'arraySlice',
            object,
            start: null,
            end: null,
          };
        } else if (exprsInBracket.length >= 2) {
          // Pattern: [expression...expression] - slice with start and end
          const startExpr = expressions[expressionIndex];
          const endExpr = expressions[expressionIndex + 1];
          expressionIndex += 2;
          object = {
            type: 'arraySlice',
            object,
            start: convertExpression(startExpr),
            end: convertExpression(endExpr),
          };
        } else {
          // Pattern: [expression...] - slice from start
          const startExpr = expressions[expressionIndex];
          expressionIndex++;
          object = {
            type: 'arraySlice',
            object,
            start: convertExpression(startExpr),
            end: null,
          };
        }
      } else {
        // Regular bracket access: obj[expr] or obj?.[expr]
        if (expressions.length > expressionIndex) {
          const exprCst = expressions[expressionIndex];
          expressionIndex++;
          const property = convertExpression(exprCst);
          object = {
            type: 'memberAccess',
            object,
            property,
            computed: true,
            optional: op.optional,
          };
        }
      }
    }
  }

  return object;
}

function convertPrimary(cst) {
  if (cst.children.literal) {
      return convertLiteral(getFirstChild(cst, 'literal'));
  }
  if (cst.children.arrayLiteral) {
      return convertArrayLiteral(getFirstChild(cst, 'arrayLiteral'));
  }
  if (cst.children.objectLiteral) {
      return convertObjectLiteral(getFirstChild(cst, 'objectLiteral'));
  }
  if (cst.children.arrowFunction) {
      return convertArrowFunction(getFirstChild(cst, 'arrowFunction'));
  }
  if (cst.children.jsxElement) {
      return convertJSXElement(getFirstChild(cst, 'jsxElement'));
  }
  if (cst.children.jsxFragment) {
      return convertJSXFragment(getFirstChild(cst, 'jsxFragment'));
  }
  if (cst.children.parenthesizedExpression) {
      const parenCst = getFirstChild(cst, 'parenthesizedExpression');
      // Check if it's actually an arrow function (has =>)
      if (parenCst.children.Equal && parenCst.children.Equal.length > 0) {
        // This is an arrow function: () =>, (a) =>, (x, y) => expr or (x, y) =>\n  ... or (x, ...rest) => expr
        const paramList = getFirstChild(parenCst, 'parameterList');
        // If there's no parameterList, it's either () => or (a) => (single param)
        let parameters = [];
        if (paramList) {
          parameters = convertParameterList(paramList);
        } else {
          // Check if there's a single identifier (single param in parens: (a) =>)
          // This would be in the expression if it was parsed as a regular expression first
          // But since we're in the arrow function branch, we need to check differently
          // Actually, single param in parens should be handled by parameterList with one identifier
          // Empty param list () => should have no parameters
          parameters = [];
        }

        // Check if body is a block or expression
        const blockStatementCST = getFirstChild(parenCst, 'blockStatement');
        const expressionCST = getFirstChild(parenCst, 'expression');

        let body;
        if (blockStatementCST) {
          // Block body: (x, y) => { ... }
          body = {
            type: 'blockStatement',
            body: getAllChildren(blockStatementCST, 'statement').map(convertStatement),
          };
        } else if (expressionCST) {
          // Expression body: (x, y) => expr
          body = convertExpression(expressionCST);
        } else {
          body = null;
        }

        return {
          type: 'arrowFunction',
          parameters,
          body,
        };
      }
      // Regular parenthesized expression
      const exprCst = getFirstChild(parenCst, 'expression');
      return exprCst ? convertExpression(exprCst) : null;
  }
  if (cst.children.identifier) {
      const id = getFirstChild(cst, 'identifier');
      return {
        type: 'identifier',
        name: id.children.Identifier[0].image,
      };
  }
  return null;
  }

function convertLiteral(cst) {
  if (cst.children.NumberLiteral) {
      const image = cst.children.NumberLiteral[0].image;
      let value;
      let raw = null;
      // Handle hex, binary, and octal literals - preserve original format
      if (image.startsWith('0x') || image.startsWith('0X')) {
          value = parseInt(image, 16);
          raw = image; // Preserve hex format
      } else if (image.startsWith('0b') || image.startsWith('0B')) {
          value = parseInt(image.slice(2), 2);
          raw = image; // Preserve binary format
      } else if (image.startsWith('0o') || image.startsWith('0O')) {
          value = parseInt(image.slice(2), 8);
          raw = image; // Preserve octal format
      } else {
          value = parseFloat(image);
          // For decimal numbers, preserve if it has special formatting (scientific notation, etc.)
          if (image.includes('e') || image.includes('E') || image.includes('.')) {
              raw = image;
          }
      }
      return { type: 'number', value, raw };
  }
  if (cst.children.StringLiteral) {
      const image = cst.children.StringLiteral[0].image;
      const value = image.slice(1, -1); // Remove quotes
      return { type: 'string', value };
  }
  if (cst.children.templateLiteral) {
      return convertTemplateLiteral(getFirstChild(cst, 'templateLiteral'));
  }
  if (cst.children.True) {
      return { type: 'boolean', value: true };
  }
  if (cst.children.False) {
      return { type: 'boolean', value: false };
  }
  if (cst.children.Null) {
      return { type: 'null', value: null };
  }
  return null;
}

// Convert template literal CST node to AST
function convertTemplateLiteral(cst) {
  const token = cst.children.TemplateLiteral?.[0];
  if (!token) return null;
  return convertTemplateLiteralFromToken(token);
}

// Convert template literal token to AST
// Parses the template literal string to extract quasis and expressions
function convertTemplateLiteralFromToken(token) {
  const templateText = token.image;
  const quasis = [];
  const expressions = [];

  // Remove opening and closing backticks
  let text = templateText.slice(1, -1);
  let pos = 0;
  let currentQuasiRaw = ''; // Raw value (with escape sequences as-is)
  let currentQuasiCooked = ''; // Cooked value (with escape sequences processed)
  let escaped = false;
  let braceDepth = 0;

  while (pos < text.length) {
    const char = text[pos];

    if (escaped) {
      // Handle escape sequences - add to both raw and cooked
      currentQuasiRaw += '\\' + char; // Keep escape sequence in raw

      // Process escape for cooked value
      if (char === '`') {
        currentQuasiCooked += '`';
      } else if (char === '$') {
        currentQuasiCooked += '$';
      } else if (char === '{') {
        currentQuasiCooked += '{';
      } else if (char === '}') {
        currentQuasiCooked += '}';
      } else if (char === '\\') {
        currentQuasiCooked += '\\';
      } else {
        // Other escape sequences (like \n, \t, etc.)
        currentQuasiCooked += '\\' + char;
      }
      escaped = false;
      pos++;
      continue;
    }

    if (char === '\\') {
      // Don't add backslash yet - wait for next char to determine escape sequence
      escaped = true;
      pos++;
      continue;
    }

    // Check for ${ - start of expression
    if (char === '$' && pos + 1 < text.length && text[pos + 1] === '{') {
      // Save current quasi
      quasis.push({
        type: 'templateElement',
        value: { raw: currentQuasiRaw, cooked: currentQuasiCooked },
        tail: false,
      });
      currentQuasiRaw = '';
      currentQuasiCooked = '';

      // Find the matching }
      pos += 2; // Skip ${
      braceDepth = 1;
      let exprStart = pos;

      while (pos < text.length && braceDepth > 0) {
        if (text[pos] === '{') {
          braceDepth++;
        } else if (text[pos] === '}') {
          braceDepth--;
          if (braceDepth === 0) {
            // Found matching }
            const exprText = text.substring(exprStart, pos);
            // Parse the expression using parseOddoExpression
            try {
              const exprAST = parseOddoExpression(exprText);
              expressions.push(exprAST);
            } catch (e) {
              // If parsing fails, create an error node
              expressions.push({
                type: 'error',
                message: `Failed to parse expression: ${exprText}`,
              });
            }
            pos++; // Skip }
            break;
          }
        }
        pos++;
      }
      continue;
    }

    // Regular character - add to both raw and cooked
    currentQuasiRaw += char;
    currentQuasiCooked += char;
    pos++;
  }

  // Add final quasi
  quasis.push({
    type: 'templateElement',
    value: { raw: currentQuasiRaw, cooked: currentQuasiCooked },
    tail: true,
  });

  return {
    type: 'templateLiteral',
    quasis,
    expressions,
  };
}

function convertArrayLiteral(cst) {
  const elements = [];
  const elementList = getFirstChild(cst, 'arrayElementList');
  if (elementList) {
    const expressions = getAllChildren(elementList, 'expression');
    const dotDotDots = elementList.children.DotDotDot || [];

    // Check each expression - if there's a DotDotDot token right before it (offset-wise), it's a spread
    for (let i = 0; i < expressions.length; i++) {
      const exprCst = expressions[i];
      const exprStart = getFirstTokenOffset(exprCst);

      // Check if there's a DotDotDot token that ends right before this expression starts
      const isSpread = exprStart !== undefined && dotDotDots.some(dot => {
        const dotEnd = dot.endOffset;
        // DotDotDot ends at dotEnd, expression starts at exprStart
        // They should be adjacent (with at most 1 whitespace char between)
        return Math.abs(dotEnd + 1 - exprStart) <= 1;
      });

      if (isSpread) {
        elements.push({
          type: 'spread',
          expression: convertExpression(exprCst),
        });
      } else {
        elements.push(convertExpression(exprCst));
      }
    }
  }
  return {
    type: 'array',
    elements,
  };
}

function convertObjectLiteral(cst) {
  const properties = [];
  const propertyList = getFirstChild(cst, 'objectPropertyList');
  if (propertyList) {
      properties.push(...getAllChildren(propertyList, 'objectProperty').map(convertObjectProperty));
  }
  return {
      type: 'object',
      properties,
    };
  }

function convertObjectProperty(cst) {
  // Check for spread property first: ...expr
  if (cst.children.DotDotDot && cst.children.DotDotDot.length > 0) {
    const expression = convertExpression(getFirstChild(cst, 'expression'));
    return {
      type: 'spreadProperty',
      argument: expression,
    };
  }

  // Check for computed key: [expr]: value
  if (cst.children.LeftBracket && cst.children.LeftBracket.length > 0) {
    // For computed keys, we have two expressions: key and value
    // They're stored as SUBRULE1(expression) and SUBRULE2(expression)
    const expressions = getAllChildren(cst, 'expression');
    const keyExpression = expressions[0] ? convertExpression(expressions[0]) : null;
    const valueExpression = expressions[1] ? convertExpression(expressions[1]) : null;

    if (!keyExpression || !valueExpression) {
      throw new Error('Computed key property must have both key and value expressions');
    }

    return {
      type: 'property',
      key: keyExpression,
      value: valueExpression,
      shorthand: false,
      computed: true,
    };
  }

  const identifier = cst.children.Identifier?.[0];
  const stringLiteral = cst.children.StringLiteral?.[0];
  const hasColon = cst.children.Colon && cst.children.Colon.length > 0;

  if (hasColon) {
      // Key-value pair
      const key = identifier ? { type: 'identifier', name: identifier.image } :
                 stringLiteral ? { type: 'string', value: stringLiteral.image.slice(1, -1) } :
                 null;
      const value = convertExpression(getFirstChild(cst, 'expression'));
      return {
        type: 'property',
        key,
        value,
        shorthand: false,
        computed: false,
      };
    } else {
      // Shorthand
      if (!identifier) {
        // This shouldn't happen in valid syntax, but handle gracefully
        return null;
      }
      const name = identifier.image;
      return {
        type: 'property',
        key: { type: 'identifier', name },
        value: { type: 'identifier', name },
        shorthand: true,
        computed: false,
      };
    }
  }

function convertArrowFunction(cst) {
  let parameters = [];

  // Check if it's a single parameter (Identifier directly in arrowFunction)
  if (cst.children.Identifier && cst.children.Identifier.length === 1 && !cst.children.LeftParen) {
      // Single parameter without parens: x =>
      parameters = [{
        type: 'parameter',
        name: cst.children.Identifier[0].image,
      }];
    } else if (cst.children.arrowFunctionParams) {
      // Has arrowFunctionParams subrule
      const paramsCST = getFirstChild(cst, 'arrowFunctionParams');
      if (paramsCST && paramsCST.children.Identifier && paramsCST.children.Identifier.length === 1 && !paramsCST.children.LeftParen) {
        // Single parameter without parens
        parameters = [{
          type: 'parameter',
          name: paramsCST.children.Identifier[0].image,
        }];
      } else if (paramsCST) {
        // Multiple parameters with parens
        const paramList = getFirstChild(paramsCST, 'parameterList');
        if (paramList) {
          parameters = convertParameterList(paramList);
        }
      }
      } else if (cst.children.LeftParen) {
      // Multi-parameter with parens: (x, y) => or (x, ...rest) =>
      const paramList = getFirstChild(cst, 'parameterList');
      if (paramList) {
        parameters = convertParameterList(paramList);
      }
    }

  // Check if body is a block or expression
  const blockStatementCST = getFirstChild(cst, 'blockStatement');
  const expressionCST = getFirstChild(cst, 'expression');

  let body;
  if (blockStatementCST) {
    // Block body: x => { ... }
    body = {
      type: 'blockStatement',
      body: getAllChildren(blockStatementCST, 'statement').map(convertStatement),
    };
  } else if (expressionCST) {
    // Expression body: x => expr
    body = convertExpression(expressionCST);
  } else {
    body = null;
  }

  return {
      type: 'arrowFunction',
      parameters,
      body,
    };
  }

function convertParameterList(cst) {
  if (!cst) return [];
  const parameters = [];

  // Get all possible parameter types
  const identifiers = cst.children.Identifier || [];
  const dotDotDots = cst.children.DotDotDot || [];
  const equals = cst.children.Equal || [];
  const destructuringPatterns = getAllChildren(cst, 'destructuringPattern');
  const commas = cst.children.Comma || [];
  // Expressions in OPTION subrules are stored as direct children
  // When using OPTION(() => { SUBRULE(expression) }), Chevrotain stores them as cst.children.expression
  const expressions = cst.children.expression || [];

  // Helper to get expression start offset from various nested structures
  const getExprStart = (expr) => {
    if (!expr) return null;
    if (expr.startOffset) return expr.startOffset;

    // Try to find from nested children - check number literals first (most common for defaults)
    const numberLit = expr.children?.number?.[0]?.children?.NumberLiteral?.[0];
    if (numberLit?.startOffset) return numberLit.startOffset;

    // Try identifier
    const identifier = expr.children?.identifier?.[0]?.children?.Identifier?.[0];
    if (identifier?.startOffset) return identifier.startOffset;

    // Try literal (which contains number/string/etc)
    const literal = expr.children?.literal?.[0];
    if (literal) {
      const litNumber = literal.children?.NumberLiteral?.[0];
      if (litNumber?.startOffset) return litNumber.startOffset;
    }

    // Try deeper nesting through assignment/conditional/etc
    const assignment = expr.children?.assignment?.[0];
    if (assignment) {
      const nestedId = assignment.children?.conditional?.[0]?.children?.logicalOr?.[0]?.children?.pipe?.[0]?.children?.compose?.[0]?.children?.nullishCoalescing?.[0]?.children?.logicalAnd?.[0]?.children?.equality?.[0]?.children?.relational?.[0]?.children?.additive?.[0]?.children?.multiplicative?.[0]?.children?.exponentiation?.[0]?.children?.unary?.[0]?.children?.postfix?.[0]?.children?.functionCall?.[0]?.children?.memberAccess?.[0]?.children?.primary?.[0]?.children?.identifier?.[0]?.children?.Identifier?.[0];
      if (nestedId?.startOffset) return nestedId.startOffset;
    }

    return null;
  };

  // Process parameters in order by their position in the source
  // Collect all parameter candidates and sort by start offset
  const paramCandidates = [];

  // Add rest parameters
  for (const dotDotDot of dotDotDots) {
    const restId = identifiers.find(id => id.startOffset > dotDotDot.startOffset);
    if (restId) {
      paramCandidates.push({
        type: 'rest',
        start: dotDotDot.startOffset,
        id: restId,
      });
    }
  }

  // Add destructuring patterns
  for (const pattern of destructuringPatterns) {
    // Get the actual start offset from the opening bracket/brace
    const leftBracket = pattern.children?.LeftBracket?.[0];
    const leftBrace = pattern.children?.LeftBrace?.[0];
    const patternStart = leftBracket?.startOffset || leftBrace?.startOffset || pattern.startOffset || 0;
    paramCandidates.push({
      type: 'destructuring',
      start: patternStart,
      pattern,
    });
  }

  // Add identifier parameters (but exclude those that are part of rest params or destructuring)
  for (const id of identifiers) {
    // Check if this identifier is part of a rest parameter
    const isRestId = dotDotDots.some(dot => {
      const dotEnd = dot.endOffset || (dot.startOffset + 3);
      return id.startOffset > dot.startOffset && id.startOffset < dotEnd + 5;
    });

    // Check if this identifier is inside a destructuring pattern
    const isInPattern = destructuringPatterns.some(pattern => {
      const patternStart = pattern.startOffset;
      // Try to get actual end offset from the pattern's children
      let patternEnd = pattern.endOffset;
      if (!patternEnd) {
        // Try to find the closing bracket/brace
        const rightBracket = pattern.children?.RightBracket?.[0];
        const rightBrace = pattern.children?.RightBrace?.[0];
        patternEnd = rightBracket?.endOffset || rightBrace?.endOffset || (patternStart + 1000);
      }
      return id.startOffset >= patternStart && id.startOffset <= patternEnd;
    });

    if (!isRestId && !isInPattern) {
      paramCandidates.push({
        type: 'identifier',
        start: id.startOffset,
        id,
      });
    }
  }

  // Sort by start offset to process in order
  paramCandidates.sort((a, b) => a.start - b.start);

  // Process each parameter in order
  let exprIndex = 0;
  for (let i = 0; i < paramCandidates.length; i++) {
    const candidate = paramCandidates[i];
    const nextComma = commas.find(c => c.startOffset > candidate.start);
    const nextCommaStart = nextComma ? nextComma.startOffset : Infinity;
    const nextCandidate = i < paramCandidates.length - 1 ? paramCandidates[i + 1] : null;
    const nextCandidateStart = nextCandidate ? nextCandidate.start : Infinity;
    const boundary = Math.min(nextCommaStart, nextCandidateStart);

    if (candidate.type === 'rest') {
      parameters.push({
        type: 'restElement',
        argument: {
          type: 'identifier',
          name: candidate.id.image,
        },
      });
      // Rest must be last
      break;
    } else if (candidate.type === 'destructuring') {
      const patternAST = convertDestructuringPattern(candidate.pattern);

      // Check for default value
      const patternEnd = candidate.pattern.endOffset || (candidate.pattern.startOffset + 100);
      const patternEqual = equals.find(eq =>
        eq.startOffset > patternEnd && eq.startOffset < boundary
      );

      let defaultValue = null;
      if (patternEqual && exprIndex < expressions.length) {
        defaultValue = convertExpression(expressions[exprIndex]);
        exprIndex++;
      }

      parameters.push({
        type: 'destructuringPattern',
        pattern: patternAST,
        default: defaultValue,
      });
    } else if (candidate.type === 'identifier') {
      // Regular identifier parameter
      const id = candidate.id;
      const idEnd = id.endOffset || (id.startOffset + id.image.length);
      const paramEqual = equals.find(eq =>
        eq.startOffset > idEnd && eq.startOffset < boundary
      );

      let defaultValue = null;
      if (paramEqual && exprIndex < expressions.length) {
        defaultValue = convertExpression(expressions[exprIndex]);
        exprIndex++;
      }

      parameters.push({
        type: 'parameter',
        name: id.image,
        default: defaultValue,
      });
    }
  }

  return parameters;
}

function convertJSXElement(cst) {
  const nameCST = getFirstChild(cst, 'jsxElementName');
  const identifiers = nameCST.children.Identifier || [];
  const dots = nameCST.children.Dot || [];
  const minuses = nameCST.children.Minus || [];

  // Build the name by joining identifiers with dots or hyphens
  // Sort tokens by position to determine the correct separator
  const tokens = [];
  identifiers.forEach(id => tokens.push({ type: 'id', token: id }));
  dots.forEach(dot => tokens.push({ type: 'dot', token: dot }));
  minuses.forEach(minus => tokens.push({ type: 'minus', token: minus }));

  tokens.sort((a, b) => a.token.startOffset - b.token.startOffset);

  let name = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'id') {
      if (name) {
        // Check what separator comes before this identifier
        const prevToken = tokens[i - 1];
        if (prevToken && prevToken.type === 'dot') {
          name += '.';
        } else if (prevToken && prevToken.type === 'minus') {
          name += '-';
        }
      }
      name += token.token.image;
    }
  }

  const attributes = getAllChildren(cst, 'jsxAttribute').map(convertJSXAttribute);

  const isSelfClosing = cst.children.JSXSelfClosing && cst.children.JSXSelfClosing.length > 0;

  let children = [];
  if (!isSelfClosing) {
      children = convertJSXChildren(getAllChildren(cst, 'jsxChild'));
  }

  return {
      type: 'jsxElement',
      name,
      attributes,
      children,
      selfClosing: isSelfClosing || false, // Explicitly set to false for non-self-closing elements
    };
  }

/**
 * Convert Oddo JSX fragment to AST
 */
function convertJSXFragment(cst) {
  // JSX Fragment: <> ... </>
  // No element name, no attributes, just children
  const childrenCST = getAllChildren(cst, 'jsxChild');
  const children = convertJSXChildren(childrenCST);

  return {
    type: 'jsxFragment',
    children,
  };
}

function convertJSXAttribute(cst) {
  if (cst.children.LeftBrace) {
      // Spread attribute
      const expression = convertExpression(getFirstChild(cst, 'expression'));
      return {
        type: 'jsxSpread',
        expression,
      };
    } else {
      // Regular attribute
      // Attribute names can contain hyphens: data-value, aria-label, etc.
      const identifiers = cst.children.Identifier || [];
      const minuses = cst.children.Minus || [];

      // Build the attribute name by joining identifiers with hyphens
      let name = identifiers[0]?.image || '';
      for (let i = 0; i < minuses.length && i + 1 < identifiers.length; i++) {
        name += '-' + identifiers[i + 1].image;
      }

      const valueCST = getFirstChild(cst, 'jsxAttributeValue');

      let value = { type: 'boolean', value: true }; // Default
      if (valueCST) {
        if (valueCST.children.StringLiteral) {
          const image = valueCST.children.StringLiteral[0].image;
          value = { type: 'string', value: image.slice(1, -1) };
        } else if (valueCST.children.LeftBrace) {
          const expr = convertExpression(getFirstChild(valueCST, 'expression'));
          value = { type: 'expression', value: expr };
        }
      }

      return {
        type: 'jsxAttribute',
        name,
        value,
      };
  }
  }

/**
 * Decode HTML entities in JSX text
 * Supports named entities (&nbsp;, &lt;, etc.) and numeric entities (&#160;, &#xA0;)
 */
function decodeHTMLEntities(text) {
  // Common named HTML entities
  const entities = {
    'nbsp': '\u00A0',   // non-breaking space
    'lt': '<',
    'gt': '>',
    'amp': '&',
    'quot': '"',
    'apos': "'",
    'cent': '\u00A2',    // ¢
    'pound': '\u00A3',   // £
    'yen': '\u00A5',     // ¥
    'euro': '\u20AC',    // €
    'copy': '\u00A9',    // ©
    'reg': '\u00AE',     // ®
    'trade': '\u2122',   // ™
    'mdash': '\u2014',   // —
    'ndash': '\u2013',   // –
    'hellip': '\u2026',  // …
    'laquo': '\u00AB',   // «
    'raquo': '\u00BB',   // »
    'ldquo': '\u201C',   // "
    'rdquo': '\u201D',   // "
    'lsquo': '\u2018',   // '
    'rsquo': '\u2019',   // '
    'bull': '\u2022',    // •
    'deg': '\u00B0',     // °
    'plusmn': '\u00B1',  // ±
    'times': '\u00D7',   // ×
    'divide': '\u00F7',  // ÷
    'ne': '\u2260',      // ≠
    'le': '\u2264',      // ≤
    'ge': '\u2265',      // ≥
    'infin': '\u221E',   // ∞
    'sum': '\u2211',     // ∑
    'prod': '\u220F',    // ∏
    'larr': '\u2190',    // ←
    'uarr': '\u2191',    // ↑
    'rarr': '\u2192',    // →
    'darr': '\u2193',    // ↓
    'harr': '\u2194',    // ↔
  };

  return text.replace(/&([a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/g, (match, entity) => {
    // Numeric entity (decimal): &#160;
    if (entity.startsWith('#x')) {
      // Hexadecimal: &#xA0;
      const code = parseInt(entity.substring(2), 16);
      return String.fromCharCode(code);
    } else if (entity.startsWith('#')) {
      // Decimal: &#160;
      const code = parseInt(entity.substring(1), 10);
      return String.fromCharCode(code);
    } else {
      // Named entity: &nbsp;
      return entities[entity] || match; // Return original if not found
    }
  });
}

/**
 * Convert JSX children, preserving whitespace between them.
 * Handles whitespace in two steps:
 * 1. Gap detection: inserts jsxText(" ") for same-line whitespace gaps between ANY children
 * 2. Merge pass: merges adjacent jsxText nodes so "Hello" + " " becomes "Hello "
 */
function convertJSXChildren(childrenCST) {
  if (!childrenCST || childrenCST.length === 0) return [];

  const childrenWithOffsets = childrenCST.map(child => {
    const firstOffset = getFirstTokenOffset(child);
    const lastOffset = getLastTokenOffset(child);
    return { cst: child, firstOffset, lastOffset };
  }).filter(c => c.firstOffset !== undefined);

  childrenWithOffsets.sort((a, b) => a.firstOffset - b.firstOffset);

  const result = [];

  for (let i = 0; i < childrenWithOffsets.length; i++) {
    const current = childrenWithOffsets[i];

    // Insert whitespace for same-line gaps between ANY consecutive children
    if (i > 0 && sourceText) {
      const prev = childrenWithOffsets[i - 1];
      const gapStart = prev.lastOffset + 1;
      const gapEnd = current.firstOffset;
      if (gapEnd > gapStart) {
        const gap = sourceText.slice(gapStart, gapEnd);
        if (gap.length > 0 && gap.trim() === '' && !gap.includes('\n')) {
          result.push({ type: 'jsxText', value: ' ' });
        }
      }
    }

    const converted = convertJSXChild(current.cst);
    if (converted !== null) {
      result.push(converted);
    }
  }

  // Merge adjacent jsxText nodes: ["Hello", " "] -> ["Hello "]
  const merged = [];
  for (const child of result) {
    const prev = merged[merged.length - 1];
    if (child.type === 'jsxText' && prev?.type === 'jsxText') {
      prev.value += child.value;
    } else {
      merged.push(child);
    }
  }
  return merged;
}

/**
 * Get the last token's end offset from a CST node
 */
function getLastTokenOffset(node) {
  if (!node) return undefined;
  
  // If this node has endOffset, return it
  if (node.endOffset !== undefined) {
    return node.endOffset;
  }
  
  // If it's a token with image, calculate end offset
  if (node.image !== undefined && node.startOffset !== undefined) {
    return node.startOffset + node.image.length - 1;
  }
  
  // Search through children for the last token
  let lastOffset;
  if (node.children) {
    for (const key in node.children) {
      const children = node.children[key];
      if (Array.isArray(children)) {
        for (const child of children) {
          const childOffset = getLastTokenOffset(child);
          if (childOffset !== undefined) {
            if (lastOffset === undefined || childOffset > lastOffset) {
              lastOffset = childOffset;
            }
          }
        }
      }
    }
  }
  
  return lastOffset;
}

function convertJSXChild(cst) {
  if (cst.children.jsxElement) {
    return convertJSXElement(getFirstChild(cst, 'jsxElement'));
  }
  if (cst.children.jsxFragment) {
    return convertJSXFragment(getFirstChild(cst, 'jsxFragment'));
  }
  if (cst.children.LeftBrace) {
    // Check if this is an empty expression {} (JSX comment)
    const expressionCST = getFirstChild(cst, 'expression');
    if (!expressionCST) {
      // Empty expression {} - represents JSX comment, return null to skip it
      return null;
    }
    const expression = convertExpression(expressionCST);
    return {
      type: 'jsxExpression',
      expression,
    };
  }
  
  // JSX text: collect tokens first to get offset info
  const allTokens = [];

  // Iterate through all children of the CST node
  // Collect any token that's not a subrule (jsxElement) or LeftBrace
  for (const key in cst.children) {
    // Skip subrules and LeftBrace (already handled)
    if (key === 'jsxElement' || key === 'LeftBrace') {
      continue;
    }
    // Collect all tokens of this type
    if (cst.children[key] && Array.isArray(cst.children[key])) {
      cst.children[key].forEach(token => {
        if (token && token.image !== undefined) {
          allTokens.push({ token, offset: token.startOffset });
        }
      });
    }
  }

  if (allTokens.length > 0) {
    allTokens.sort((a, b) => a.offset - b.offset);
    
    const firstToken = allTokens[0];
    const lastToken = allTokens[allTokens.length - 1];
    const lastTokenEnd = lastToken.token.endOffset !== undefined
      ? lastToken.token.endOffset
      : lastToken.token.startOffset + lastToken.token.image.length - 1;
    
    // Use sourceText to extract the text's own token range (preserves internal whitespace)
    // Inter-child whitespace is handled by convertJSXChildren gap detection + merge
    if (sourceText) {
      const textValue = sourceText.slice(firstToken.offset, lastTokenEnd + 1);
      if (textValue) {
        return { type: 'jsxText', value: decodeHTMLEntities(textValue) };
      }
      return null;
    }

    // Fallback: concatenate token images (when sourceText not available)
    let textValue = '';
    for (let i = 0; i < allTokens.length; i++) {
      const current = allTokens[i];

      if (i > 0) {
        const previous = allTokens[i - 1];
        const previousEnd = previous.token.endOffset !== undefined
          ? previous.token.endOffset
          : previous.token.startOffset + previous.token.image.length - 1;

        if (current.token.startOffset > previousEnd + 1) {
          textValue += ' ';
        }
      }

      textValue += current.token.image;
    }

    const decodedValue = decodeHTMLEntities(textValue);
    return {
      type: 'jsxText',
      value: decodedValue,
    };
  }
  return null;
}

function convertCSTToAST(cst, source = '') {
  if (!cst) return null;

  // Store source text for JSX text extraction (preserves whitespace)
  sourceText = source;

  // Entry point - convert program CST to AST
  if (cst.name === 'program') {
  const statements = getAllChildren(cst, 'statement').map(convertStatement);
  return {
      type: 'program',
      body: statements,
    };
  }
  return null;
}

export { convertCSTToAST };
