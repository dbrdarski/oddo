export {
  ref,
  state,
  computed,
  transact as mutate,
  transact,
  stateProxy,
  lift,
  liftFn,
  // liftValue,
  arraySplice
} from "./framework/reactive.mjs"

export const effect = () => {}
export const mount = () => {}
export const hydrate = () => {}
export const Portal = () => {}

export {
  createElement,
  createElement as e,
  createComponent,
  createComponent as c,
  createFragment,
  createFragment as f,
  createJsxExpression,
  createJsxExpression as x,
  render
} from "./framework/ssr.mjs";
