/**
 * Oddo Language Compiler
 * Compiles Oddo AST to JavaScript using Babel
 */

import _generate from '@babel/generator';
import * as t from '@babel/types';

const generate = _generate.default || _generate;

// Helper function to extract identifiers from a Babel AST expression
function extractIdentifiers(babelNode) {
  const identifiers = new Set();

  function traverse(node) {
    if (!node) return;

    // Babel AST types
    if (t.isIdentifier(node)) {
      identifiers.add(node.name);
    } else if (t.isMemberExpression(node)) {
      traverse(node.object);
      // Don't add property names, only object identifiers
    } else if (t.isCallExpression(node)) {
      traverse(node.callee);
      if (node.arguments) {
        node.arguments.forEach(arg => traverse(arg));
      }
    } else if (t.isBinaryExpression(node) || t.isLogicalExpression(node)) {
      traverse(node.left);
      traverse(node.right);
    } else if (t.isUnaryExpression(node)) {
      traverse(node.argument);
    } else if (t.isConditionalExpression(node)) {
      traverse(node.test);
      traverse(node.consequent);
      traverse(node.alternate);
    } else if (t.isArrayExpression(node)) {
      if (node.elements) {
        node.elements.forEach(el => traverse(el));
      }
    } else if (t.isObjectExpression(node)) {
      if (node.properties) {
        node.properties.forEach(prop => {
          if (t.isObjectProperty(prop)) {
            traverse(prop.key);
            traverse(prop.value);
          }
        });
      }
    } else if (t.isArrowFunctionExpression(node)) {
      // Don't traverse into arrow function parameters or body
      // Arrow functions create their own scope
    } else if (t.isSequenceExpression(node)) {
      node.expressions.forEach(expr => traverse(expr));
    } else if (t.isUpdateExpression(node)) {
      traverse(node.argument);
    } else if (t.isAssignmentExpression(node)) {
      traverse(node.left);
      traverse(node.right);
    }
  }

  traverse(babelNode);
  return Array.from(identifiers);
}

// Modifier transformations map
// Maps modifier names to transformation functions
const MODIFIER_TRANSFORMATIONS = {
  state: {
    // @state x = 3 -> con~st x = $Oddo.state(3);
    needsOddoImport: true,
    transform: (valueExpr, leftExpr) => {
      const stateCall = t.callExpression(
        t.memberExpression(
          t.identifier('$Oddo'),
          t.identifier('state'),
          false
        ),
        [valueExpr]
      );

      // If there's a left side (variable name), create a const declaration
      if (leftExpr) {
        return t.variableDeclaration('const', [
          t.variableDeclarator(leftExpr, stateCall)
        ]);
      }
      return t.expressionStatement(stateCall);
    },
  },
  computed: {
    // @computed sum = x + y -> const sum = $Oddo.computed((x, y) => x + y, [x, y])
    needsOddoImport: true,
    transform: (valueExpr, leftExpr) => {
      const identifiers = extractIdentifiers(valueExpr);
      const params = identifiers.map(id => t.identifier(id));
      const deps = identifiers.map(id => t.identifier(id));

      const arrowFunc = t.arrowFunctionExpression(
        params,
        valueExpr
      );

      const computedCall = t.callExpression(
        t.memberExpression(
          t.identifier('$Oddo'),
          t.identifier('computed'),
          false
        ),
        [arrowFunc, t.arrayExpression(deps)]
      );

      if (leftExpr) {
        return t.variableDeclaration('const', [
          t.variableDeclarator(leftExpr, computedCall)
        ]);
      }
      return t.expressionStatement(computedCall);
    },
  },
  react: {
    // @react sum = x + y -> const sum = $Oddo.react((x, y) => x + y, [x, y])
    needsOddoImport: true,
    transform: (valueExpr, leftExpr) => {
      const identifiers = extractIdentifiers(valueExpr);
      const params = identifiers.map(id => t.identifier(id));
      const deps = identifiers.map(id => t.identifier(id));

      const arrowFunc = t.arrowFunctionExpression(
        params,
        valueExpr
      );

      const reactCall = t.callExpression(
        t.memberExpression(
          t.identifier('$Oddo'),
          t.identifier('react'),
          false
        ),
        [arrowFunc, t.arrayExpression(deps)]
      );

      if (leftExpr) {
        return t.variableDeclaration('const', [
          t.variableDeclarator(leftExpr, reactCall)
        ]);
      }
      return t.expressionStatement(reactCall);
    },
  },
  mutate: {
    // @mutate addPerson = (x) => ... -> const addPerson = $Oddo.mutate((x) => { ... })
    needsOddoImport: true,
    transform: (valueExpr, leftExpr) => {
      // mutate must be an arrow function
      if (valueExpr.type !== 'ArrowFunctionExpression') {
        throw new Error('mutate modifier must be a function');
      }

      const mutateCall = t.callExpression(
        t.memberExpression(
          t.identifier('$Oddo'),
          t.identifier('mutate'),
          false
        ),
        [valueExpr]
      );

      if (leftExpr) {
        return t.variableDeclaration('const', [
          t.variableDeclarator(leftExpr, mutateCall)
        ]);
      }
      return t.expressionStatement(mutateCall);
    },
  },
};

