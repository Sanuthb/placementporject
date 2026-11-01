"use client"

import * as React from "react"

/** Registers the service worker so browsers offer "Install app". Renders nothing. */
export function PwaRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {})
  }, [])
  return null
}
