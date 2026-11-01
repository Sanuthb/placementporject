"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

/** The browser's Supabase client. It only ever holds the public anon key; the API enforces everything else. */
export function supabase(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set")
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}