// Track if $Oddo import is needed
let needsOddoImport = false;

/**
 * Convert Oddo AST to Babel AST and generate JavaScript code
 * @param {Object} ast - Oddo AST (program node)
 * @param {Object} config - Compilation configuration options
 * @param {string} config.runtimeLibrary - Runtime library to import (defaults to '@oddo/ui')
 * @returns {string} Generated JavaScript code
 */
export function compileToJS(ast, config = {}) {
  if (!ast || ast.type !== 'program') {
    throw new Error('Expected a program AST node');
  }

  // Extract configuration with defaults
  const runtimeLibrary = config.runtimeLibrary || '@oddo/ui';

  // Reset the $Oddo import flag
  needsOddoImport = false;

  const babelAST = convertProgram(ast);

  // Add $Oddo import if needed
  if (needsOddoImport) {
    const importDeclaration = t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier('$Oddo'))],
      t.stringLiteral(runtimeLibrary)
    );
    babelAST.body.unshift(importDeclaration);
  }

  const output = generate(babelAST, {
    compact: false,
    comments: false,
  });

  return output.code;
}

/**
 * Convert Oddo program to Babel program
 */
function convertProgram(ast) {
  const body = [];

  // Flatten block statements that come from modifier blocks
  for (const stmt of ast.body) {
    const converted = convertStatement(stmt);
    if (converted.type === 'BlockStatement' && converted.body.length > 0) {
      // If this is a block statement from a modifier block, flatten it
      body.push(...converted.body);
    } else {
      body.push(converted);
    }
  }

  return t.program(body);
}

/**
 * Convert Oddo statement to Babel statement
 */
function convertStatement(stmt) {
  switch (stmt.type) {
    case 'expressionStatement':
      return convertExpressionStatement(stmt);
    case 'returnStatement':
      return convertReturnStatement(stmt);
    case 'blockStatement':
      return convertBlockStatement(stmt);
    case 'exportDefaultStatement':
      return convertExportDefaultStatement(stmt);
    case 'exportNamedStatement':
      return convertExportNamedStatement(stmt);
    case 'importStatement':
      return convertImportStatement(stmt);
    case 'importNamespaceStatement':
      return convertImportNamespaceStatement(stmt);
    default:
      throw new Error(`Unknown statement type: ${stmt.type}`);
  }
}

/**
 * Convert Oddo expression statement to Babel expression statement
 */
