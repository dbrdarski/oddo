import { lift, reactiveSymbol } from "./reactive.mjs";

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const htmlEventHandlers = [
  "onpointerdown", "onpointerup", "onpointermove", "onpointerover", "onpointerout", "onpointerenter", "onpointerleave", "onpointercancel", "ongotpointercapture", "onlostpointercapture", "onclick", "ondblclick", "onmousedown", "onmouseup", "onmouseover", "onmouseout", "onmouseenter", "onmouseleave", "onmousemove", "oncontextmenu", "onwheel", "onauxclick", "onkeydown", "onkeyup", "onkeypress", "oninput", "onchange", "onfocus", "onblur", "onfocusin", "onfocusout", "onsubmit", "onreset", "oninvalid", "onsearch", "onselect", "onbeforeinput", "ondrag", "ondragstart", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondrop", "onplay", "onpause", "onplaying", "onended", "onvolumechange", "onwaiting", "onstalled", "onsuspend", "onprogress", "oncanplay", "oncanplaythrough", "onloadeddata", "onloadedmetadata", "onloadstart", "ondurationchange", "onratechange", "onseeked", "onseeking", "onanimationstart", "onanimationend", "onanimationiteration", "ontransitionstart", "ontransitionend", "ontransitionrun", "ontransitioncancel", "onload", "onerror", "onscroll", "onscrollend", "onresize", "ontoggle", "oncopy", "oncut", "onpaste"
];

const escapeHtml = unsafe => unsafe.replace(/[&<>"']/g, (m) => escapeMap[m])

const createAttributes = props => props
  ? Object.entries(props)
    .map(createAttribute)
    .join("")
  : ""

const htmlEventList = new Set(htmlEventHandlers)

const printAttribute = (key, value) => ` ${key}="${value.replaceAll("\"", "\\\"")}"`
const createAttribute = ([key, value]) => htmlEventList.has(key) ? "" : value?.[reactiveSymbol]
  ? lift(value => printAttribute(key, value()), [value])
  : printAttribute(key, value)

export const createJsxExpression = (fn, deps) => (parent) =>
  lift((vdom) => render(vdom())(parent, patch), [computed(fn, deps)])

export const createFragment = (...children) =>
  `<!--<-->${children.map(print).join("")}<!-->-->`

export const createElement = (tag, attrs, ...children) =>
  `<${tag}${attrs?.[reactiveSymbol]
    ? lift((attrs) => createAttributes(attrs()), [attrs])
    : createAttributes(attrs)
  }>${children.map(render).join("")}</${tag}>`

export const createComponent = (component, props, ...children) => {
  // const initializers = []
  const expressionOrVdom = component.call({ onCleanup: noop, onMount: noop /* fn => initializers.push(fn) */ }, { props, children })
  return render(expressionOrVdom)(parent, oldNodeCleanup)
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
      return vdom
  }
}

export const createNullElement = () => "<!--|-->"
export const createTextElement = (text) => `<!--T-->${escapeHtml(text)}`
