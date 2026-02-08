export const reactiveSymbol = Symbol.for("oddo::is-reactive-handler-property-symbol")

class ReactiveContainer {
  constructor(getter) {
    this[reactiveSymbol] = {
      getter
    }
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

// export const ref = (value) =>
//   new ReactiveContainer((...args) => args.length ? void (value = args[0]) : value)
export const ref = (value) => (...args) => args.length ? void (value = args[0]) : value

export const state = (state) => {
  const { subscribe, notify } = observable()
  return [
    new ReactiveContainer(caller => (caller && subscribe(caller), state)),
    value => value !== state && (state = value, notify())
  ]
}

export const bindDependencies = (deps, cleanup) =>
  deps.map(dep => dep?.[reactiveSymbol]?.getter?.bind(null, cleanup) ?? (() => dep))

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

export const effect2 = (fn, deps, run = true) => {
  const effect = () => fn(...deps)
  deps = bindDependencies(deps, schedule.bind(null, effect))
  run && effect()
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
		dirty = update // TODO: is this correct?
		return target = Object.assign(target.constructor(), target)
	}
};

const mutateSymbol = Symbol()
const noop = () => { }
const splice = Array.prototype.splice
export const arraySplice = (target, ...args) =>
  (args.length && splice.apply(target[mutateSymbol]?.() ?? target, args), target)

export const stateProxy = (target, mutable, notifyParent) => {
  if (target && typeof target === "object") {
    const mutate = copyOnWrite(target)
    const children = new Map()
    return new Proxy(noop, {
      apply () {
        return target = mutate(mutable)
      },
      deleteProperty (_, key) {
  			if (record.hasOwnProperty(key)) {
   				target = mutate()
  				delete target[key]
          delete children[key]
          children.has(key) && children.delete(key)
          mutable || notifyParent?.(target)
  			}
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
      get(_, key) {
        if (mutateSymbol === key) {
          return () => target = mutate()
        } else if (!children.has(key)) {
          const propertyValue = Reflect.get(target, key, target)
          const value = (!target.hasOwnProperty(key) && typeof propertyValue === "function") ? propertyValue.bind(target) : propertyValue
          children.set(key, stateProxy(value, mutable, (value) => {
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

export const createAccessor = (target) => {
  if (target && typeof target === "object") {
    const children = new Map()
    return new Proxy(noop, {
      apply () {
        return target
      },
      deleteProperty () {},
      set () {
        return false
      },
      get (_, key) {
        if (!children.has(key)) {
          const propertyValue = Reflect.get(target, key, target)
          const value = (!target.hasOwnProperty(key) && typeof propertyValue === "function") ? propertyValue.bind(target) : propertyValue
          children.set(key, createAccessor(value?.[reactiveSymbol]?.getter() ?? value))
        }
        return children.get(key)
      }
    })
  }
  return target
}

const liftValue = arg => arg?.[reactiveSymbol]?.getter() ?? arg
const empty = Object.freeze([])

export const mutate = (mutator, targets, otherValues = empty) => {
  otherValues = bindDependencies(otherValues)
  return (...args) => {
    const stateProxies = targets.map(state => stateProxy(state[reactiveSymbol].getter()))
    mutator(...stateProxies, ...otherValues, ...args.map(liftValue))
  }
}

export const transact = (mutator, finalizer, targets, otherValues = empty) => {
  otherValues = bindDependencies(otherValues)
  return (...args) => {
    const stateProxies = targets.map(state => stateProxy(state[reactiveSymbol].getter())) // we also need to include mutable (LET) variables here
    mutator(finalizer, ...stateProxies, ...otherValues, ...args.map(liftValue))
  }
}

export const lift = (fn, deps) => fn(...bindDependencies(deps))
export const liftFn = (callbackFn, deps = empty) => (...args) =>
  callbackFn(...deps.map(liftValue), ...args.map(liftValue))
