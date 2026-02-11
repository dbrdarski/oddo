import { createFragment as f, createJsxExpression as x, mount } from "../framework/dom.mjs"
import { liftFn } from "../framework/reactive.mjs"

const Portal = function ({ props: { to }, children }) {
  const container = document.createElement("div")
  container.style.cssText = "position: fixed; top: 0; left: 0; z-index: 9999;"
  this.onMount(liftFn((to, children) => {
    (to ?? document.body).appendChild(container)
    mount(container, f(x(() => children, [])))
  }, [to, children]))
  this.onCleanup(() => {
    container.remove()
  })
  return null
}

export default Portal
