// @oddo/router - Client-side router for Oddo applications
import { Router as UrlRouter } from "url-router"
import { e, computed, state, render } from "@oddo/ui"

// The first implementation is a very simple router that doesn't even support nested routes.

// let routerInstance = null
let navigate = null

export const Router = (props) => {
    const router = new UrlRouter(props.routes)
    const initialRoute = router.find(window.location.pathname + window.location.search)
    const [currentRoute, setCurrentRoute] = state(initialRoute)

    navigate = (href) => {
        const route = router.find(href)
        setCurrentRoute(route)
        window.history.pushState({}, "", href)
    }
    return currentRoute
}

export const A = (props, ...children) => e("a", computed((props) => ({ 
    ...props,
    onclick: (e) => {
        e.preventDefault()
        props.onclick?.(e)
        navigate(props.href)
    }
}), [props]), ...children)

