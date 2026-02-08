export {
  ref,
  state,
  computed,
  effect,
  transact as mutate,
  transact,
  stateProxy,
  lift,
  liftFn,
  // liftValue,
  arraySplice
} from "./framework/reactive.mjs"

export {
  createElement,
  createElement as e,
  createComponent,
  createComponent as c,
  createFragment,
  createFragment as f,
  createJsxExpression,
  createJsxExpression as x,
  mount,
  hydrate
} from "./framework/dom.mjs";
