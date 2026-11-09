"use client"

import * as React from "react"

import { supabase } from "@/lib/supabase/browser"
import { ApiClientError, api } from "@/lib/web/api"

export type Kind = "staff" | "student" | "recruiter"
export type Profile = { kind: Kind; name: string; email: string; role?: string; /** Every role, main one first (staff). */ roles: string[]; modules: string[]; /** Two-step sign-in state for administrators. */ mfa?: string }

export const hasRole = (p: Pick<Profile, "roles">, ...r: string[]) => r.some((x) => p.roles.includes(x))
/** A coordinator who is also an officer or admin is not limited to one department. */
export const isCoordinatorOnly = (p: Pick<Profile, "roles">) => p.roles.includes("DEPARTMENT_COORDINATOR") && !hasRole(p, "TPO_ADMIN", "PLACEMENT_OFFICER")
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
      const me = await api<{ name?: string; email?: string; role?: string; roles?: string[]; modules?: string[]; mfa?: string }>(path)
      return { kind, name: me.name ?? me.email ?? "", email: me.email ?? "", role: me.role, roles: me.roles ?? (me.role ? [me.role] : []), modules: me.modules ?? [], mfa: me.mfa }
    } catch (e) {
      if (e instanceof ApiClientError && (e.status === 401 || e.status === 403)) continue
      throw e
    }
  }
  return null
}

/** Tells the server about this sign-in once per session, for the sign-in history. Failure is harmless. */
async function recordLogin() {
  try {
    const { data } = await supabase().auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    const sid = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).session_id as string | undefined
    if (!sid || sessionStorage.getItem("login-recorded") === sid) return
    const r = await fetch("/api/auth/login-event", { method: "POST", headers: { authorization: `Bearer ${token}` } })
    if (r.ok) sessionStorage.setItem("login-recorded", sid)
  } catch { /* the history is a convenience; never block sign-in on it */ }
}

const Ctx = React.createContext<{ state: State; signOut: () => Promise<void>; refresh: () => Promise<void> } | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>({ status: "loading" })
  const userId = React.useRef<string | null | undefined>(undefined) // undefined = not checked yet

  const load = React.useCallback(async () => {
    try {
      const profile = await resolveProfile()
      // Administrators finish two-step sign-in (or set it up) before anything else loads.
      if (profile?.kind === "staff" && (profile.mfa === "challenge" || profile.mfa === "setup_required") && !window.location.pathname.startsWith("/mfa")) {
        window.location.replace(`/mfa?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      setState(profile ? { status: "ready", profile } : { status: "noaccess" })
      if (profile && profile.mfa !== "challenge") void recordLogin()
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
