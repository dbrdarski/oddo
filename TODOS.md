# TODOS

## LANGUAGE/FRAMEWORK FEATURES

- implement @mutable modifier (ok)
- implement lift (ok)
- add lift to consts (escape reactive) (ok)
- fix mutate arguments (need to be lifted!) (ok)
- implement @callback modifier (not needed)
- implement ref attrs (ok)
- implement router (ok - initial)
- fix component props for reactivity (Proxy) - (partial fix, but not sure if all correct)
- implement stores 

## HELPERS

- add syntax highlighting (for web (ok), for VS code (not yet), for Zed (not yet))
- add AI library to explain how to use the language properly to AI agents
- performance tests for the framework
- performance tests for the language parser

## SSR & HYDRATION

- implement SSR (ok)
- implement hydration (ok)

## BUGFIXES

- atts-minus => "attrs-minus": (ok)
- remove trimming on JSX text (ok)
- fix SSR issue
- add Regexes
- Avoided destructuring in .map() callbacks (compiler bug) (not sure)
- Used direct property access: x.data.name instead of { data: { name } } (not sure)
- SSR createFragment children.map() issue (ok)

## SECOND PHASE FEATURES

- update when (for early termination) 
- partial application
- pattern matching
- pending state (for Suspense) and error state (for Error Boundry)
- Error Boundry
- Suspense
- Portal
- ...
