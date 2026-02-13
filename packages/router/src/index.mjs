// @oddo/router - Client-side router for Oddo applications
// This is the initial basic implementation or router. It doesn't even support nested routes.

import * as urlRouterModule from "url-router"
import { createElement, createJsxExpression, computed, state, lift, liftFn } from "@oddo/ui"

const UrlRouter = urlRouterModule.default || urlRouterModule

let ssrPath = null
export const withSSR = (app) => (path) => {
  ssrPath = path
  const result = app()
  ssrPath = null
  return result
}

let navigate = null

export const Router = ({ props: { routes, ...props } }) => {
  const router = computed(routes => new UrlRouter(routes()), [routes])
  const isSSR = typeof window === "undefined"
  const url = isSSR ? ssrPath : window.location.pathname + window.location.search
  const initialRoute = lift(router => router().find(url), [router])
  const [currentRoute, setCurrentRoute] = state(initialRoute)

  if (!isSSR) {
    window.history.replaceState({ href: url }, "", url)

    navigate = liftFn((router, href) => {
      const route = router.find(href)
      setCurrentRoute(route)
    }, [router])

    window.addEventListener('popstate', (event) => {
      if (event.state?.href) {
        navigate(event.state.href)
      }
    })
  }

  return createJsxExpression(currentRoute => currentRoute()?.handler, [currentRoute])
}

const push = (href) => {
  navigate(href)
  window.history.pushState({ href }, "", href)
}

const replace = (href) => {
  navigate(href)
  window.history.replaceState({ href }, "", href)
}

export const navigation = Object.freeze({
  push,
  replace
})

export const A = ({ props, children }) => createElement("a", computed((props) => ({
  ...props(),
  onclick: (e) => {
    e.preventDefault()
    props().onclick?.(e)
    push(props().href)
  }
}), [props]), ...children)
