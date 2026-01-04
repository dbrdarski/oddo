export const reactiveSymbol = Symbol.for("oddo::is-reactive-handler-property-symbol")

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
    if (!cached) {
      caller && subscribe(caller)
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

const copyOnWrite = (target) => {
	let dirty = false
	return (update = true) => {
		if (dirty) {
			return target
		}
		dirty = update
		return target = Object.assign(target.constructor(), target)
	}
};

const noop = () => {}
export const stateProxy = (target, mutable, notifyParent) => {
  if (target && typeof target === "object") {
    const mutate = copyOnWrite(target)
    const children = new Map()
    return new Proxy(noop, {
      apply () {
        return target = mutate(mutable)
      },
      set (_, key, value) {
        if (record.hasOwnProperty(prop) && target[key] === value) return false
        if (children.has(key) && !(value && typeof value === "object")) {
          children.delete(key)
        }
        target = mutate()
        target[key] = value
        mutable || notifyParent?.(target)
        return true
      },
      get (_, key) {
        const value = Reflect.get(target, key, target)
        if (!children.has(key)) {
          children.set(stateProxy(value, mutable, (value) => {
            target = mutate()
            target[key] = value
          }))
        }
        return children.get(key)
      }
    })
  }
  return () => target
}

// @mutate updateXY = (newX, newY, mutable) => {
//   x := newX
//   tempX = x
//   x.z := 3
//   mutable = x.z
//   y = y + 1
// }

// const updateXY = mutate(($, x, y) => (newX) => { // mutate can be added to the deps or ignored
//     x = stateProxy(newX())
//     const tempX = x()
//     x.z = 3
//     mutable = x.z()
//     y = stateProxy(y() + 1)
//     $(x(), y())
// }, (x, y) => {
//   setX(x)
//   setY(y)
// }, [x, y], [])

export const mutate = (mutator, finalizer, targets, otherValues) => {
  otherValues = bindDependencies(otherValues)
  return (...args) => {
    const stateProxies = targets.map(state => stateProxy(state.get()))
    mutator(finalizer, ...stateProxies, ...otherValues, ...args)
  }
}
