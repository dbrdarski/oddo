import { state, computed, effect, e, c, x, f, mount, mutate, transact, stateProxy } from '../packages/ui/dist/index.mjs'

// ========================================
// Example 1: Counter (Reactive State)
// ========================================
const Counter = () => {
  const [count, setCount] = state(0)
  const addToCount = mutate((count, x) => {
    setCount((count = stateProxy(count() + x))())
  }, [count], [])

  const increment = addToCount.bind(null, 1)
  const decrement = addToCount.bind(null, -1)

  return e('div', { class: 'section' },
    e('h2', {}, 'Example 1: Counter (Reactive State)'),
    e('p', { class: 'section-description' }, 'Click the buttons to see reactive state updates'),
    e('div', { class: 'display' },
      e('strong', {}, 'Count: '),
      x((count) => count(), [count]),
    ),
    e('div', { class: 'controls' },
      e('button', { onclick: increment }, '+ Increment'),
      e('button', { onclick: decrement }, '- Decrement'),
      e('button', { class: 'secondary', onclick: () => setCount(0) }, 'Reset')
    )
  )
}

// ========================================
// Example 2: Input Binding (Reactive State)
// ========================================
const InputBinding = () => {
  const [text, setText] = state('')

  return e('div', { class: 'section' },
    e('h2', {}, 'Example 2: Input Binding'),
    e('p', { class: 'section-description' }, 'Type in the input to see reactive updates'),
    e('div', { class: 'form-group' },
      e('label', {}, 'Type something:'),
      e('input', {
        type: 'text',
        value: text,
        oninput: (e) => setText(e.target.value)
      })
    ),
    e('div', { class: 'display' },
      e('strong', {}, 'You typed: '),
      x((text) => text() || '(nothing yet)', [text])
    ),
    e('div', { class: 'display' },
      e('strong', {}, 'Character count: '),
      x(x => x(), [computed((text) => text().length, [text])  ])
    )
  )
}

// ========================================
// Example 3: Computed Values
// ========================================
const ComputedDemo = () => {
  const [firstName, setFirstName] = state('John')
  const [lastName, setLastName] = state('Doe')

  const fullName = computed((firstName, lastName) => {
    const first = firstName()
    const last = lastName()
    return first && last ? `${first} ${last}` : first || last || '(no name)'
  }, [firstName, lastName])

  return e('div', { class: 'section' },
    e('h2', {}, 'Example 3: Computed Values'),
    e('p', { class: 'section-description' }, 'Full name is computed from first + last name'),
    e('div', { class: 'form-group' },
      e('label', {}, 'First Name:'),
      e('input', {
        type: 'text',
        value: firstName,
        oninput: (e) => setFirstName(e.target.value)
      })
    ),
    e('div', { class: 'form-group' },
      e('label', {}, 'Last Name:'),
      e('input', {
        type: 'text',
        value: lastName,
        oninput: (e) => setLastName(e.target.value)
      })
    ),
    e('div', { class: 'display' },
      e('strong', {}, 'Full Name (computed): '),
      x(fullName => fullName(), [fullName])
    )
  )
}

// ========================================
// Example 4: Todo List (Dynamic Lists)
// ========================================
const TodoList = () => {
  const [todos, setTodos] = state([
    { id: 1, text: 'Learn @oddo/ui' },
    { id: 2, text: 'Build something awesome' },
    { id: 3, text: 'Share with the world' }
  ])
  const [newTodo, setNewTodo] = state('')

  let nextId = 4

  const addTodo = () => {
    const text = newTodo.get().trim()
    if (text) {
      setTodos([...todos.get(), { id: nextId++, text }])
      setNewTodo('')
    }
  }

  const removeTodo = (id) => {
    setTodos(todos.get().filter(todo => todo.id !== id))
  }

  return e('div', { class: 'section' },
    e('h2', {}, 'Example 4: Todo List (Dynamic Lists)'),
    e('p', { class: 'section-description' }, 'Add and remove items dynamically'),
    e('div', { class: 'form-group' },
      e('label', {}, 'New Todo:'),
      e('div', { class: 'controls' },
        e('input', {
          type: 'text',
          value: newTodo,
          oninput: (e) => setNewTodo(e.target.value),
          // onkeypress: (e) => e.key === 'Enter' && addTodo()
        }),
        e('button', { onclick: addTodo }, 'Add Todo')
      )
    ),
    e('div', { class: 'display' },
      e('strong', {}, 'Total todos: '),
      x(x => x(), [computed((todos) => todos().length, [todos])])
    ),
    e('ul', { class: 'todo-list' }, x(x => x(), [
      computed(todos => f(...todos().map(todo =>
        e('li', { class: 'todo-item', key: todo.id },
          e('span', { class: 'todo-text' }, todo.text),
          e('button', {
            class: 'danger',
            onclick: () => removeTodo(todo.id)
          }, 'Remove')
        ))
      ), [todos])
    ]))
  )
}

// ========================================
// Example 5: Component Composition
// ========================================

// Reusable Button Component
const Button = ({ props, children }) => {
  return e('button', {
    class: props.variant || 'primary',
    onclick: props.onclick
  }, ...children)
}

// Reusable Card Component
const Card = ({ props, children }) => {
  return e('div', { class: 'section' },
    props.title ? e('h2', {}, props.title) : null,
    props.description ? e('p', { class: 'section-description' }, props.description) : null,
    ...children
  )
}

const ComponentComposition = () => {
  const [clickCount, setClickCount] = state(0)

  return c(Card, {
    title: 'Example 5: Component Composition',
    description: 'Reusable Button and Card components'
  },
    e('div', { class: 'display' },
      e('strong', {}, 'Clicks: '),
      x((clickCount) => clickCount(), [clickCount])
    ),
    e('div', { class: 'controls' },
      c(Button, { onclick: () => setClickCount(clickCount.get() + 1) }, 'Click Me!'),
      c(Button, { variant: 'secondary', onclick: () => setClickCount(clickCount.get() + 5) }, '+5'),
      c(Button, { variant: 'danger', onclick: () => setClickCount(0) }, 'Reset')
    )
  )
}

// ========================================
// Main App - Compose all examples
// ========================================
const App = e('div', {},
  c(Counter),
  c(InputBinding),
  c(ComputedDemo),
  c(TodoList),
  c(ComponentComposition)
)

// Mount the app
const app = document.getElementById('app')

Object.assign(window, {
  state, computed, effect, e, c, x, mount, f
})

if (app) {
  mount(app, App)
} else {
  console.error('Could not find #app element')
}
