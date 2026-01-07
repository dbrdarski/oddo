/**
 * Oddo Language Compiler
 * Compiles Oddo AST to JavaScript using Babel
 */

import _generate from '@babel/generator';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

const generate = _generate.default || _generate;
const traverse = _traverse.default || _traverse;

// Helper function to extract identifiers from a Babel AST expression
function extractIdentifiers(babelNode) {
  const identifiers = new Set();
  const locals = new Set(); // Track locally bound identifiers

  function traverse(node) {
    if (!node) return;

    if (t.isIdentifier(node)) {
      // Skip local bindings and internal placeholders
      if (!locals.has(node.name) && !node.name.startsWith('__ODDO_IMPORT_')) {
        identifiers.add(node.name);
      }
    } else if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
      traverse(node.object);
      if (node.computed) traverse(node.property);
    } else if (t.isCallExpression(node) || t.isOptionalCallExpression(node)) {
      traverse(node.callee);
      node.arguments?.forEach(arg => traverse(arg));
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
      node.elements?.forEach(el => traverse(el));
    } else if (t.isObjectExpression(node)) {
      node.properties?.forEach(prop => {
        if (t.isObjectProperty(prop)) {
          if (prop.computed) traverse(prop.key);
          traverse(prop.value);
        } else if (t.isSpreadElement(prop)) {
          traverse(prop.argument);
        }
      });
    } else if (t.isArrowFunctionExpression(node)) {
      // Collect params as locals, then traverse body
      node.params.forEach(p => {
        if (t.isIdentifier(p)) locals.add(p.name);
        else if (t.isObjectPattern(p)) p.properties.forEach(prop => t.isIdentifier(prop.value) && locals.add(prop.value.name));
        else if (t.isArrayPattern(p)) p.elements?.forEach(el => t.isIdentifier(el) && locals.add(el.name));
      });
      if (t.isBlockStatement(node.body)) node.body.body.forEach(s => traverse(s));
      else traverse(node.body);
    } else if (t.isBlockStatement(node)) {
      node.body.forEach(s => traverse(s));
    } else if (t.isExpressionStatement(node)) {
      traverse(node.expression);
    } else if (t.isReturnStatement(node)) {
      traverse(node.argument);
    } else if (t.isSequenceExpression(node)) {
      node.expressions.forEach(expr => traverse(expr));
    } else if (t.isUpdateExpression(node)) {
      traverse(node.argument);
    } else if (t.isAssignmentExpression(node)) {
      traverse(node.left);
      traverse(node.right);
    } else if (t.isSpreadElement(node)) {
      traverse(node.argument);
    }
  }

  traverse(babelNode);
  return Array.from(identifiers);
}

// Wrap dependency references with call expressions: x -> x()
function wrapDependenciesWithCalls(arrowFunc, deps) {
  const depSet = new Set(deps);
  const locals = new Set();
  
  const tempFile = t.file(t.program([t.expressionStatement(arrowFunc)]));
  
  // Collect local bindings from nested arrow functions
  traverse(tempFile, {
    noScope: true,
    ArrowFunctionExpression(path) {
      if (path.node !== arrowFunc) {
        path.node.params.forEach(p => t.isIdentifier(p) && locals.add(p.name));
      }
    }
  });

  // Collect and replace identifiers (skip params and object keys)
  const toReplace = [];
  const shorthandToExpand = [];
  traverse(tempFile, {
    noScope: true,
    Identifier(path) {
      // Skip if this is a param of the main arrow function
      if (t.isArrowFunctionExpression(path.parent) && path.parent.params.includes(path.node)) {
        return;
      }
      const parent = path.parent;
      // Skip member expression properties (non-computed)
      const isMemberProp = t.isMemberExpression(parent) && parent.property === path.node && !parent.computed;
      // Skip object property keys (non-shorthand)
      const isObjectKey = t.isObjectProperty(parent) && parent.key === path.node && !parent.shorthand;
      // Handle shorthand properties specially: { c } -> { c: c() }
      const isShorthand = t.isObjectProperty(parent) && parent.shorthand && parent.key === path.node;
      
      if (depSet.has(path.node.name) && !isMemberProp && !isObjectKey && !locals.has(path.node.name)) {
        if (isShorthand) {
          shorthandToExpand.push({ prop: parent, name: path.node.name });
        } else {
          toReplace.push(path);
        }
      }
    }
  });
  // Expand shorthand properties: { c } -> { c: c() }
  shorthandToExpand.forEach(({ prop, name }) => {
    prop.shorthand = false;
    prop.value = t.callExpression(t.identifier(name), []);
  });
  toReplace.forEach(p => p.replaceWith(t.callExpression(t.identifier(p.node.name), [])));
}

