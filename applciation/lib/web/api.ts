"use client"

import { toast } from "sonner"

import { supabase } from "@/lib/supabase/browser"

/** An error response from the backend: `{ error: { code, message, details?, requestId } }`. */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  signal?: AbortSignal
}

async function send(path: string, { method = "GET", body, query, signal }: Options) {
  const { data } = await supabase().auth.getSession()
  const headers: Record<string, string> = {}
  if (data.session) headers.authorization = `Bearer ${data.session.access_token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers["content-type"] = "application/json"
    payload = JSON.stringify(body)
  }
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v))
  const url = qs.size ? `${path}?${qs}` : path

  const res = await fetch(url, { method, headers, body: payload, signal })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    const e = json?.error
    throw new ApiClientError(res.status, e?.code ?? "ERROR", e?.message ?? `Request failed (${res.status})`, e?.requestId ?? res.headers.get("x-request-id") ?? undefined, e?.details)
  }
  return res
}

/** Calls a JSON endpoint and returns its `data`. */
export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const res = await send(path, options)
  if (res.status === 204) return undefined as T
  return ((await res.json()) as { data: T }).data
}

/** Downloads a file endpoint (Excel / PDF) and saves it with the server's file name. */
export async function download(path: string, options: Options = {}) {
  const res = await send(path, options)
  const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "download"
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** One way to show any failure: a toast with the message and the request id support can search for. */
export function toastError(e: unknown) {
  if (e instanceof ApiClientError) toast.error(e.message, { description: e.requestId ? `Reference: ${e.requestId}` : undefined })
  else toast.error(e instanceof Error ? e.message : "Something went wrong")
}