function convertExpressionStatement(stmt) {
  // Handle modifiers
  if (stmt.modifier) {
    const modifierTransform = MODIFIER_TRANSFORMATIONS[stmt.modifier];
    if (!modifierTransform) {
      throw new Error(`Unknown modifier: @${stmt.modifier}`);
    }

    // Handle modifier on expression: @state x = 3
    if (stmt.expression) {
      // Extract the value and left side from the expression
      let valueExpr = null;
      let leftExpr = null;

      // If it's a declaration (=) or assignment (:=), extract both left and right sides
      if (stmt.expression.type === 'assignment' && (stmt.expression.operator === '=' || stmt.expression.operator === ':=')) {
        leftExpr = convertExpression(stmt.expression.left);
        valueExpr = convertExpression(stmt.expression.right);
      } else {
        // Otherwise, use the expression itself as the value
        valueExpr = convertExpression(stmt.expression);
      }

      // Apply the modifier transformation
      const { needsOddoImport: modifierNeedsImport, transform } = modifierTransform;
      console.log({ modifierNeedsImport, transform });
      if (modifierNeedsImport) {
        needsOddoImport = true;
      }

      const transformedStmt = transform(valueExpr, leftExpr);

      // The transform function returns either a VariableDeclaration or ExpressionStatement
      // Return it directly (don't wrap in another ExpressionStatement)
      return transformedStmt;
    }

    // Handle modifier on block: @state:\n  x = 3\n  y = 4
    if (stmt.block) {
      // Apply the modifier transformation to each statement in the block
      const transformedStatements = [];

      for (const blockStmt of stmt.block.body) {
        // If the statement has its own modifier, use that instead of the block's modifier
        if (blockStmt.modifier) {
          // Convert the statement with its own modifier
          transformedStatements.push(convertStatement(blockStmt));
        } else if (blockStmt.type === 'expressionStatement' && blockStmt.expression) {
          // Each statement in the block should be treated as if it has the block's modifier
          // Only process expression statements (assignments/declarations)
          // Extract the value and left side from the expression
          let valueExpr = null;
          let leftExpr = null;

          // If it's a declaration (=) or assignment (:=), extract both left and right sides
          if (blockStmt.expression.type === 'assignment' && (blockStmt.expression.operator === '=' || blockStmt.expression.operator === ':=')) {
            leftExpr = convertExpression(blockStmt.expression.left);
            valueExpr = convertExpression(blockStmt.expression.right);
          } else {
            // Otherwise, use the expression itself as the value
            valueExpr = convertExpression(blockStmt.expression);
          }

          // Apply the modifier transformation
          const { needsOddoImport: modifierNeedsImport, transform } = modifierTransform;
          if (modifierNeedsImport) {
            needsOddoImport = true;
          }

          const transformedStmt = transform(valueExpr, leftExpr);
          transformedStatements.push(transformedStmt);
        } else {
          // For non-expression statements, convert normally
          transformedStatements.push(convertStatement(blockStmt));
        }
      }

      // Return all transformed statements as a sequence (they'll be flattened by convertProgram)
      // Actually, we need to return them individually, but convertProgram expects a single statement
      // So we'll return them as a block statement
      return t.blockStatement(transformedStatements);
    }
  }

  let expression = null;

  if (stmt.expression) {
    expression = convertExpression(stmt.expression);
  }

  // If there's a block, wrap in an IIFE or handle appropriately
  if (stmt.block) {
    const block = convertBlockStatement(stmt.block);
    // For modifier blocks, we might want to wrap them differently
    // For now, just convert the block to a statement
    if (expression) {
      // If there's both expression and block, create a sequence
      return t.expressionStatement(
        t.sequenceExpression([
          expression,
          t.callExpression(
            t.arrowFunctionExpression([], block.body.length === 1 ? block.body[0].expression : t.blockStatement(block.body)),
            []
          )
        ])
      );
    } else {
      // Just a block - convert to IIFE
      return t.expressionStatement(
        t.callExpression(
          t.arrowFunctionExpression([], block),
          []
        )
      );
    }
  }

  if (!expression) {
    throw new Error('Expression statement must have expression or block');
  }

  // In Oddo, = is a declaration (const), := is an assignment (expression)
  if (stmt.expression && stmt.expression.type === 'assignment' && stmt.expression.operator === '=') {
    // Check if left-hand side is a member access (a.b.c) or array slice (arr[3...6])
    // These cannot be declarations and must use := instead
    if (stmt.expression.left.type === 'memberAccess') {
      throw new Error('Member access assignments must use := operator, not =');
    }
    if (stmt.expression.left.type === 'arraySlice') {
      throw new Error('Array slice assignments must use := operator, not =');
    }

    const left = convertExpression(stmt.expression.left);
    const right = convertExpression(stmt.expression.right);
    return t.variableDeclaration('const', [
      t.variableDeclarator(left, right)
    ]);
  }

  // := operator is an assignment expression, not a declaration
  // It will be handled by convertExpression which calls convertAssignmentExpression

  // Handle array slice assignment as declaration
  if (stmt.expression && stmt.expression.type === 'arraySliceAssignment') {
    const sliceAssignment = convertExpression(stmt.expression);
    // Array slice assignments are expressions, but we need to wrap them in a declaration
    // Actually, array slice assignments modify the array in place, so they should remain as expressions
    // But if the user wants them as declarations, we could create a const for the result
    // For now, keep as expression statement since slice assignment modifies in place
    return t.expressionStatement(sliceAssignment);
  }

  return t.expressionStatement(expression);
}

