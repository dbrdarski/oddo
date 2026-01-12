import { patchAttributes } from "./attrs.mjs"
import { observable, reactiveSymbol, effect2, computed } from "./reactive.mjs"

const emptyObject = {}

let currentContext = null
const cleanupContext = (parent) => {
  const { subscribe, notify: disposeChildren} = observable()
  const { subscribe: onCleanup, notify: runCleanup} = observable()
  const dispose = () => (runCleanup(), disposeChildren())
  parent?.(dispose)

  return { onCleanup, dispose, subscribe }
}

export const createJsxExpression = (fn, deps) => (parent) => {
  let patch
  let dispose
  let subscribe

  effect2(
    (vdom) => {
      dispose?.()
      const content = vdom();
      ({ dispose, subscribe } = typeof vdom === "function" ? cleanupContext(currentContext) : emptyObject)
      const prevContext = currentContext
      currentContext = subscribe
      patch = render(content)(parent, patch)
      currentContext = prevContext
    },
    [computed(fn, deps)]
  )
}

export const createFragment = (...children) => (parent, oldNodeCleanup) => {
  const node = new DocumentFragment
  const startNode = document.createComment("<")
  const endNode = document.createComment(">")
  node.appendChild(startNode)
  for (const child of children) {
    render(child)(node)
  }
  node.appendChild(endNode)
  oldNodeCleanup ? oldNodeCleanup(parent, node) : parent.appendChild(node)

  return (parent, newElement) => {
    const range = document.createRange()
    range.setStart(startNode, 1)
    range.setEnd(endNode, 0)
    range.deleteContents()
    parent.replaceChild(newElement, startNode)
  }
}

export const createElement = (tag, attrs, ...children) => (parent, oldNodeCleanup) => {
  const node = document.createElement(tag)
  attrs?.[reactiveSymbol]
    ? effect2((attrs) => attrs = patchAttributes(node, attrs()), [attrs])
    : patchAttributes(node, attrs)

  for (const child of children) {
    render(child)(node)
  }
  oldNodeCleanup ? oldNodeCleanup(parent, node) : parent.appendChild(node)

  return (parent, newElement) => {
    parent.replaceChild(newElement, node)
  }
}

export const createComponent = (component, props, ...children) => (parent, oldNodeCleanup) => {
  const initializers = []
  const { dispose, subscribe, onCleanup } = cleanupContext(currentContext)
  const prevContext = currentContext
  currentContext = subscribe
  const expressionOrVdom = component.call({ onCleanup, onMount: fn => initializers.push(fn) }, { props, children })
  const nodeCleanup = render(expressionOrVdom)(parent, oldNodeCleanup)
  currentContext = prevContext

  for (const initializer of initializers) { initializer() }

  return (parent, newElement) => {
    dispose()
    nodeCleanup(parent, newElement)
  }
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

export const createNullElement = () => (parent, oldNodeCleanup) => {
  const node = document.createComment("|")
  oldNodeCleanup ? oldNodeCleanup(parent, node) : parent.appendChild(node)

  return (parent, newElement) => {
    parent.replaceChild(newElement, node)
  }
}

export const createTextElement = (text) => (parent, oldNodeCleanup) => {
  const node = document.createTextNode(text)
  oldNodeCleanup ? oldNodeCleanup(parent, node) : parent.appendChild(node)

  return (parent, newElement) => {
    parent.replaceChild(newElement, node)
  }
}

export const mount = (root, jsx) => {
  render(jsx)(root)
}
