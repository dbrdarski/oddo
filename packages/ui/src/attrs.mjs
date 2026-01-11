import { reactiveSymbol, effect2 } from "./reactive.mjs"
export const patchAttributes = (el, newAttrs, oldAttrs = {}) => {
  for (const key in oldAttrs) {
    if (!(key in newAttrs)) {
      removeAttribute(el, key)
    }
  }

  for (const key in newAttrs) {
    const oldValue = oldAttrs[key]
    const newValue = newAttrs[key]

    if (oldValue !== newValue) {
      newValue?.[reactiveSymbol]
        ? effect2((newValue) => setAttribute(el, key, newValue(), oldValue), [newValue])
        : setAttribute(el, key, newValue, oldValue)
    }
  }
}

const setAttribute = (element, key, value, oldValue) => {
  switch (key) {
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
    case "innerHTML":
      return element.innerHTML = value ?? ""
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
      element.style[prop] = null;
    }
  }
  for (const prop in newStyle) {
    if (oldStyle[prop] !== newStyle[prop]) {
      element.style[prop] = newStyle[prop];
    }
  }
}