/**
 * Convert Oddo return statement to Babel return statement
 */
function convertReturnStatement(stmt) {
  const argument = stmt.argument ? convertExpression(stmt.argument) : null;
  return t.returnStatement(argument);
}

/**
 * Convert Oddo block statement to Babel block statement
 */
function convertBlockStatement(stmt) {
  const body = stmt.body.map(convertStatement);
  return t.blockStatement(body);
}

/**
 * Convert Oddo expression to Babel expression
 */
function convertExpression(expr) {
  if (!expr) return null;

  switch (expr.type) {
    case 'identifier':
      return t.identifier(expr.name);

    case 'number':
      // If raw value is present (hex, binary, octal, or scientific notation), use it
      // Otherwise use the numeric value
      if (expr.raw) {
        // Create numeric literal with raw value preserved
        // Babel's numericLiteral doesn't directly support raw, so we'll create it manually
        const node = t.numericLiteral(expr.value);
        node.extra = { raw: expr.raw, rawValue: expr.value };
        return node;
      }
      return t.numericLiteral(expr.value);

    case 'string':
      return t.stringLiteral(expr.value);

    case 'templateLiteral':
      return convertTemplateLiteral(expr);

    case 'taggedTemplate':
      return convertTaggedTemplate(expr);

    case 'boolean':
      return t.booleanLiteral(expr.value);

    case 'null':
      return t.nullLiteral();

    case 'array':
      return convertArrayLiteral(expr);

    case 'object':
      return convertObjectLiteral(expr);

    case 'arrowFunction':
      return convertArrowFunction(expr);

    case 'call':
      return convertCallExpression(expr);

    case 'memberAccess':
      return convertMemberExpression(expr);

    case 'arraySlice':
      return convertArraySlice(expr);

    case 'binary':
      return convertBinaryExpression(expr);

    case 'logical':
      return convertLogicalExpression(expr);

    case 'nullishCoalescing':
      return convertNullishCoalescing(expr);

    case 'pipe':
      return convertPipe(expr);

    case 'compose':
      return convertCompose(expr);

    case 'unary':
      return convertUnaryExpression(expr);

    case 'prefix':
      return convertUpdateExpression(expr, true);

    case 'postfix':
      return convertUpdateExpression(expr, false);

    case 'conditional':
      return convertConditionalExpression(expr);

    case 'assignment':
      return convertAssignmentExpression(expr);

    case 'arraySliceAssignment':
      return convertArraySliceAssignment(expr);

    case 'arrayPattern':
      return convertArrayPattern(expr);

    case 'objectPattern':
      return convertObjectPattern(expr);

    case 'jsxElement':
      return convertJSXElement(expr);

    case 'jsxFragment':
      return convertJSXFragment(expr);

    default:
      throw new Error(`Unknown expression type: ${expr.type}`);
  }
}

/**
 * Convert Oddo array literal to Babel array expression
 */
function convertArrayLiteral(expr) {
  const elements = expr.elements.map(el => {
    if (!el) return null; // Handle holes in arrays
    if (el.type === 'spreadElement') {
      return t.spreadElement(convertExpression(el.argument));
    }
    if (el.type === 'spread') {
      return t.spreadElement(convertExpression(el.expression));
    }
    return convertExpression(el);
  }).filter(Boolean);
  return t.arrayExpression(elements);
}

/**
 * Convert Oddo object literal to Babel object expression
 */
function convertObjectLiteral(expr) {
  const properties = expr.properties.map(prop => {
    if (prop.type === 'spreadProperty') {
      return t.spreadElement(convertExpression(prop.argument));
    }

    const key = convertExpression(prop.key);
    const value = convertExpression(prop.value);

    // Check if this is a computed key
    const computed = prop.computed || false;

    if (prop.shorthand) {
      return t.objectProperty(key, value, computed, true);
    }

    return t.objectProperty(key, value, computed, false);
  });

  return t.objectExpression(properties);
}

