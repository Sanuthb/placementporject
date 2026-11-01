"use client"

import * as React from "react"

import { supabase } from "@/lib/supabase/browser"
import { ApiClientError, api } from "@/lib/web/api"

export type Kind = "staff" | "student" | "recruiter"
export type Profile = { kind: Kind; name: string; email: string; role?: string; modules: string[] }
type State =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "noaccess" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: Profile }

const ENDPOINTS: { kind: Kind; path: string }[] = [
  { kind: "staff", path: "/api/me" },
  { kind: "student", path: "/api/student/me" },
  { kind: "recruiter", path: "/api/recruiter/me" },
]

export const homeFor = (kind: Kind) => `/${kind}`

/** Finds out which kind of login this is by asking each "me" endpoint; a token for one kind is refused by the others. */
async function resolveProfile(): Promise<Profile | null> {
  for (const { kind, path } of ENDPOINTS) {
    try {
      const me = await api<{ name?: string; email?: string; role?: string; modules?: string[] }>(path)
      return { kind, name: me.name ?? me.email ?? "", email: me.email ?? "", role: me.role, modules: me.modules ?? [] }
    } catch (e) {
      if (e instanceof ApiClientError && (e.status === 401 || e.status === 403)) continue
      throw e
    }
  }
  return null
}

const Ctx = React.createContext<{ state: State; signOut: () => Promise<void>; refresh: () => Promise<void> } | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>({ status: "loading" })
  const userId = React.useRef<string | null | undefined>(undefined) // undefined = not checked yet

  const load = React.useCallback(async () => {
    try {
      const profile = await resolveProfile()
      setState(profile ? { status: "ready", profile } : { status: "noaccess" })
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Could not load your account" })
    }
  }, [])

  React.useEffect(() => {
    const sb = supabase()
    const apply = (id: string | null) => {
      if (id === userId.current) return
      userId.current = id
      if (!id) setState({ status: "anon" })
      else { setState({ status: "loading" }); void load() }
    }
    void sb.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null))
    const { data } = sb.auth.onAuthStateChange((_event, session) => apply(session?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [load])

  const signOut = React.useCallback(async () => { await supabase().auth.signOut() }, [])
  const value = React.useMemo(() => ({ state, signOut, refresh: load }), [state, signOut, load])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useAuth must be used inside AuthProvider")
  return v
}
