import { reactiveSymbol, effect2, lift } from "./reactive.mjs"

const htmlEventHandlers = [
  "onpointerdown", "onpointerup", "onpointermove", "onpointerover", "onpointerout", "onpointerenter", "onpointerleave", "onpointercancel", "ongotpointercapture", "onlostpointercapture", "onclick", "ondblclick", "onmousedown", "onmouseup", "onmouseover", "onmouseout", "onmouseenter", "onmouseleave", "onmousemove", "oncontextmenu", "onwheel", "onauxclick", "onkeydown", "onkeyup", "onkeypress", "oninput", "onchange", "onfocus", "onblur", "onfocusin", "onfocusout", "onsubmit", "onreset", "oninvalid", "onsearch", "onselect", "onbeforeinput", "ondrag", "ondragstart", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondrop", "onplay", "onpause", "onplaying", "onended", "onvolumechange", "onwaiting", "onstalled", "onsuspend", "onprogress", "oncanplay", "oncanplaythrough", "onloadeddata", "onloadedmetadata", "onloadstart", "ondurationchange", "onratechange", "onseeked", "onseeking", "onanimationstart", "onanimationend", "onanimationiteration", "ontransitionstart", "ontransitionend", "ontransitionrun", "ontransitioncancel", "onload", "onerror", "onscroll", "onscrollend", "onresize", "ontoggle", "oncopy", "oncut", "onpaste"
];
const htmlEventList = new Set(htmlEventHandlers)

const hydrateAttributes = (element, attrs) => {
  for (const key in attrs) {
    const maybeContainerValue = attrs[key]
    const value = maybeContainerValue?.[reactiveSymbol] ? maybeContainerValue.get() : maybeContainerValue;
    key === "ref" && value(element)
    htmlEventList.has(key) && (element[key] = value)
    value?.[reactiveSymbol] && effect2((value) => setAttribute(element, key, value(), oldValue), [value], false)
  }
}

export const patchAttributes = (element, oldAttrs = {}) => (newAttrs, hydrating = false) => {
  if (hydrating) {
    oldAttrs = newAttrs
    return hydrateAttributes(element, newAttrs)
  }

  for (const key in oldAttrs) {
    if (!(key in newAttrs)) {
      removeAttribute(element, key)
    }
  }

  for (const key in newAttrs) {
    const oldValue = oldAttrs[key]
    const newValue = newAttrs[key]

    if (oldValue !== newValue) {
      newValue?.[reactiveSymbol]
        ? effect2((newValue) => setAttribute(element, key, newValue(), oldValue), [newValue], !hydrating)
        : setAttribute(element, key, newValue, oldValue)
    }
  }
  oldAttrs = newAttrs
}

const setAttribute = (element, key, value, oldValue) => {
  switch (key) {
    case "ref":
      return value(element)
    case "style":
      return typeof value === "string"
        ? element.style = value
        : patchStyle(element, oldValue, value)
    case "value":
      return element.value = value ?? ""
    case "checked":
      return element.checked = !!value
    case "selected":
      return element.selected = !!value
    // case "innerHTML":
    //   return element.innerHTML = value ?? ""
    default:
      if (value == null || value === false) {
        element.removeAttribute(key)
      } else if (key.startsWith("on")) {
        element[key] = value
      } else if (value == true) {
        element.setAttribute(key, "")
      } else {
        element.setAttribute(key, value)
      }
  }
}

const removeAttribute = (element, key) => {
  switch (key) {
    case 'value':
      return element.value = null
    case 'checked':
    case 'selected':
      return element[key] = false
    default:
      return key.startsWith('on')
        ? element[key] = null
        : element.removeAttribute(key)
  }
}

const patchStyle = (element, oldStyle = {}, newStyle = {}) => {
  for (const prop in oldStyle) {
    if (!(prop in newStyle)) {
      element.style[prop] = null; // TODO: Handle reactive
    }
  }
  for (const prop in newStyle) {
    if (oldStyle[prop] !== newStyle[prop]) {
      element.style[prop] = newStyle[prop];
    }
  }
}

export const createAttributes = props => props
  ? Object.entries(props)
    .map(createAttribute)
    .join("")
  : ""


const printAttribute = (key, value) => ` ${key}="${String(value).replaceAll("\"", "\\\"")}"`
const createAttribute = ([key, value]) => (htmlEventList.has(key) || key === "ref") ? "" : value?.[reactiveSymbol]
  ? lift(value => printAttribute(key, value()), [value])
  : printAttribute(key, value)