/**
 * Convert Oddo arrow function to Babel arrow function expression
 */
function convertArrowFunction(expr) {
  const params = expr.parameters.map(param => {
    if (param.type === 'restElement') {
      return t.restElement(convertExpression(param.argument));
    }
    if (param.type === 'destructuringPattern') {
      // Destructuring pattern parameter: [a, b] or {a, b} or [a, b] = default or {a, b} = default
      const pattern = convertExpression(param.pattern);
      if (param.default) {
        return t.assignmentPattern(pattern, convertExpression(param.default));
      }
      return pattern;
    }
    if (param.type === 'parameter') {
      const paramId = t.identifier(param.name);
      // Add default value if present
      if (param.default) {
        return t.assignmentPattern(paramId, convertExpression(param.default));
      }
      return paramId;
    }
    // Handle array/object patterns (legacy support)
    return convertExpression(param);
  });

  let body;
  if (expr.body && expr.body.type === 'blockStatement') {
    // Block body: convert blockStatement to BlockStatement
    const statements = expr.body.body.map(stmt => convertStatement(stmt));
    body = t.blockStatement(statements);
  } else if (expr.body) {
    // Expression body: convert expression
    body = convertExpression(expr.body);
  } else {
    body = null;
  }

  return t.arrowFunctionExpression(params, body);
}

/**
 * Convert Oddo call expression to Babel call expression
 */
function convertCallExpression(expr) {
  const callee = convertExpression(expr.callee);
  const args = expr.arguments.map(arg => {
    // Handle spread arguments
    if (arg.type === 'spreadElement') {
      return t.spreadElement(convertExpression(arg.argument));
    }
    return convertExpression(arg);
  });

  // Handle optional chaining: func?.(args)
  if (expr.optional) {
    return t.optionalCallExpression(callee, args, true);
  }

  return t.callExpression(callee, args);
}

/**
 * Convert Oddo template literal to Babel template literal
 */
function convertTemplateLiteral(expr) {
  const quasis = expr.quasis.map(quasi => {
    return t.templateElement(
      quasi.value,
      quasi.tail
    );
  });

  const expressions = expr.expressions.map(expr => convertExpression(expr));

  return t.templateLiteral(quasis, expressions);
}

/**
 * Convert Oddo tagged template to Babel tagged template expression
 */
function convertTaggedTemplate(expr) {
  const tag = convertExpression(expr.tag);
  const template = convertTemplateLiteral(expr.template);

  return t.taggedTemplateExpression(tag, template);
}

/**
 * Convert Oddo member access to Babel member expression
 */
function convertMemberExpression(expr) {
  const object = convertExpression(expr.object);
  const property = typeof expr.property === 'string'
    ? t.identifier(expr.property)
    : convertExpression(expr.property);

  // Handle optional chaining: obj?.prop or obj?.[expr]
  if (expr.optional) {
    return t.optionalMemberExpression(object, property, expr.computed || false, true);
  }

  return t.memberExpression(object, property, expr.computed || false);
}

/**
 * Convert Oddo array slice to Babel call expression (array.slice(start, end))
 */
function convertArraySlice(expr) {
  const object = convertExpression(expr.object);
  const args = [];

  // Add start argument if present
  if (expr.start !== null && expr.start !== undefined) {
    args.push(convertExpression(expr.start));
  } else {
    // For [..], use slice(0) to copy entire array
    args.push(t.numericLiteral(0));
  }

  // Add end argument if present
  if (expr.end !== null && expr.end !== undefined) {
    args.push(convertExpression(expr.end));
  }

  // Create array.slice(start, end) call
  const sliceProperty = t.identifier('slice');
  const sliceMember = t.memberExpression(object, sliceProperty, false);
  return t.callExpression(sliceMember, args);
}

/**
 * Convert Oddo binary expression to Babel binary expression
 */
