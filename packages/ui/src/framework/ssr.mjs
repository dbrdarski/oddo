import { lift, reactiveSymbol, computed, createAccessor } from "./reactive.mjs";
import { createAttributes } from "./attrs.mjs";

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"])

const noop = () => {}
const escapeHtml = unsafe => String(unsafe).replace(/[&<>"']/g, (m) => escapeMap[m])

export const createJsxExpression = (fn, deps) => () =>
  lift((vdom) => render(vdom()), [computed(fn, deps)])

export const createFragment = (...children) => () =>
  `<!--[-->${children.map(render).join("")}<!--]-->`

export const createElement = (tag, attrs, ...children) => () =>
  `<${tag}${attrs?.[reactiveSymbol]
    ? lift((attrs) => createAttributes(attrs()), [attrs])
    : createAttributes(attrs)
  }${voidElements.has(tag) ? " />" : `>${children.map(render).join("")}</${tag}>`}`

export const createComponent = (component, attrs, ...children) => () => {
  // const initializers = []
  const props = createAccessor(attrs)
  const expressionOrVdom = component.call({ onCleanup: noop, onMount: noop /* fn => initializers.push(fn) */ }, { props, children })
  return render(expressionOrVdom)
}

export const render = vdom => {
  if (Array.isArray(vdom)) return render(createFragment(...vdom))
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