// Create a reactive expression call: _x((deps...) => expr with deps(), [deps...])
function createReactiveExpr(valueExpr) {
  const identifiers = extractIdentifiers(valueExpr);
  
  if (identifiers.length === 0) {
    // No dependencies - just return the expression directly if it's a literal
    if (t.isLiteral(valueExpr)) {
      return valueExpr;
    }
    // Otherwise wrap with empty deps
    usedModifiers.add('x');
    const arrowFunc = t.arrowFunctionExpression([], valueExpr);
    return t.callExpression(
      t.identifier(modifierAliases['x']),
      [arrowFunc, t.arrayExpression([])]
    );
  }
  
  usedModifiers.add('x');
  const params = identifiers.map(id => t.identifier(id));
  const deps = identifiers.map(id => t.identifier(id));
  const arrowFunc = t.arrowFunctionExpression(params, valueExpr);
  wrapDependenciesWithCalls(arrowFunc, identifiers);
  
  return t.callExpression(
    t.identifier(modifierAliases['x']),
    [arrowFunc, t.arrayExpression(deps)]
  );
}

// Modifier transformations map
// Maps modifier names to transformation functions
const MODIFIER_TRANSFORMATIONS = {
  state: {
    // @state x = 3 -> const [x, setX] = _state(3);
    transform: (valueExpr, leftExpr) => {
      const stateCall = t.callExpression(
        t.identifier(modifierAliases['state']),
        [valueExpr]
      );

      // If there's a left side (variable name), create array destructuring
      if (leftExpr && t.isIdentifier(leftExpr)) {
        const getterName = leftExpr.name;
        const setterBaseName = 'set' + getterName.charAt(0).toUpperCase() + getterName.slice(1);
        const setterName = generateUniqueId(setterBaseName);
        
        // Track state-to-setter mapping for @mutate validation
        stateSetterMap.set(getterName, setterName);
        
        return t.variableDeclaration('const', [
          t.variableDeclarator(
            t.arrayPattern([
              t.identifier(getterName),
              t.identifier(setterName)
            ]),
            stateCall
          )
        ]);
      }
      return t.expressionStatement(stateCall);
    },
  },
  computed: {
    // @computed sum = x + y -> const sum = _computed((x, y) => x() + y(), [x, y])
    transform: (valueExpr, leftExpr) => {
      const identifiers = extractIdentifiers(valueExpr);
      const params = identifiers.map(id => t.identifier(id));
      const deps = identifiers.map(id => t.identifier(id));

      const arrowFunc = t.arrowFunctionExpression(params, valueExpr);

      // Wrap dependency references with call expressions
      wrapDependenciesWithCalls(arrowFunc, identifiers);

      const computedCall = t.callExpression(
        t.identifier(modifierAliases['computed']),
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
    // @react sum = x + y -> const sum = _react((x, y) => x() + y(), [x, y])
    transform: (valueExpr, leftExpr) => {
      const identifiers = extractIdentifiers(valueExpr);
      const params = identifiers.map(id => t.identifier(id));
      const deps = identifiers.map(id => t.identifier(id));

      const arrowFunc = t.arrowFunctionExpression(params, valueExpr);

      // Wrap dependency references with call expressions
      wrapDependenciesWithCalls(arrowFunc, identifiers);

      const reactCall = t.callExpression(
        t.identifier(modifierAliases['react']),
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
    // @mutate x = (arg1, arg2) => { x1 := value1; x2 := value2 }
    // -> const x = mutate((finalizer, x1, x2, ...outerDeps, arg1, arg2) => { ... }, finalizerFn, stateContainers, outerDeps)
    transform: (oddoExpr, leftExpr) => {
      // mutate must be an arrow function (Oddo AST)
      if (oddoExpr.type !== 'arrowFunction') {
        throw new Error('@mutate modifier must be a function');
      }

      // Extract function parameters
      const funcParams = (oddoExpr.parameters || []).map(p => p.name);
      
      // Find all := assignments in the function body
      const stateAssignments = []; // { name, rightExpr (Oddo AST) }
      const bodyStatements = oddoExpr.body?.body || [];
      
      for (const stmt of bodyStatements) {
        if (stmt.type === 'expressionStatement' && 
            stmt.expression?.type === 'assignment' && 
            stmt.expression?.operator === ':=') {
          const leftName = stmt.expression.left?.name;
          if (!leftName) {
            throw new Error('@mutate: := assignment must have an identifier on the left side');
          }
          // Validate that this is a @state variable
          if (!stateSetterMap.has(leftName)) {
            throw new Error(`@mutate: Cannot mutate '${leftName}': not a @state variable in current scope`);
          }
          stateAssignments.push({
            name: leftName,
            setter: stateSetterMap.get(leftName),
            rightOddo: stmt.expression.right
          });
        }
      }
      
      if (stateAssignments.length === 0) {
        throw new Error('@mutate function must contain at least one := assignment');
      }
      
      const stateContainerNames = stateAssignments.map(a => a.name);
      
      // Collect outer dependencies from all := right-hand sides
      const outerDeps = new Set();
      for (const assignment of stateAssignments) {
        collectOddoIdentifiers(assignment.rightOddo).forEach(id => {
          if (!funcParams.includes(id) && !stateContainerNames.includes(id)) {
            outerDeps.add(id);
          }
        });
      }
      const outerDepsArray = Array.from(outerDeps);
      
      // Build the mutate function body
      // Parameters: (finalizer, ...stateContainers, ...outerDeps, ...originalParams)
      const mutateParams = [
        t.identifier('finalizer'),
        ...stateContainerNames.map(n => t.identifier(n)),
        ...outerDepsArray.map(n => t.identifier(n)),
        ...funcParams.map(n => t.identifier(n))
      ];
      
      // Build body statements: stateContainer = stateProxy(rightExpr with deps wrapped)
      usedModifiers.add('stateProxy');
      const mutateBodyStmts = [];
      
      // Set of all identifiers that need to be called (state containers + outer deps)
      const callableIds = new Set([...stateContainerNames, ...outerDepsArray]);
      
      for (const assignment of stateAssignments) {
        // Convert right side to Babel AST
        const rightBabel = convertExpression(assignment.rightOddo);
        
        // Wrap identifiers that are callable (state containers or outer deps) with ()
        const tempFile = t.file(t.program([t.expressionStatement(rightBabel)]));
        const toReplace = [];
        const shorthandToExpand = [];
        traverse(tempFile, {
          noScope: true,
          Identifier(path) {
            const parent = path.parent;
            const isMemberProp = t.isMemberExpression(parent) && parent.property === path.node && !parent.computed;
            const isObjectKey = t.isObjectProperty(parent) && parent.key === path.node && !parent.shorthand;
            const isShorthand = t.isObjectProperty(parent) && parent.shorthand && parent.key === path.node;
            
            if (callableIds.has(path.node.name) && !isMemberProp && !isObjectKey) {
              if (isShorthand) {
                shorthandToExpand.push({ prop: parent, name: path.node.name });
              } else {
                toReplace.push(path);
              }
            }
          }
        });
        shorthandToExpand.forEach(({ prop, name }) => {
          prop.shorthand = false;
          prop.value = t.callExpression(t.identifier(name), []);
        });
        toReplace.forEach(p => p.replaceWith(t.callExpression(t.identifier(p.node.name), [])));
        
        // Get the modified expression from tempFile
        const wrappedRightExpr = tempFile.program.body[0].expression;
        
        // stateContainer = stateProxy(rightExpr)
        mutateBodyStmts.push(
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.identifier(assignment.name),
              t.callExpression(
                t.identifier(modifierAliases['stateProxy']),
                [wrappedRightExpr]
              )
            )
          )
        );
      }
      
      // Add finalizer call: finalizer(x1(), x2(), x3())
      mutateBodyStmts.push(
        t.expressionStatement(
          t.callExpression(
            t.identifier('finalizer'),
            stateContainerNames.map(n => t.callExpression(t.identifier(n), []))
          )
        )
      );
      
      const mutateArrowFunc = t.arrowFunctionExpression(
        mutateParams,
        t.blockStatement(mutateBodyStmts)
      );
      
      // Build finalizer function: (x1, x2, x3) => (setX1(x1), setX2(x2), setX3(x3))
      const finalizerParams = stateContainerNames.map(n => t.identifier(n));
      const finalizerCalls = stateAssignments.map(a => 
        t.callExpression(t.identifier(a.setter), [t.identifier(a.name)])
      );
      const finalizerBody = finalizerCalls.length === 1 
        ? finalizerCalls[0]
        : t.sequenceExpression(finalizerCalls);
      const finalizerFunc = t.arrowFunctionExpression(finalizerParams, finalizerBody);
      
      // Build state containers array: [x1, x2, x3]
      const stateContainersArray = t.arrayExpression(
        stateContainerNames.map(n => t.identifier(n))
      );
      
      // Build outer deps array: [outOfScopeDep]
      const outerDepsArrayExpr = t.arrayExpression(
        outerDepsArray.map(n => t.identifier(n))
      );
      
      // Build the mutate call
      const mutateCall = t.callExpression(
        t.identifier(modifierAliases['mutate']),
        [mutateArrowFunc, finalizerFunc, stateContainersArray, outerDepsArrayExpr]
      );

      if (leftExpr) {
        return t.variableDeclaration('const', [
          t.variableDeclarator(leftExpr, mutateCall)
        ]);
      }
      return t.expressionStatement(mutateCall);
    },
  },
  effect: {
    // @effect (() => setWhatever(x)) -> _effect((setWhatever, x) => { setWhatever()(x()) }, [setWhatever, x])
    transform: (valueExpr) => {
      // effect must be an arrow function
      if (valueExpr.type !== 'ArrowFunctionExpression') {
        throw new Error('effect modifier must be a function');
      }

      // Extract dependencies from the function body (not params, those are local)
      const identifiers = extractIdentifiers(valueExpr.body);
      const params = identifiers.map(id => t.identifier(id));
      const deps = identifiers.map(id => t.identifier(id));

      // Create new arrow function with dependencies as params
      const body = t.isBlockStatement(valueExpr.body) 
        ? valueExpr.body 
        : t.blockStatement([t.expressionStatement(valueExpr.body)]);
      const arrowFunc = t.arrowFunctionExpression(params, body);

      // Wrap dependency references with call expressions
      wrapDependenciesWithCalls(arrowFunc, identifiers);

      const effectCall = t.callExpression(
        t.identifier(modifierAliases['effect']),
        [arrowFunc, t.arrayExpression(deps)]
      );

      return t.expressionStatement(effectCall);
    },
  },
};

// Track which modifiers are used in the current compilation
let usedModifiers = new Set();
// Map from modifier name to unique identifier (generated by Babel)
let modifierAliases = {};
// Set of used names for collision avoidance (populated before conversion)
let usedNames = new Set();
// Map from state variable names to their setter names (for @mutate validation)
let stateSetterMap = new Map();

// UID generator that avoids collisions (available during conversion)
function generateUniqueId(baseName) {
  let candidate = baseName;
  let i = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}${i++}`;
  }
  usedNames.add(candidate);
  return candidate;
}

// Collect all identifiers from Oddo AST before conversion
function collectOddoIdentifiers(node, names = new Set()) {
  if (!node || typeof node !== 'object') return names;
  
  if (node.type === 'identifier') {
    names.add(node.name);
  }
  
  // Recursively traverse all object properties
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      val.forEach(item => collectOddoIdentifiers(item, names));
    } else if (val && typeof val === 'object') {
      collectOddoIdentifiers(val, names);
    }
  }
  return names;
}

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

  // Reset tracking variables
  usedModifiers = new Set();
  modifierAliases = {};
  usedNames = collectOddoIdentifiers(ast);
  stateSetterMap = new Map();

  // First pass: Convert AST with temporary placeholder identifiers
  // Modifiers: state, computed, react, mutate, effect
  // JSX Pragmas: e (element), c (component), x (expression), f (fragment)
  // Helpers: stateProxy
  const allImports = ['state', 'computed', 'react', 'mutate', 'effect', 'stateProxy', 'e', 'c', 'x', 'f'];
  for (const name of allImports) {
    modifierAliases[name] = `__ODDO_IMPORT_${name}__`;
  }

  const babelAST = convertProgram(ast);
  const fileAST = t.file(babelAST);
  
  // Also collect identifiers from generated Babel AST (in case conversion added any)
  traverse(fileAST, {
    noScope: true,
    Identifier(path) {
      if (!path.node.name.startsWith('__ODDO_IMPORT_')) {
        usedNames.add(path.node.name);
      }
    }
  });
  
  // UID generator that avoids collisions
  const generateUid = (name) => {
    let candidate = `_${name}`;
    let i = 1;
    while (usedNames.has(candidate)) {
      candidate = `_${name}${i++}`;
    }
    usedNames.add(candidate);
    return candidate;
  };

  // Generate unique identifiers for each import that was actually used
  const tempToUnique = {};
  for (const name of usedModifiers) {
    const tempName = `__ODDO_IMPORT_${name}__`;
    const uniqueName = generateUid(name);
    tempToUnique[tempName] = uniqueName;
    modifierAliases[name] = uniqueName;
  }
  
  // Replace all temporary identifiers with unique ones
  if (Object.keys(tempToUnique).length > 0) {
    traverse(fileAST, {
      noScope: true,
      Identifier(path) {
        if (tempToUnique[path.node.name]) {
          path.node.name = tempToUnique[path.node.name];
        }
      }
    });
  }

  // Add imports for modifiers/pragmas that were actually used
  if (usedModifiers.size > 0) {
    // Create named import with aliases
    // import { state as _state, e as _e } from "@oddo/ui"
    const specifiers = Array.from(usedModifiers).map(name => {
      return t.importSpecifier(
        t.identifier(modifierAliases[name]), // local: _state, _e
        t.identifier(name)                   // imported: state, e
      );
    });

    const importDeclaration = t.importDeclaration(
      specifiers,
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
      if (stmt.expression.type === 'variableDeclaration' || stmt.expression.type === 'assignment') {
        leftExpr = convertExpression(stmt.expression.left);
        // For mutate modifier, pass original Oddo AST for special processing
        if (stmt.modifier === 'mutate') {
          valueExpr = stmt.expression.right; // Oddo AST, not converted
        } else {
          valueExpr = convertExpression(stmt.expression.right);
        }
      } else {
        // Otherwise, use the expression itself as the value
        if (stmt.modifier === 'mutate') {
          valueExpr = stmt.expression; // Oddo AST, not converted
        } else {
          valueExpr = convertExpression(stmt.expression);
        }
      }

      // Apply the modifier transformation
      const { transform } = modifierTransform;
      
      // Track that this modifier is used
      usedModifiers.add(stmt.modifier);

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
          if (blockStmt.expression.type === 'variableDeclaration' || blockStmt.expression.type === 'assignment') {
            leftExpr = convertExpression(blockStmt.expression.left);
            valueExpr = convertExpression(blockStmt.expression.right);
          } else {
            // Otherwise, use the expression itself as the value
            valueExpr = convertExpression(blockStmt.expression);
          }

          // Apply the modifier transformation
          const { transform } = modifierTransform;
          
          // Track that this modifier is used
          usedModifiers.add(stmt.modifier);

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

  // In Oddo, = is a declaration (const), := is an assignment (expression)
  // Handle variable declaration before converting as expression
  if (stmt.expression && stmt.expression.type === 'variableDeclaration') {
    const left = convertExpression(stmt.expression.left);
    const right = convertExpression(stmt.expression.right);
    return t.variableDeclaration('const', [
      t.variableDeclarator(left, right)
    ]);
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
 * Convert JSX child to pragma call
 */
function convertJSXChild(child) {
  if (child.type === 'jsxText') {
    // Trim and skip whitespace-only text
    const text = child.value;
    if (!text.trim()) return null;
    return t.stringLiteral(text);
  } else if (child.type === 'jsxExpression') {
    // JSX expression: {expr} -> _x((deps) => expr(), [deps])
    const innerExpr = convertExpression(child.expression);
    return createReactiveExpr(innerExpr);
  } else if (child.type === 'jsxElement') {
    return convertJSXElement(child);
  } else if (child.type === 'jsxFragment') {
    return convertJSXFragment(child);
  }
  return null;
}

/**
 * Convert Oddo JSX element to pragma call: _e() or _c()
 */
function convertJSXElement(expr) {
  const tagName = expr.name;
  const isComponent = /^[A-Z]/.test(tagName);
  const pragma = isComponent ? 'c' : 'e';
  usedModifiers.add(pragma);
  
  // Check if any attribute is a spread
  const hasSpread = expr.attributes.some(attr => attr.type === 'jsxSpread');
  
  let propsArg;
  
  if (hasSpread) {
    // With spread: wrap entire props object in _x()
    // _x((deps...) => ({ ...spread(), attr: value() }), [deps...])
    const properties = [];
    
    for (const attr of expr.attributes) {
      if (attr.type === 'jsxSpread') {
        properties.push(t.spreadElement(convertExpression(attr.expression)));
      } else {
        const key = t.identifier(attr.name);
        let value;
        if (attr.value === null) {
          value = t.booleanLiteral(true);
        } else if (attr.value.type === 'string') {
          value = t.stringLiteral(attr.value.value);
        } else if (attr.value.type === 'expression') {
          value = convertExpression(attr.value.value);
        } else {
          value = convertExpression(attr.value);
        }
        properties.push(t.objectProperty(key, value));
      }
    }
    
    const propsObj = t.objectExpression(properties);
    propsArg = createReactiveExpr(propsObj);
  } else if (expr.attributes.length === 0) {
    // No attributes
    propsArg = t.nullLiteral();
  } else {
    // No spread: build object with individual _x() for expressions
    const properties = [];
    
    for (const attr of expr.attributes) {
      const key = t.identifier(attr.name);
      let value;
      
      if (attr.value === null) {
        // Boolean attribute: disabled -> {disabled: true}
        value = t.booleanLiteral(true);
      } else if (attr.value.type === 'string') {
        // String literal: class="x" -> {class: "x"}
        value = t.stringLiteral(attr.value.value);
      } else if (attr.value.type === 'expression') {
        // Expression: value={x} -> {value: _x((x) => x(), [x])}
        const innerExpr = convertExpression(attr.value.value);
        value = createReactiveExpr(innerExpr);
      } else {
        const innerExpr = convertExpression(attr.value);
        value = createReactiveExpr(innerExpr);
      }
      
      properties.push(t.objectProperty(key, value));
    }
    
    propsArg = t.objectExpression(properties);
  }
  
  // Convert children
  const children = expr.children
    .map(convertJSXChild)
    .filter(Boolean);
  
  // Build pragma call: _e("div", props, ...children) or _c(Component, props, ...children)
  const tagArg = isComponent ? t.identifier(tagName) : t.stringLiteral(tagName);
  const args = [tagArg, propsArg, ...children];
  
  return t.callExpression(
    t.identifier(modifierAliases[pragma]),
    args
  );
}

/**
 * Convert Oddo JSX fragment to pragma call: _f()
 */
function convertJSXFragment(expr) {
  usedModifiers.add('f');
  
  const children = expr.children
    .map(convertJSXChild)
    .filter(Boolean);
  
  return t.callExpression(
    t.identifier(modifierAliases['f']),
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
    const exprStmt = stmt.declaration;
    if (exprStmt.type === 'expressionStatement' && exprStmt.expression) {
      // Variable declaration: export x = 1
      if (exprStmt.expression.type === 'variableDeclaration') {
        const id = convertExpression(exprStmt.expression.left);
        const init = convertExpression(exprStmt.expression.right);
        const declaration = t.variableDeclaration('const', [
          t.variableDeclarator(id, init)
        ]);
        return t.exportNamedDeclaration(declaration, []);
      }
      // Assignment: export x := 1
      // Note: JavaScript doesn't support export x = 3 directly, so we'll convert it
      // to a const declaration for compatibility
      if (exprStmt.expression.type === 'assignment') {
        const id = convertExpression(exprStmt.expression.left);
        const init = convertExpression(exprStmt.expression.right);
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