function convertBinaryExpression(expr) {
  const left = convertExpression(expr.left);
  const right = convertExpression(expr.right);

  // Map Oddo operators to Babel operators
  const operatorMap = {
    '+': '+',
    '-': '-',
    '*': '*',
    '/': '/',
    '%': '%',
    '**': '**',
    '==': '===',  // Map == to === in JavaScript
    '!=': '!==',  // Map != to !== in JavaScript
    '<': '<',
    '<=': '<=',
    '>': '>',
    '>=': '>=',
    '<<': '<<',
    '>>': '>>',
    '>>>': '>>>',
    '&': '&',
    '^': '^',
    '|': '|',
    'instanceof': 'instanceof',
    'in': 'in',
  };

  const operator = operatorMap[expr.operator] || expr.operator;
  return t.binaryExpression(operator, left, right);
}

/**
 * Convert Oddo logical expression to Babel logical expression
 */
function convertLogicalExpression(expr) {
  const left = convertExpression(expr.left);
  const right = convertExpression(expr.right);
  const operator = expr.operator === '&&' ? '&&' : '||';
  return t.logicalExpression(operator, left, right);
}

/**
 * Convert Oddo nullish coalescing expression to Babel nullish coalescing expression
 */
function convertNullishCoalescing(expr) {
  const left = convertExpression(expr.left);
  const right = convertExpression(expr.right);
  return t.logicalExpression('??', left, right);
}

/**
 * Convert Oddo pipe expression to Babel call expression
 * a |> b |> c -> c(b(a))
 */
function convertPipe(expr) {
  const left = convertExpression(expr.left);
  const right = convertExpression(expr.right);

  // Right side should be a function call: right(left)
  return t.callExpression(right, [left]);
}

/**
 * Convert Oddo compose expression to Babel call expression
 * c <| b <| a -> c(b(a))
 */
function convertCompose(expr) {
  const left = convertExpression(expr.left);
  const right = convertExpression(expr.right);

  // Left side should be a function call: left(right)
  return t.callExpression(left, [right]);
}

/**
 * Convert Oddo unary expression to Babel unary expression
 */
function convertUnaryExpression(expr) {
  const argument = convertExpression(expr.operand);

  const operatorMap = {
    '+': '+',
    '-': '-',
    '!': '!',
    '~': '~',
    'typeof': 'typeof',
    'void': 'void',
    'delete': 'delete',
  };

  const operator = operatorMap[expr.operator] || expr.operator;
  return t.unaryExpression(operator, argument);
}

/**
 * Convert Oddo update expression (prefix/postfix) to Babel update expression
 */
function convertUpdateExpression(expr, prefix) {
  const argument = convertExpression(expr.operand);
  const operator = expr.operator === '++' ? '++' : '--';
  return t.updateExpression(operator, argument, prefix);
}

/**
 * Convert Oddo conditional expression to Babel conditional expression
 */
function convertConditionalExpression(expr) {
  const test = convertExpression(expr.test);
  const consequent = convertExpression(expr.consequent);
  const alternate = convertExpression(expr.alternate);
  return t.conditionalExpression(test, consequent, alternate);
}

/**
 * Convert Oddo assignment expression to Babel assignment expression
 */
function convertAssignmentExpression(expr) {
  const left = convertExpression(expr.left);
  const right = convertExpression(expr.right);

  const operatorMap = {
    '=': '=',
    ':=': '=', // Map := to = in JavaScript
    '+:=': '+=',
    '-:=': '-=',
    '*:=': '*=',
    '/:=': '/=',
    '%:=': '%=',
    '**:=': '**=',
    '<<:=': '<<=',
    '>>:=': '>>=',
    '>>>:=': '>>>=',
    '&:=': '&=',
    '^:=': '^=',
    '|:=': '|=',
  };

  const operator = operatorMap[expr.operator] || expr.operator;
  return t.assignmentExpression(operator, left, right);
}

/**
 * Convert Oddo array slice assignment to Babel call expression
 * arr[start...end] = values -> Array.prototype.splice.apply(arr, [start, deleteCount].concat(values))
 */
