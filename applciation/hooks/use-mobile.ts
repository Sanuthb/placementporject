import * as React from "react"

const MOBILE_BREAKPOINT = 768

// An external store (the media query), read with useSyncExternalStore: no setState inside an effect. Same values as before: false on the server and the first render, then follows the window.
const query = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
const subscribe = (onChange: () => void) => {
  const mql = query()
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}
const getSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT
const getServerSnapshot = () => false

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
