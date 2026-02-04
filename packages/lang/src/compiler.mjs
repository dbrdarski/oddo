 /**
 * Oddo Language Compiler
 * Compiles Oddo AST to JavaScript using Babel
 */

import _generate from '@babel/generator';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

const generate = _generate.default || _generate;
const traverse = _traverse.default || _traverse;

// Helper function to check if a string is a valid JavaScript identifier
function isValidJSIdentifier(name) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

// Wrap dependency references with call expressions: x -> x()
function wrapDependenciesWithCalls(arrowFunc, deps, prefix = '') {
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
    // Skip already-processed reactive expression calls - don't modify their deps arrays
    // These have the pattern: _x(fn, deps) or _computed(fn, deps) or similar
    CallExpression(path) {
      const callee = path.node.callee;
      // Check if this looks like a reactive wrapper call (identifier starting with _ followed by fn and array)
      if (t.isIdentifier(callee) && callee.name.startsWith('_') && 
          path.node.arguments.length === 2 &&
          t.isArrowFunctionExpression(path.node.arguments[0]) &&
          t.isArrayExpression(path.node.arguments[1])) {
        path.skip(); // Don't traverse into this call's children
      }
    },
    Identifier(path) {
      // Skip if this is a param of the main arrow function
      if (t.isArrowFunctionExpression(path.parent) && path.parent.params.includes(path.node)) {
        return;
      }
      const parent = path.parent;
      // Skip binding positions (destructuring patterns, variable declarations)
      // These are LVal positions where we can't replace with CallExpression
      if (t.isObjectPattern(parent) || t.isArrayPattern(parent)) {
        return;
      }
      if (t.isVariableDeclarator(parent) && parent.id === path.node) {
        return;
      }
      // Skip if inside a destructuring pattern (check grandparent for nested patterns)
      if (t.isObjectProperty(parent) && t.isObjectPattern(path.parentPath?.parent)) {
        return;
      }
      // Skip member expression properties (non-computed)
      const isMemberProp = (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) && parent.property === path.node && !parent.computed;
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
  // Expand shorthand properties: { c } -> { c: c() } or { c: _c() } with prefix
  shorthandToExpand.forEach(({ prop, name }) => {
    prop.shorthand = false;
    prop.value = t.callExpression(t.identifier(prefix + name), []);
  });
  // Replace identifiers: foo -> foo() or foo -> _foo() with prefix
  toReplace.forEach(p => p.replaceWith(t.callExpression(t.identifier(prefix + p.node.name), [])));
}

// Check if an identifier is known to be non-reactive (@mutable or normal declaration)
// Uses scope-based lookup with prototypal inheritance
function isKnownNonReactive(name) {
  return isNonReactive(name);
}

// Filter identifiers to get only potentially reactive ones
// Excludes: undeclared/globals, @mutable, normal declarations
// Includes: @state, @computed, function params
function getReactiveDeps(identifiers) {
  return identifiers.filter(id => {
    // Undeclared/global → non-reactive (not in any scope)
    if (!isDeclared(id)) {
      return false;
    }
    // Known non-reactive (@mutable, immutable) → non-reactive
    if (isNonReactive(id)) {
      return false;
    }
    // Known reactive (state, computed, param) → include
    return true;
  });
}

// Create a lifted expression: _lift((deps...) => expr, [deps...])
// For functions: _liftFn((deps..., originalParams...) => body, [deps...])
// NO transformation of expression body - runtime handles unwrapping
function createLiftedExpr(valueExpr, identifiers) {
  const reactiveDeps = getReactiveDeps(identifiers);
  
  if (reactiveDeps.length === 0) {
    // No reactive deps - return expression as-is
    return null;
  }
  
  const depParams = reactiveDeps.map(id => t.identifier(id));
  const depsArray = reactiveDeps.map(id => t.identifier(id));
  
  // Check if valueExpr is a function expression
  if (t.isArrowFunctionExpression(valueExpr)) {
    // For functions: use _liftFn, prepend reactive deps to existing params
    usedModifiers.add('liftFn');
    
    // Prepend reactive dep params to original function params
    const newParams = [...depParams, ...valueExpr.params];
    const liftedFunc = t.arrowFunctionExpression(newParams, valueExpr.body);
    
    return t.callExpression(
      t.identifier(modifierAliases['liftFn']),
      [liftedFunc, t.arrayExpression(depsArray)]
    );
  }
  
  // For non-functions: use _lift
  usedModifiers.add('lift');
  const arrowFunc = t.arrowFunctionExpression(depParams, valueExpr);
  
  return t.callExpression(
    t.identifier(modifierAliases['lift']),
    [arrowFunc, t.arrayExpression(depsArray)]
  );
}

// Create a reactive expression call: _x((deps...) => expr with deps(), [deps...])
// oddoExpr: Oddo AST to extract identifiers from
// valueExpr: Babel AST for the expression
// attrExpression: whether this is for a JSX attribute (uses 'computed' pragma)
function createReactiveExpr(oddoExpr, valueExpr, attrExpression = false) {
  // Extract identifiers from Oddo AST and filter to reactive ones
  // Stop at nested jsxExpression nodes - each is its own reactivity boundary
  const allIdentifiers = collectOddoIdentifiersOnly(oddoExpr, new Set(), true);
  const identifiers = allIdentifiers.filter(id => isReactive(id));
  const pragma = attrExpression ? 'computed' : 'x'

  if (identifiers.length === 0) {
    // No dependencies - just return the expression directly if it's a literal
    if (t.isLiteral(valueExpr)) {
      return valueExpr;
    }
    // Otherwise wrap with empty deps
    usedModifiers.add(pragma);
    const arrowFunc = t.arrowFunctionExpression([], valueExpr);
    return t.callExpression(
      t.identifier(modifierAliases[pragma]),
      [arrowFunc, t.arrayExpression([])]
    );
  }

  usedModifiers.add(pragma);
  // Use prefixed param names to avoid shadowing in nested scopes
  const params = identifiers.map(id => t.identifier('_' + id));
  // Deps array uses original names (references the actual reactive signals)
  const deps = identifiers.map(id => t.identifier(id));
  const arrowFunc = t.arrowFunctionExpression(params, valueExpr);
  // Replace identifiers with prefixed + called versions: foo -> _foo()
  wrapDependenciesWithCalls(arrowFunc, identifiers, '_');

  return t.callExpression(
    t.identifier(modifierAliases[pragma]),
    [arrowFunc, t.arrayExpression(deps)]
  );
}

// Modifier transformations map
// Maps modifier names to transformation functions
const MODIFIER_TRANSFORMATIONS = {
  state: {
    needsImport: true,
    // @state x = 3 -> const [x, setX] = _state(3);
    // @state x = reactiveVar -> const [x, setX] = _state(_lift(_reactiveVar => _reactiveVar(), [reactiveVar]));
    // Receives Oddo AST, extracts deps, lifts if needed
    transform: (oddoExpr, leftExpr) => {
      // Collect identifiers and filter to reactive deps
      const allIdentifiers = collectOddoIdentifiersOnly(oddoExpr);
      const reactiveDeps = allIdentifiers.filter(id => isReactive(id));
      
      // Convert Oddo AST to Babel AST
      const convertedExpr = convertExpression(oddoExpr);
      
      let stateArg;
      if (reactiveDeps.length > 0) {
        // Wrap with _lift for reactive deps
        usedModifiers.add('lift');
        const prefixedParams = reactiveDeps.map(id => t.identifier('_' + id));
        const deps = reactiveDeps.map(id => t.identifier(id));
        const arrowFunc = t.arrowFunctionExpression(prefixedParams, convertedExpr);
        wrapDependenciesWithCalls(arrowFunc, reactiveDeps, '_');
        stateArg = t.callExpression(
          t.identifier(modifierAliases['lift']),
          [arrowFunc, t.arrayExpression(deps)]
        );
      } else {
        stateArg = convertedExpr;
      }
      
      const stateCall = t.callExpression(
        t.identifier(modifierAliases['state']),
        [stateArg]
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
      } else if (leftExpr && t.isArrayPattern(leftExpr) && leftExpr.elements.length === 2) {
        // User-provided setter name: @state [x, setX] = value
        const getterName = leftExpr.elements[0].name;
        const setterName = leftExpr.elements[1].name;

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
    needsImport: true,
    // @computed sum = x + y -> const sum = _computed((x, y) => x() + y(), [x, y])
    // Receives Oddo AST, extracts deps from Oddo, converts internally
    transform: (oddoExpr, leftExpr) => {
      // Extract reactive deps from Oddo AST
      const allIds = collectOddoIdentifiersOnly(oddoExpr);
      const identifiers = allIds.filter(id => isReactive(id));
      
      // Mark scope as non-reactive for nested functions (deps are unwrapped inside @computed)
      const savedScope = currentScope;
      currentScope = Object.create(currentScope);
      currentScope[reactiveScope] = false;
      
      // Convert Oddo AST to Babel AST
      const valueExpr = convertExpression(oddoExpr);
      
      // Restore scope
      currentScope = savedScope;
      
      const params = identifiers.map(id => t.identifier(id));
      const deps = identifiers.map(id => t.identifier(id));

      const arrowFunc = t.arrowFunctionExpression(params, valueExpr);

      // Wrap dependency references with call expressions
      wrapDependenciesWithCalls(arrowFunc, identifiers);

      const computedCall = t.callExpression(
        t.identifier(modifierAliases['computed']),
        [arrowFunc, t.arrayExpression(deps)]
      );

      if (leftExpr && t.isIdentifier(leftExpr)) {
        // Variable is already tracked in scope during pre-pass
        return t.variableDeclaration('const', [
          t.variableDeclarator(leftExpr, computedCall)
        ]);
      }
      return t.expressionStatement(computedCall);
    },
  },
  mutate: {
    needsImport: true,
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
      // Each assignment has a 'kind': 'state' or 'mutable'
      const assignments = [];
      const bodyStatements = oddoExpr.body?.body || [];

      for (const stmt of bodyStatements) {
        if (stmt.type === 'expressionStatement') {
          // Handle regular assignments (simple := and compound like +:=, -:=, etc.)
          if (stmt.expression?.type === 'assignment') {
            const leftName = stmt.expression.left?.name;
            if (!leftName) {
              throw new Error('@mutate: assignment must have an identifier on the left side');
            }
            
            // For compound assignments, expand to full form: x +:= y -> x := x + y
            let rightOddo = stmt.expression.right;
            const op = stmt.expression.operator;
            if (op !== ':=') {
              // Extract base operator: '+:=' -> '+'
              const baseOp = op.slice(0, -2);
              // Determine the AST type for the expanded expression
              let exprType;
              if (baseOp === '??') {
                exprType = 'nullishCoalescing';  // ?? uses its own type
              } else if (baseOp === '&&' || baseOp === '||') {
                exprType = 'logical';
              } else {
                exprType = 'binary';
              }
              // Synthesize expanded right-hand side
              rightOddo = {
                type: exprType,
                operator: baseOp,
                left: stmt.expression.left,
                right: stmt.expression.right
              };
            }
            
            // Check if it's a @state or @mutable variable
            if (stateSetterMap.has(leftName)) {
              assignments.push({
                name: leftName,
                kind: 'state',
                setter: stateSetterMap.get(leftName),
                rightOddo
              });
            } else if (mutableVariables.has(leftName)) {
              assignments.push({
                name: leftName,
                kind: 'mutable',
                rightOddo
              });
            } else {
              throw new Error(`@mutate: Cannot mutate '${leftName}': not a @state or @mutable variable in current scope`);
            }
          }
          
          // Handle array slice assignments: arr[0...2] := value
          if (stmt.expression?.type === 'arraySliceAssignment') {
            const arrayName = stmt.expression.slice?.object?.name;
            if (!arrayName) {
              throw new Error('@mutate: array slice assignment must have an identifier as the array');
            }
            
            // Check if it's a @state or @mutable variable
            if (stateSetterMap.has(arrayName)) {
              assignments.push({
                name: arrayName,
                kind: 'state-slice',
                setter: stateSetterMap.get(arrayName),
                sliceOddo: stmt.expression.slice,
                rightOddo: stmt.expression.value
              });
            } else if (mutableVariables.has(arrayName)) {
              assignments.push({
                name: arrayName,
                kind: 'mutable-slice',
                sliceOddo: stmt.expression.slice,
                rightOddo: stmt.expression.value
              });
            } else {
              throw new Error(`@mutate: Cannot mutate '${arrayName}': not a @state or @mutable variable in current scope`);
            }
          }
        }
      }

      if (assignments.length === 0) {
        throw new Error('@mutate function must contain at least one mutation');
      }

      // Separate state and mutable assignments (including slice variants)
      const stateAssignments = assignments.filter(a => a.kind === 'state' || a.kind === 'state-slice');
      const mutableAssignments = assignments.filter(a => a.kind === 'mutable' || a.kind === 'mutable-slice');
      
      // Only state containers need special handling (not slices - they modify in place)
      const stateContainerNames = assignments.filter(a => a.kind === 'state').map(a => a.name);
      const allAssignmentNames = assignments.filter(a => a.kind === 'state' || a.kind === 'mutable').map(a => a.name);

      // Collect outer dependencies from all right-hand sides (and slice expressions)
      // Exclude @mutable variables from callable deps (they're plain values)
      const outerDeps = new Set();
      for (const assignment of assignments) {
        collectOddoIdentifiers(assignment.rightOddo).forEach(id => {
          if (!funcParams.includes(id) && !allAssignmentNames.includes(id)) {
            outerDeps.add(id);
          }
        });
        // Also collect deps from slice expressions (start, end indices)
        if (assignment.sliceOddo) {
          if (assignment.sliceOddo.start) {
            collectOddoIdentifiers(assignment.sliceOddo.start).forEach(id => {
              if (!funcParams.includes(id) && !allAssignmentNames.includes(id)) {
                outerDeps.add(id);
              }
            });
          }
          if (assignment.sliceOddo.end) {
            collectOddoIdentifiers(assignment.sliceOddo.end).forEach(id => {
              if (!funcParams.includes(id) && !allAssignmentNames.includes(id)) {
                outerDeps.add(id);
              }
            });
          }
        }
      }
      const outerDepsArray = Array.from(outerDeps);

      // Get all state names (regular + slice) for the mutate function
      const stateSliceNames = assignments.filter(a => a.kind === 'state-slice').map(a => a.name);
      const allStateNamesForParams = [...stateContainerNames, ...stateSliceNames];
      
      // Build the mutate function body
      // Parameters: (finalizer, ...stateContainers, ...outerDeps, ...originalParams)
      const mutateParams = [
        t.identifier('finalizer'),
        ...allStateNamesForParams.map(n => t.identifier(n)),
        ...outerDepsArray.map(n => t.identifier(n)),
        ...funcParams.map(n => t.identifier(n))
      ];

      // Build body statements
      const mutateBodyStmts = [];
      
      // Only add stateProxy if we have state assignments
      if (stateAssignments.length > 0) {
        usedModifiers.add('stateProxy');
      }

      // Set of all identifiers that need to be called with ()
      // This includes: state containers, state-slice arrays, outer deps that are NOT @mutable
      const callableIds = new Set([
        ...stateContainerNames,
        ...stateSliceNames,
        ...outerDepsArray.filter(id => !mutableVariables.has(id))
      ]);

      // Mark scope as non-reactive for nested functions (deps are unwrapped inside @mutate)
      const savedScopeMutate = currentScope;
      currentScope = Object.create(currentScope);
      currentScope[reactiveScope] = false;

      for (const assignment of assignments) {
        // Convert right side to Babel AST
        const rightBabel = convertExpression(assignment.rightOddo);

        // Wrap identifiers that are callable (reactive containers) with ()
        const tempFile = t.file(t.program([t.expressionStatement(rightBabel)]));
        const toReplace = [];
        const shorthandToExpand = [];
        traverse(tempFile, {
          noScope: true,
          Identifier(path) {
            const parent = path.parent;
            const isMemberProp = (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) && parent.property === path.node && !parent.computed;
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

        if (assignment.kind === 'state') {
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
        } else if (assignment.kind === 'mutable') {
          // mutable: direct assignment
          mutateBodyStmts.push(
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.identifier(assignment.name),
                wrappedRightExpr
              )
            )
          );
        } else if (assignment.kind === 'state-slice' || assignment.kind === 'mutable-slice') {
          // Slice assignment: convert the full arraySliceAssignment expression
          // Reconstruct the Oddo AST for the slice assignment
          const sliceAssignmentOddo = {
            type: 'arraySliceAssignment',
            slice: assignment.sliceOddo,
            value: assignment.rightOddo
          };
          const sliceExpr = convertExpression(sliceAssignmentOddo);
          
          // Wrap identifiers in the slice expression with () calls
          const sliceTempFile = t.file(t.program([t.expressionStatement(sliceExpr)]));
          const sliceToReplace = [];
          const sliceShorthandToExpand = [];
          traverse(sliceTempFile, {
            noScope: true,
            Identifier(path) {
              const parent = path.parent;
              const isMemberProp = (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) && parent.property === path.node && !parent.computed;
              const isObjectKey = t.isObjectProperty(parent) && parent.key === path.node && !parent.shorthand;
              const isShorthand = t.isObjectProperty(parent) && parent.shorthand && parent.key === path.node;

              if (callableIds.has(path.node.name) && !isMemberProp && !isObjectKey) {
                if (isShorthand) {
                  sliceShorthandToExpand.push({ prop: parent, name: path.node.name });
                } else {
                  sliceToReplace.push(path);
                }
              }
            }
          });
          sliceShorthandToExpand.forEach(({ prop, name }) => {
            prop.shorthand = false;
            prop.value = t.callExpression(t.identifier(name), []);
          });
          sliceToReplace.forEach(p => p.replaceWith(t.callExpression(t.identifier(p.node.name), [])));
          
          mutateBodyStmts.push(t.expressionStatement(sliceTempFile.program.body[0].expression));
        }
      }

      // Restore scope after processing assignments
      currentScope = savedScopeMutate;

      // Collect all state variable names that need finalizer handling (both regular and slice)
      const allStateNames = stateAssignments.map(a => a.name);
      
      // Add finalizer call for all state variables: finalizer(x1(), x2(), arr())
      if (allStateNames.length > 0) {
        mutateBodyStmts.push(
          t.expressionStatement(
            t.callExpression(
              t.identifier('finalizer'),
              allStateNames.map(n => t.callExpression(t.identifier(n), []))
            )
          )
        );
      }

      const mutateArrowFunc = t.arrowFunctionExpression(
        mutateParams,
        t.blockStatement(mutateBodyStmts)
      );

      // Build finalizer function for all state assignments (regular and slice)
      const finalizerParams = allStateNames.map(n => t.identifier(n));
      const finalizerCalls = stateAssignments.map(a =>
        t.callExpression(t.identifier(a.setter), [t.identifier(a.name)])
      );
      const finalizerBody = finalizerCalls.length === 0
        ? t.identifier('undefined')
        : finalizerCalls.length === 1
          ? finalizerCalls[0]
          : t.sequenceExpression(finalizerCalls);
      const finalizerFunc = t.arrowFunctionExpression(finalizerParams, finalizerBody);

      // Build state containers array (all state variables including slices)
      const stateContainersArray = t.arrayExpression(
        allStateNamesForParams.map(n => t.identifier(n))
      );

      // Build outer deps array
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
    needsImport: true,
    // @effect (() => setWhatever(x)) -> _effect((setWhatever, x) => { setWhatever()(x()) }, [setWhatever, x])
    // Note: receives Oddo AST (not Babel AST) to avoid premature wrapping with _liftFn
    transform: (oddoExpr) => {
      // effect must be an arrow function (Oddo AST)
      if (oddoExpr.type !== 'arrowFunction') {
        throw new Error('effect modifier must be a function');
      }

      // Extract dependencies from the function body (not params, those are local)
      // Use Oddo AST identifiers, filter out function's own params, and only keep reactive ones
      const bodyIdentifiers = collectOddoIdentifiersOnly(oddoExpr.body);
      const ownParams = new Set((oddoExpr.parameters || []).map(p => p.name));
      const identifiers = bodyIdentifiers.filter(id => !ownParams.has(id) && isReactive(id));
      
      const params = identifiers.map(id => t.identifier(id));
      const deps = identifiers.map(id => t.identifier(id));

      // BEFORE converting body: mark effect dependencies as non-reactive in scope
      // This prevents the body conversion from wrapping them with _lift
      // They will be called with () by wrapDependenciesWithCalls after conversion
      const savedScope = currentScope;
      currentScope = Object.create(currentScope);
      currentScope[reactiveScope] = false; // Nested functions don't need _liftFn for params
      for (const id of identifiers) {
        currentScope[id] = { type: 'param', reactive: false };
      }

      // Convert the body from Oddo AST to Babel AST
      let convertedBody;
      if (oddoExpr.body && oddoExpr.body.type === 'blockStatement') {
        // Block body
        const statements = oddoExpr.body.body.map(stmt => convertStatement(stmt));
        convertedBody = t.blockStatement(statements);
      } else if (oddoExpr.body) {
        // Expression body - wrap in block statement
        const exprBody = convertExpression(oddoExpr.body);
        convertedBody = t.blockStatement([t.expressionStatement(exprBody)]);
      } else {
        convertedBody = t.blockStatement([]);
      }

      // Restore parent scope
      currentScope = savedScope;

      // Create new arrow function with dependencies as params
      const arrowFunc = t.arrowFunctionExpression(params, convertedBody);

      // Wrap dependency references with call expressions
      wrapDependenciesWithCalls(arrowFunc, identifiers);

      const effectCall = t.callExpression(
        t.identifier(modifierAliases['effect']),
        [arrowFunc, t.arrayExpression(deps)]
      );

      return t.expressionStatement(effectCall);
    },
  },
  mutable: {
    needsImport: false,
    // @mutable x = 3 -> let x = 3;
    // @mutable x = y + 1 (y is @state) -> let x = _lift((y) => y() + 1, [y])
    // Receives Oddo AST, extracts deps from Oddo, converts internally
    transform: (oddoExpr, leftExpr) => {
      if (leftExpr && t.isIdentifier(leftExpr)) {
        // Track this as a mutable variable for @mutate validation
        mutableVariables.add(leftExpr.name);
        
        // Extract identifiers from Oddo AST
        const identifiers = collectOddoIdentifiersOnly(oddoExpr);
        const reactiveDeps = getReactiveDeps(identifiers);
        
        // Mark scope as non-reactive if there are reactive deps (will be lifted)
        const savedScope = currentScope;
        if (reactiveDeps.length > 0) {
          currentScope = Object.create(currentScope);
          currentScope[reactiveScope] = false;
        }
        
        // Convert Oddo AST to Babel AST
        const valueExpr = convertExpression(oddoExpr);
        
        // Restore scope
        if (reactiveDeps.length > 0) {
          currentScope = savedScope;
        }
        
        // Check if expression contains reactive dependencies
        const liftedExpr = createLiftedExpr(valueExpr, identifiers);
        
        return t.variableDeclaration('let', [
          t.variableDeclarator(leftExpr, liftedExpr || valueExpr)
        ]);
      }
      // If no left side, just return the expression (convert from Oddo)
      return t.expressionStatement(convertExpression(oddoExpr));
    },
  },
  component: {
    needsImport: false,
    // @component Counter = (props) => { ... } -> const Counter = function(props) { ... }
    // Parameters are treated as reactive, no _liftFn wrapping, compiles to regular function
    transform: (oddoExpr, leftExpr) => {
      if (oddoExpr.type !== 'arrowFunction') {
        throw new Error('@component modifier must be applied to an arrow function');
      }

      const funcExpr = convertReactiveContainer(oddoExpr);

      if (leftExpr && t.isIdentifier(leftExpr)) {
        return t.variableDeclaration('const', [
          t.variableDeclarator(leftExpr, funcExpr)
        ]);
      }
      return t.expressionStatement(funcExpr);
    },
  },
  hook: {
    needsImport: false,
    // @hook useCounter = (initial) => { ... } -> const useCounter = function(initial) { ... }
    // Parameters are treated as reactive, no _liftFn wrapping, compiles to regular function
    transform: (oddoExpr, leftExpr) => {
      if (oddoExpr.type !== 'arrowFunction') {
        throw new Error('@hook modifier must be applied to an arrow function');
      }

      const funcExpr = convertReactiveContainer(oddoExpr);

      if (leftExpr && t.isIdentifier(leftExpr)) {
        return t.variableDeclaration('const', [
          t.variableDeclarator(leftExpr, funcExpr)
        ]);
      }
      return t.expressionStatement(funcExpr);
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
// Set of mutable variable names (for @mutate validation)
let mutableVariables = new Set();

// Scope tracking using prototypal inheritance
// Each scope is an object where keys are variable names and values are { type, reactive }
// Child scopes inherit from parent scopes via Object.create()
let moduleScope = null;
let currentScope = null;

// Symbol to track whether current scope is "reactive" (functions could receive reactive values)
// Root scope is reactive; scopes inside dependency-tracking contexts are non-reactive
const reactiveScope = Symbol("reactive-scope");

// Variable info structure: { type: 'state'|'computed'|'mutable'|'immutable'|'param'|'import-oddo'|'import-js', reactive: boolean }
function declareVariable(name, type) {
  // Only state, computed, and oddo imports are reactive
  // Regular params are NOT reactive (they receive plain values from callers)
  // @component/@hook params use 'reactive-param' type and ARE reactive
  const reactive = (type === 'state' || type === 'computed' || type === 'reactive-param' || type === 'import-oddo');
  currentScope[name] = { type, reactive };
}

function isDeclared(name) {
  return name in currentScope;
}

function isReactive(name) {
  return currentScope[name]?.reactive === true;
}

function isNonReactive(name) {
  return currentScope[name]?.reactive === false;
}

function getVarType(name) {
  return currentScope[name]?.type;
}

// Extract all bound variable names from a destructuring pattern (Oddo AST)
// Handles objectPattern, arrayPattern, and nested patterns
function extractBoundNames(pattern, names = []) {
  if (!pattern) return names;

  if (pattern.type === 'identifier') {
    names.push(pattern.name);
  } else if (pattern.type === 'objectPattern') {
    for (const prop of pattern.properties || []) {
      if (prop.type === 'property') {
        // The bound name is in the value (which could be an identifier or nested pattern)
        extractBoundNames(prop.value, names);
      } else if (prop.type === 'restProperty') {
        // Rest property: { ...rest } -> rest is the bound name
        if (prop.argument?.type === 'identifier') {
          names.push(prop.argument.name);
        }
      }
    }
  } else if (pattern.type === 'arrayPattern') {
    for (const element of pattern.elements || []) {
      if (!element) continue; // Handle holes in array patterns
      if (element.type === 'identifier') {
        names.push(element.name);
      } else if (element.type === 'restElement') {
        // Rest element: [...rest] -> rest is the bound name
        if (element.argument?.type === 'identifier') {
          names.push(element.argument.name);
        }
      } else {
        // Nested pattern
        extractBoundNames(element, names);
      }
    }
  }

  return names;
}

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
// Also builds scope chain with variable declarations using prototypal inheritance
function collectOddoIdentifiers(node, names = new Set()) {
  if (!node || typeof node !== 'object') return names;

  // Initialize module scope for program node
  if (node.type === 'program') {
    moduleScope = Object.create(null);
    moduleScope[reactiveScope] = true; // Root scope is reactive
    currentScope = moduleScope;
  }

  if (node.type === 'identifier') {
    names.add(node.name);
  }

  // Collect variable declarations into current scope
  if (node.type === 'expressionStatement') {
    const left = node.expression?.left;
    const varName = left?.name;
    
    // Handle @state with array pattern: @state [x, setX] = value
    if (node.modifier === 'state' && left?.type === 'arrayPattern' && left.elements?.length === 2) {
      const getterName = left.elements[0]?.name;
      const setterName = left.elements[1]?.name;
      if (getterName) declareVariable(getterName, 'state');
      if (setterName) declareVariable(setterName, 'immutable');  // setter is not reactive
    } else if (varName) {
      // Determine variable type based on modifier
      if (node.modifier === 'state') {
        declareVariable(varName, 'state');
      } else if (node.modifier === 'computed') {
        declareVariable(varName, 'computed');
      } else if (node.modifier === 'mutable') {
        declareVariable(varName, 'mutable');
      } else if (!node.modifier && node.expression?.type === 'variableDeclaration') {
        declareVariable(varName, 'immutable');
      }
      // Other modifiers (effect, mutate, react) don't declare named variables in the same way
    }
  }

  // Handle import statements - track imported names with reactivity based on file extension
  if (node.type === 'importStatement') {
    const source = node.source || '';
    const isOddoImport = source.endsWith('.oddo');
    const type = isOddoImport ? 'import-oddo' : 'import-js';
    
    // Default import: import Btn from "..."
    if (node.defaultImport) {
      declareVariable(node.defaultImport, type);
    }
    // Named imports: import { x, y } from "..."
    for (const spec of node.specifiers || []) {
      const localName = spec.local || spec.imported;
      if (localName) {
        declareVariable(localName, type);
      }
    }
  }
  
  // Handle arrow functions - create child scope and add params
  if (node.type === 'arrowFunction') {
    // Create child scope
    const parentScope = currentScope;
    currentScope = Object.create(parentScope);
    
    // Store scope reference on AST node for conversion phase
    node._scope = currentScope;
    
    // Add function parameters to this scope
    if (node.parameters) {
      for (const param of node.parameters) {
        if (param.name) {
          // Simple parameter: (x) => ...
          declareVariable(param.name, 'param');
        } else if (param.type === 'destructuringPattern') {
          // Destructuring parameter: ({ x, y }) => ... or ([a, b]) => ...
          const boundNames = extractBoundNames(param.pattern);
          for (const name of boundNames) {
            declareVariable(name, 'param');
          }
        } else if (param.type === 'restElement' && param.argument?.name) {
          // Rest parameter: (...args) => ...
          declareVariable(param.argument.name, 'param');
        }
      }
    }
    
    // Traverse function body in child scope
    if (node.body) {
      collectOddoIdentifiers(node.body, names);
    }
    
    // Restore parent scope
    currentScope = parentScope;
    
    // Skip normal traversal for this node (we handled it specially)
    return names;
  }

  // Special handling for object properties - key is not a reference unless computed
  if (node.type === 'property') {
    if (node.computed && node.key) {
      collectOddoIdentifiers(node.key, names);
    }
    if (node.value) {
      collectOddoIdentifiers(node.value, names);
    }
    return names;
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
  stateSetterMap = new Map();
  mutableVariables = new Set();
  moduleScope = null;
  currentScope = null;
  
  // Pre-pass: collect all identifiers and build scope chain with variable types
  // This populates usedNames and sets up moduleScope/currentScope with prototypal inheritance
  usedNames = collectOddoIdentifiers(ast);

  // First pass: Convert AST with temporary placeholder identifiers
  // Modifiers: state, computed, react, mutate, effect
  // JSX Pragmas: e (element), c (component), x (expression), f (fragment)
  // Helpers: stateProxy
  const allImports = ['state', 'computed', 'mutate', 'effect', 'stateProxy', 'lift', 'liftFn', 'e', 'c', 'x', 'f'];
  for (const name of allImports) {
    modifierAliases[name] = `__ODDO_IMPORT_${name}__`;
  }

  const babelAST = convertProgram(ast);
  const fileAST = t.file(babelAST);

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
  // Filter to only those with needsImport: true (or not defined in MODIFIER_TRANSFORMATIONS, like JSX pragmas)
  const modifiersNeedingImport = Array.from(usedModifiers).filter(name => {
    const modifier = MODIFIER_TRANSFORMATIONS[name];
    // JSX pragmas (e, c, f, x) are not in MODIFIER_TRANSFORMATIONS, they always need import
    return !modifier || modifier.needsImport !== false;
  });

  if (modifiersNeedingImport.length > 0) {
    // Create named import with aliases
    // import { state as _state, e as _e } from "@oddo/ui"
    const specifiers = modifiersNeedingImport.map(name => {
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
        // For modifiers that need Oddo AST, pass original Oddo AST for special processing
        if (stmt.modifier === 'mutate' || stmt.modifier === 'effect' || stmt.modifier === 'computed' || stmt.modifier === 'mutable' || stmt.modifier === 'component' || stmt.modifier === 'hook' || stmt.modifier === 'state') {
          valueExpr = stmt.expression.right; // Oddo AST, not converted
        } else {
          valueExpr = convertExpression(stmt.expression.right);
        }
      } else {
        // Otherwise, use the expression itself as the value
        if (stmt.modifier === 'mutate' || stmt.modifier === 'effect' || stmt.modifier === 'computed' || stmt.modifier === 'mutable' || stmt.modifier === 'component' || stmt.modifier === 'hook' || stmt.modifier === 'state') {
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
            // For modifiers that need Oddo AST, pass raw Oddo AST (they extract deps from Oddo)
            if (stmt.modifier === 'mutate' || stmt.modifier === 'effect' || stmt.modifier === 'computed' || stmt.modifier === 'mutable' || stmt.modifier === 'component' || stmt.modifier === 'hook' || stmt.modifier === 'state') {
              valueExpr = blockStmt.expression.right;  // Oddo AST
            } else {
              valueExpr = convertExpression(blockStmt.expression.right);  // Babel AST
            }
          } else {
            // Otherwise, use the expression itself as the value
            if (stmt.modifier === 'mutate' || stmt.modifier === 'effect' || stmt.modifier === 'computed' || stmt.modifier === 'mutable' || stmt.modifier === 'component' || stmt.modifier === 'hook' || stmt.modifier === 'state') {
              valueExpr = blockStmt.expression;  // Oddo AST
            } else {
              valueExpr = convertExpression(blockStmt.expression);  // Babel AST
            }
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
    const oddoRight = stmt.expression.right;
    
    // Variable is already tracked in scope during pre-pass
    
    // Check if expression contains reactive dependencies
    // Skip lifting for arrow functions - they handle their own lifting via createArrowFunction
    let finalExpr;
    if (oddoRight.type !== 'arrowFunction') {
      const identifiers = collectOddoIdentifiersOnly(oddoRight);
      const reactiveDeps = getReactiveDeps(identifiers);
      
      // Mark scope as non-reactive if there are reactive deps (will be lifted)
      const savedScope = currentScope;
      if (reactiveDeps.length > 0) {
        currentScope = Object.create(currentScope);
        currentScope[reactiveScope] = false;
      }
      
      // Convert Oddo AST to Babel AST
      const right = convertExpression(oddoRight);
      
      // Restore scope
      if (reactiveDeps.length > 0) {
        currentScope = savedScope;
      }
      
      const liftedExpr = createLiftedExpr(right, identifiers);
      finalExpr = liftedExpr || right;
    } else {
      // Arrow functions handle their own lifting
      finalExpr = convertExpression(oddoRight);
    }
    
    return t.variableDeclaration('const', [
      t.variableDeclarator(left, finalExpr)
    ]);
  }

  let expression = null;

  if (stmt.expression) {
    // Check if this is a plain expression statement (not a declaration or assignment)
    // that contains reactive deps - if so, wrap with _lift
    const isPlainExpr = stmt.expression.type !== 'variableDeclaration' && 
                        stmt.expression.type !== 'assignment' &&
                        stmt.expression.type !== 'arraySliceAssignment';
    
    if (isPlainExpr) {
      const allIdentifiers = collectOddoIdentifiersOnly(stmt.expression);
      const reactiveDeps = allIdentifiers.filter(id => isReactive(id));
      
      if (reactiveDeps.length > 0) {
        // Mark scope as non-reactive for conversion
        const savedScope = currentScope;
        currentScope = Object.create(currentScope);
        currentScope[reactiveScope] = false;
        
        const convertedExpr = convertExpression(stmt.expression);
        
        currentScope = savedScope;
        
        // Wrap with _lift
        usedModifiers.add('lift');
        const prefixedParams = reactiveDeps.map(id => t.identifier('_' + id));
        const deps = reactiveDeps.map(id => t.identifier(id));
        const arrowFunc = t.arrowFunctionExpression(prefixedParams, convertedExpr);
        wrapDependenciesWithCalls(arrowFunc, reactiveDeps, '_');
        expression = t.callExpression(
          t.identifier(modifierAliases['lift']),
          [arrowFunc, t.arrayExpression(deps)]
        );
      } else {
        expression = convertExpression(stmt.expression);
      }
    } else {
      expression = convertExpression(stmt.expression);
    }
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
  // Switch to this function's scope (created during pre-pass)
  const savedScope = currentScope;
  if (expr._scope) {
    currentScope = expr._scope;
  }
  
  // Check if we're in a reactive scope (where params could be called with reactive values)
  const inReactiveScope = savedScope?.[reactiveScope] !== false;
  
  // BEFORE converting body: find reactive deps that will be captured
  // These will become additional params via _liftFn, so treat them as non-reactive inside
  // In non-reactive scopes, don't collect deps - they're already unwrapped by parent
  const bodyIdentifiers = collectOddoIdentifiersOnly(expr.body);
  const reactiveDepsForBody = inReactiveScope ? bodyIdentifiers.filter(id => {
    // Check if it's reactive in parent scope (not current function scope)
    // and not already a param of this function
    const isOwnParam = expr.parameters?.some(p => p.name === id);
    if (isOwnParam) return false;
    
    // Check parent scope for reactivity
    const varInfo = savedScope?.[id];
    return varInfo?.reactive === true;
  }) : [];
  
  // Add reactive deps as virtual params in current scope (so body doesn't wrap them)
  for (const dep of reactiveDepsForBody) {
    currentScope[dep] = { type: 'param', reactive: false }; // Treat as non-reactive param
  }
  
  // If this function will be wrapped with _liftFn, mark scope as non-reactive
  // Nested functions don't need _liftFn just for having params
  if (reactiveDepsForBody.length > 0) {
    currentScope[reactiveScope] = false;
  }
  
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

  // Restore parent scope
  currentScope = savedScope;

  // If there are reactive deps, OR (params AND we're in a reactive scope), wrap with _liftFn
  // In non-reactive scopes, we don't need _liftFn just for having params
  if (reactiveDepsForBody.length > 0 || (params.length > 0 && inReactiveScope)) {
    usedModifiers.add('liftFn');
    
    // Prepend reactive dep params to original params
    const depParams = reactiveDepsForBody.map(id => t.identifier(id));
    const allParams = [...depParams, ...params];
    const depsArray = reactiveDepsForBody.map(id => t.identifier(id));
    
    const liftedFunc = t.arrowFunctionExpression(allParams, body);
    
    return t.callExpression(
      t.identifier(modifierAliases['liftFn']),
      [liftedFunc, t.arrayExpression(depsArray)]
    );
  }

  return t.arrowFunctionExpression(params, body);
}

/**
 * Convert an Oddo arrow function to a reactive container (for @component and @hook)
 * - Compiles to a regular JS function (not arrow function)
 * - NO _liftFn wrapping
 * - Parameters are treated as reactive inside the body
 * - Body reactivity works normally (@state, @computed, etc.)
 */
function convertReactiveContainer(expr) {
  // Switch to this function's scope (created during pre-pass)
  const savedScope = currentScope;
  if (expr._scope) {
    currentScope = expr._scope;
  } else {
    // Create a new scope for this container
    currentScope = Object.create(savedScope);
  }
  
  // Mark all parameters as reactive in scope
  for (const param of (expr.parameters || [])) {
    if (param.name) {
      currentScope[param.name] = { type: 'param', reactive: true };
    } else if (param.type === 'destructuringPattern') {
      const boundNames = extractBoundNames(param.pattern);
      for (const name of boundNames) {
        currentScope[name] = { type: 'param', reactive: true };
      }
    } else if (param.type === 'restElement' && param.argument?.name) {
      currentScope[param.argument.name] = { type: 'param', reactive: true };
    }
  }
  
  // Convert parameters
  const params = (expr.parameters || []).map(param => {
    if (param.type === 'restElement') {
      return t.restElement(convertExpression(param.argument));
    }
    if (param.type === 'destructuringPattern') {
      const pattern = convertExpression(param.pattern);
      if (param.default) {
        return t.assignmentPattern(pattern, convertExpression(param.default));
      }
      return pattern;
    }
    if (param.type === 'parameter') {
      const paramId = t.identifier(param.name);
      if (param.default) {
        return t.assignmentPattern(paramId, convertExpression(param.default));
      }
      return paramId;
    }
    return convertExpression(param);
  });

  // Convert body
  let body;
  if (expr.body && expr.body.type === 'blockStatement') {
    const statements = expr.body.body.map(stmt => convertStatement(stmt));
    body = t.blockStatement(statements);
  } else if (expr.body) {
    // Expression body - wrap in return statement for function
    body = t.blockStatement([t.returnStatement(convertExpression(expr.body))]);
  } else {
    body = t.blockStatement([]);
  }

  // Restore parent scope
  currentScope = savedScope;

  // Return a regular function expression (not arrow function, no _liftFn)
  return t.functionExpression(null, params, body);
}

// Helper: collect identifiers from Oddo AST without side effects
function collectOddoIdentifiersOnly(node, names = new Set(), stopAtJsxExpressions = false) {
  if (!node || typeof node !== 'object') return Array.from(names);

  // Stop at jsxExpression boundaries - each is its own reactivity scope
  if (stopAtJsxExpressions && node.type === 'jsxExpression') {
    return Array.from(names);
  }

  if (node.type === 'identifier') {
    names.add(node.name);
  }

  // Special handling for object properties - key is not a reference unless computed
  if (node.type === 'property') {
    if (node.computed && node.key) {
      collectOddoIdentifiersOnly(node.key, names, stopAtJsxExpressions);
    }
    if (node.value) {
      collectOddoIdentifiersOnly(node.value, names, stopAtJsxExpressions);
    }
    return Array.from(names);
  }

  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      val.forEach(item => collectOddoIdentifiersOnly(item, names, stopAtJsxExpressions));
    } else if (val && typeof val === 'object') {
      collectOddoIdentifiersOnly(val, names, stopAtJsxExpressions);
    }
  }
  return Array.from(names);
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
    '&&:=': '&&=',
    '||:=': '||=',
    '??:=': '??=',
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
    // Keep all text including whitespace (whitespace is now intentionally preserved in AST)
    const text = child.value;
    if (!text) return null;  // Only skip truly empty strings
    return t.stringLiteral(text);
  } else if (child.type === 'jsxExpression') {
    // JSX expression: {expr} -> _x((deps) => expr(), [deps])
    // Mark scope as non-reactive for nested functions (will be wrapped with _x)
    const savedScope = currentScope;
    currentScope = Object.create(currentScope);
    currentScope[reactiveScope] = false;
    const innerExpr = convertExpression(child.expression);
    currentScope = savedScope;
    return createReactiveExpr(child.expression, innerExpr);
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
    // Mark scope as non-reactive for nested functions (will be wrapped with _x)
    const savedScopeSpread = currentScope;
    currentScope = Object.create(currentScope);
    currentScope[reactiveScope] = false;
    
    const properties = [];
    const oddoExprs = []; // Collect Oddo AST for identifier extraction

    for (const attr of expr.attributes) {
      if (attr.type === 'jsxSpread') {
        properties.push(t.spreadElement(convertExpression(attr.expression)));
        oddoExprs.push(attr.expression);
      } else {
        // Use string literal for keys with dashes or other non-identifier chars
        const key = isValidJSIdentifier(attr.name)
          ? t.identifier(attr.name)
          : t.stringLiteral(attr.name);
        let value;
        if (attr.value === null) {
          value = t.booleanLiteral(true);
        } else if (attr.value.type === 'string') {
          value = t.stringLiteral(attr.value.value);
        } else if (attr.value.type === 'expression') {
          value = convertExpression(attr.value.value);
          oddoExprs.push(attr.value.value);
        } else {
          value = convertExpression(attr.value);
          oddoExprs.push(attr.value);
        }
        properties.push(t.objectProperty(key, value));
      }
    }
    
    // Restore scope
    currentScope = savedScopeSpread;

    const propsObj = t.objectExpression(properties);
    // Create synthetic Oddo object for identifier collection
    const syntheticOddo = { type: 'array', elements: oddoExprs };
    propsArg = createReactiveExpr(syntheticOddo, propsObj, true);
  } else if (expr.attributes.length === 0) {
    // No attributes
    propsArg = t.nullLiteral();
  } else {
    // No spread: build object with individual _x() for expressions
    const properties = [];

    for (const attr of expr.attributes) {
      // Use string literal for keys with dashes or other non-identifier chars
      const key = isValidJSIdentifier(attr.name)
        ? t.identifier(attr.name)
        : t.stringLiteral(attr.name);
      let value;

      if (attr.value === null) {
        // Boolean attribute: disabled -> {disabled: true}
        value = t.booleanLiteral(true);
      } else if (attr.value.type === 'string') {
        // String literal: class="x" -> {class: "x"}
        value = t.stringLiteral(attr.value.value);
      } else if (attr.value.type === 'expression') {
        // Expression: value={x} -> {value: _x((x) => x(), [x])}
        // Mark scope as non-reactive for nested functions (will be wrapped with _x)
        const savedScopeAttr = currentScope;
        currentScope = Object.create(currentScope);
        currentScope[reactiveScope] = false;
        const innerExpr = convertExpression(attr.value.value);
        currentScope = savedScopeAttr;
        value = createReactiveExpr(attr.value.value, innerExpr, true);
      } else {
        // Mark scope as non-reactive for nested functions (will be wrapped with _x)
        const savedScopeAttr = currentScope;
        currentScope = Object.create(currentScope);
        currentScope[reactiveScope] = false;
        const innerExpr = convertExpression(attr.value);
        currentScope = savedScopeAttr;
        value = createReactiveExpr(attr.value, innerExpr, true);
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