function convertArraySliceAssignment(expr) {
  const slice = expr.slice;
  const object = convertExpression(slice.object);
  const value = convertExpression(expr.value);

  // Calculate deleteCount: end - start
  // If end is null, we need to handle it differently
  let startExpr, deleteCountExpr;

  if (slice.start === null || slice.start === undefined) {
    // [...end] = value -> slice from 0 to end
    startExpr = t.numericLiteral(0);
    if (slice.end === null || slice.end === undefined) {
      // [...] = value -> replace entire array
      deleteCountExpr = t.memberExpression(
        object,
        t.identifier('length'),
        false
      );
    } else {
      // [...end] = value -> deleteCount = end - 0 = end
      deleteCountExpr = convertExpression(slice.end);
    }
  } else {
    startExpr = convertExpression(slice.start);
    if (slice.end === null || slice.end === undefined) {
      // [start...] = value -> deleteCount = arr.length - start
      deleteCountExpr = t.binaryExpression(
        '-',
        t.memberExpression(object, t.identifier('length'), false),
        startExpr
      );
    } else {
      // [start...end] = value -> deleteCount = end - start
      const endExpr = convertExpression(slice.end);
      // If both are numeric literals, compute the difference
      if (slice.start.type === 'number' && slice.end.type === 'number') {
        const deleteCount = slice.end.value - slice.start.value;
        deleteCountExpr = t.numericLiteral(deleteCount);
      } else {
        deleteCountExpr = t.binaryExpression('-', endExpr, startExpr);
      }
    }
  }

  // Create [start, deleteCount] array
  const spliceArgs = t.arrayExpression([startExpr, deleteCountExpr]);

  // Create .concat(value) call
  const concatCall = t.callExpression(
    t.memberExpression(spliceArgs, t.identifier('concat'), false),
    [value]
  );

  // Create Array.prototype.splice
  const spliceMethod = t.memberExpression(
    t.memberExpression(
      t.memberExpression(t.identifier('Array'), t.identifier('prototype'), false),
      t.identifier('splice'),
      false
    ),
    t.identifier('apply'),
    false
  );

  // Create Array.prototype.splice.apply(arr, [start, deleteCount].concat(value))
  return t.callExpression(spliceMethod, [object, concatCall]);
}

/**
 * Convert Oddo array pattern to Babel array pattern
 */
function convertArrayPattern(expr) {
  const elements = expr.elements.map(el => {
    if (el.type === 'restElement') {
      return t.restElement(convertExpression(el.argument));
    }
    return convertExpression(el);
  });
  return t.arrayPattern(elements);
}

/**
 * Convert Oddo object pattern to Babel object pattern
 */
function convertObjectPattern(expr) {
  const properties = expr.properties.map(prop => {
    if (prop.type === 'restProperty') {
      return t.restElement(convertExpression(prop.argument));
    }

    const key = convertExpression(prop.key);
    let value = prop.shorthand
      ? null // Babel handles shorthand automatically
      : convertExpression(prop.value);

    // Handle default value
    if (prop.default) {
      const actualValue = value || key; // Use value if present, otherwise key (for shorthand)
      value = t.assignmentPattern(actualValue, convertExpression(prop.default));
    } else {
      value = value || key; // For shorthand, use key
    }

    // Babel objectProperty: (key, value, computed, shorthand)
    // computed defaults to false if key is an identifier
    // shorthand is false if there's a default value (since we wrap it in assignmentPattern)
    const computed = prop.key && prop.key.type === 'string';
    return t.objectProperty(key, value, computed, prop.shorthand && !prop.default);
  });

  return t.objectPattern(properties);
}

/**
 * Convert Oddo JSX element to Babel JSX element
 */
function convertJSXElement(expr) {
  const name = t.jsxIdentifier(expr.name);

  const attributes = expr.attributes.map(attr => {
    if (attr.type === 'jsxSpread') {
      return t.jsxSpreadAttribute(convertExpression(attr.expression));
    }

    const name = t.jsxIdentifier(attr.name);
    let value = null;

    if (attr.value === null) {
      // Boolean attribute
      value = null;
    } else if (attr.value.type === 'string') {
      // String literal attribute - use plain stringLiteral (not wrapped in JSXExpressionContainer)
      value = t.stringLiteral(attr.value.value);
    } else if (attr.value.type === 'expression') {
      // Expression attribute - wrap in JSXExpressionContainer
      value = t.jsxExpressionContainer(convertExpression(attr.value.value));
    } else {
      // Fallback: treat as expression
      value = t.jsxExpressionContainer(convertExpression(attr.value));
    }

    return t.jsxAttribute(name, value);
  });

  const children = expr.children.map(child => {
    if (child.type === 'jsxText') {
      return t.jsxText(child.value);
    } else if (child.type === 'jsxExpression') {
      return t.jsxExpressionContainer(convertExpression(child.expression));
    } else if (child.type === 'jsxElement') {
      return convertJSXElement(child);
    } else if (child.type === 'jsxFragment') {
      return convertJSXFragment(child);
    }
    return null;
  }).filter(Boolean);

  // Handle self-closing elements
  const selfClosing = expr.selfClosing || false;

  return t.jsxElement(
    t.jsxOpeningElement(name, attributes, selfClosing),
    selfClosing ? null : t.jsxClosingElement(name),
    children,
    selfClosing
  );
}

