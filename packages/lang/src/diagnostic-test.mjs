/**
 * Diagnostic Test - Compiles Oddo scenarios and prints JavaScript output
 * Run with: node src/diagnostic-test.mjs
 */

import { compileOddoToJS } from './index.mjs';

function printScenario(name, oddoCode) {
  console.log('='.repeat(60));
  console.log(`SCENARIO: ${name}`);
  console.log('-'.repeat(60));
  console.log('ODDO:');
  console.log(oddoCode);
  console.log('-'.repeat(60));
  console.log('COMPILED JS:');
  try {
    const js = compileOddoToJS(oddoCode);
    console.log(js);
  } catch (error) {
    console.log(`ERROR: ${error.message}`);
  }
  console.log('');
}

console.log('\n' + '='.repeat(60));
console.log('PART 1: STANDALONE SCENARIOS');
console.log('='.repeat(60) + '\n');

// 1. @state
printScenario('1. @state', `@state count = 0`);

// 2. @computed
printScenario('2. @computed', `@state count = 0
@computed doubled = count * 2`);

// 3. @effect
printScenario('3. @effect', `@state count = 0
@effect () => { console.log(count) }`);

// 4. @mutate
printScenario('4. @mutate', `@state count = 0
@mutate increment = () => { count := count + 1 }`);

// 5. @mutable
printScenario('5. @mutable', `@state count = 0
@mutable temp = count + 1`);

// 6. Regular variable WITH reactive deps
printScenario('6. Regular variable WITH reactive deps', `@state count = 0
doubled = count * 2`);

// 7. Regular variable WITHOUT reactive deps
printScenario('7. Regular variable WITHOUT reactive deps', `x = 5`);

// 8. Callback function WITHOUT reactive deps
printScenario('8. Callback function WITHOUT reactive deps', `fn = (a, b) => a + b`);

// 9. Callback function WITH reactive deps
printScenario('9. Callback function WITH reactive deps', `@state count = 0
fn = (a) => a + count`);

console.log('\n' + '='.repeat(60));
console.log('PART 2: SAME SCENARIOS WRAPPED IN @component');
console.log('='.repeat(60) + '\n');

// 1. @state in component
printScenario('1. @state in @component', `@component Component = () => {
  @state count = 0
  return null
}`);

// 2. @computed in component
printScenario('2. @computed in @component', `@component Component = () => {
  @state count = 0
  @computed doubled = count * 2
  return null
}`);

// 3. @effect in component
printScenario('3. @effect in @component', `@component Component = () => {
  @state count = 0
  @effect () => { console.log(count) }
  return null
}`);

// 4. @mutate in component
printScenario('4. @mutate in @component', `@component Component = () => {
  @state count = 0
  @mutate increment = () => { count := count + 1 }
  return null
}`);

// 5. @mutable in component
printScenario('5. @mutable in @component', `@component Component = () => {
  @state count = 0
  @mutable temp = count + 1
  return null
}`);

// 6. Regular variable WITH reactive deps in component
printScenario('6. Regular variable WITH reactive deps in @component', `@component Component = () => {
  @state count = 0
  doubled = count * 2
  return null
}`);

// 7. Regular variable WITHOUT reactive deps in component
printScenario('7. Regular variable WITHOUT reactive deps in @component', `@component Component = () => {
  x = 5
  return null
}`);

// 8. Callback function WITHOUT reactive deps in component
printScenario('8. Callback function WITHOUT reactive deps in @component', `@component Component = () => {
  fn = (a, b) => a + b
  return null
}`);

// 9. Callback function WITH reactive deps in component
printScenario('9. Callback function WITH reactive deps in @component', `@component Component = () => {
  @state count = 0
  fn = (a) => a + count
  return null
}`);

console.log('\n' + '='.repeat(60));
console.log('PART 3: @component AND @hook MODIFIERS');
console.log('='.repeat(60) + '\n');

// 1. Basic @component
printScenario('1. Basic @component', `@component Counter = () => {
  @state count = 0
  return count
}`);

// 2. @component with params (params are reactive)
printScenario('2. @component with reactive params', `@component Counter = (initialCount) => {
  @state count = initialCount
  doubled = count * 2
  return doubled
}`);

// 3. @component with all modifiers inside
printScenario('3. @component with all modifiers', `@component Counter = (initial) => {
  @state count = initial
  @computed doubled = count * 2
  @effect () => { console.log(count) }
  @mutate increment = () => { count := count + 1 }
  return doubled
}`);

// 4. Basic @hook
printScenario('4. Basic @hook', `@hook useCounter = () => {
  @state count = 0
  @mutate increment = () => { count := count + 1 }
  return [count, increment]
}`);

// 5. @hook with reactive params
printScenario('5. @hook with reactive params', `@hook useCounter = (initial) => {
  @state count = initial
  @computed doubled = count * 2
  return [count, doubled]
}`);

console.log('='.repeat(60));
console.log('DIAGNOSTIC COMPLETE');
console.log('='.repeat(60));

