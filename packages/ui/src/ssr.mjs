import { lift, reactiveSymbol, computed } from "./reactive.mjs";
import { createAttributes } from "./attrs.mjs";

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

const noop = () => {}
const escapeHtml = unsafe => unsafe.replace(/[&<>"']/g, (m) => escapeMap[m])

export const createJsxExpression = (fn, deps) => () =>
  lift((vdom) => render(vdom()), [computed(fn, deps)])

export const createFragment = (...children) => () =>
  `<!--<-->${children.map(render).join("")}<!-->-->`

export const createElement = (tag, attrs, ...children) => () =>
  `<${tag}${attrs?.[reactiveSymbol]
    ? lift((attrs) => createAttributes(attrs()), [attrs])
    : createAttributes(attrs)
  }>${children.map(render).join("")}</${tag}>`

export const createComponent = (component, props, ...children) => () => {
  // const initializers = []
  const expressionOrVdom = component.call({ onCleanup: noop, onMount: noop /* fn => initializers.push(fn) */ }, { props, children })
  return render(expressionOrVdom)
}

export const render = vdom => {
  if (Array.isArray(vdom)) return createFragment(...vdom)
  switch (vdom) {
    case true:
    case false:
    case null:
    case undefined:
      return createNullElement()
  }

  switch (typeof vdom) {
    case "string":
    case "number":
      return createTextElement(vdom)
    case "function":
      return vdom()
  }
}

export const createNullElement = () => "<!--|-->"
export const createTextElement = (text) => `<!--T-->${escapeHtml(text)}`