/**
 * Convert Oddo JSX fragment to Babel JSX fragment
 */
function convertJSXFragment(expr) {
  const children = expr.children.map(child => {
    if (child.type === 'jsxText') {
      return t.jsxText(child.value);
    } else if (child.type === 'jsxExpression') {
      return t.jsxExpressionContainer(convertExpression(child.expression));
    } else if (child.type === 'jsxElement') {
      return convertJSXElement(child);
    } else if (child.type === 'jsxFragment') {
      return convertJSXFragment(child);
    }
    return null;
  }).filter(Boolean);

  return t.jsxFragment(
    t.jsxOpeningFragment(),
    t.jsxClosingFragment(),
    children
  );
}

/**
 * Convert Oddo export default statement to Babel export default declaration
 */
function convertExportDefaultStatement(stmt) {
  const declaration = convertExpression(stmt.declaration);
  return t.exportDefaultDeclaration(declaration);
}

/**
 * Convert Oddo export named statement to Babel export named declaration
 */
function convertExportNamedStatement(stmt) {
  if (stmt.declaration) {
    // export x = 1 (named export of declaration) or export x := 1 (named export of assignment)
    // Convert = to export const x = 1, := to export assignment expression
    const exprStmt = stmt.declaration;
    if (exprStmt.type === 'expressionStatement' && exprStmt.expression && exprStmt.expression.type === 'assignment') {
      const assignment = exprStmt.expression;
      // Only = is a declaration, := is an assignment expression
      if (assignment.operator === '=') {
        const id = convertExpression(assignment.left);
        const init = convertExpression(assignment.right);
        const declaration = t.variableDeclaration('const', [
          t.variableDeclarator(id, init)
        ]);
        return t.exportNamedDeclaration(declaration, []);
      } else {
        // := is an assignment expression - convert to regular assignment
        // Note: JavaScript doesn't support export x = 3 directly, so we'll convert it
        // For now, treat := exports the same as = exports (const declaration)
        // This might need refinement based on language design
      const id = convertExpression(assignment.left);
      const init = convertExpression(assignment.right);
      const declaration = t.variableDeclaration('const', [
        t.variableDeclarator(id, init)
      ]);
      return t.exportNamedDeclaration(declaration, []);
      }
    }
    // Fallback: try to convert as-is
    const declaration = convertStatement(stmt.declaration);
    return t.exportNamedDeclaration(declaration, []);
  }

  // export { x, y } or export { x as y }
  const specifiers = stmt.specifiers.map(spec => {
    const local = t.identifier(spec.local);
    const exported = spec.local === spec.exported
      ? local
      : t.identifier(spec.exported);
    return t.exportSpecifier(local, exported);
  });

  return t.exportNamedDeclaration(null, specifiers);
}

/**
 * Convert Oddo import statement to Babel import declaration
 */
function convertImportStatement(stmt) {
  const specifiers = [];

  // Add default import if present
  if (stmt.defaultImport) {
    specifiers.push(t.importDefaultSpecifier(t.identifier(stmt.defaultImport)));
  }

  // Add named imports
  for (const spec of stmt.specifiers) {
    const imported = spec.imported === spec.local
      ? t.identifier(spec.imported)
      : t.identifier(spec.imported);
    const local = t.identifier(spec.local);
    specifiers.push(t.importSpecifier(local, imported));
  }

  const source = t.stringLiteral(stmt.source);
  return t.importDeclaration(specifiers, source);
}

/**
 * Convert Oddo import namespace statement to Babel import namespace declaration
 */
function convertImportNamespaceStatement(stmt) {
  const namespace = t.importNamespaceSpecifier(t.identifier(stmt.namespace));
  const source = t.stringLiteral(stmt.source);
  return t.importDeclaration([namespace], source);
}
