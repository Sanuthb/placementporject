"use client"

import * as React from "react"

import { api } from "@/lib/web/api"

type Query = Record<string, string | number | boolean | null | undefined>

/**
 * Loads a GET endpoint. `loading` is true until the current request answers; previous data stays visible while a
 * new one loads. Pass `null` as the path to skip. Call `reload()` after a change.
 */
export function useApi<T>(path: string | null, query?: Query) {
  const [tick, setTick] = React.useState(0)
  const [res, setRes] = React.useState<{ key: string | null; data?: T; error?: unknown }>({ key: null })
  const key = path ? `${tick}|${path}|${JSON.stringify(query ?? {})}` : null

  React.useEffect(() => {
    if (!path || !key) return
    let alive = true
    api<T>(path, { query })
      .then((data) => alive && setRes({ key, data }))
      .catch((error) => alive && setRes((r) => ({ key, data: r.data, error })))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const reload = React.useCallback(() => setTick((t) => t + 1), [])
  return { data: res.data, error: res.key === key ? res.error : undefined, loading: key !== null && res.key !== key, reload }
}
