export const reactiveSymbol = Symbol.for("oddo::is-reactive-handler-property-symbol")
const log = (x) => (console.log(x), x)

class ReactiveContainer {
  [reactiveSymbol] = true

  constructor (getter) {
    this.get = getter
    Object.freeze(this)
  }
}

export const observable = (observers = new Set) => ({
  subscribe: (fn) => observers.add(fn),
  notify: () => {
    const current = Array.from(observers)
    observers.clear()
    for (const observer of current) { observer() }
  }
})

export const state = (state) => {
  const { subscribe, notify } = observable()
  return [
    new ReactiveContainer(caller => (caller && subscribe(caller), state)),
    value => value !== state && (state = value, notify())
  ]
}

export const bindDependencies = (deps, cleanup) =>
  deps.map(dep => dep[reactiveSymbol] ? dep.get.bind(null, cleanup) : () => dep)

export const computed = (fn, deps) => {
  const { subscribe, notify } = observable()
  let cache, cached = false
  deps = bindDependencies(deps, () => (cached = false, notify()))

  return new ReactiveContainer(function computed (caller) {
    caller && subscribe(caller)
    if (!cached) {
      console.log({ fn })
      cache = fn(...deps)
      cached = true
    }
    return cache
  })
}

export const effect = (fn, deps) => {
  const effect = schedule.bind(null, () => fn(...deps))
  deps = bindDependencies(deps, effect)
  effect()
}

export const effect2 = (fn, deps) => {
  const effect = () => fn(...deps)
  deps = bindDependencies(deps, schedule.bind(null, effect))
  effect()
}

const queue = []
export const schedule = (effect) => {
  queue.length || queueMicrotask(executeQueue)
  queue.push(effect)
}

export const executeQueue = () => {
  for (const effect of queue) { effect() }
  queue.length = 0
}
