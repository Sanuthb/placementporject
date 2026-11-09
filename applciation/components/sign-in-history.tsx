"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; createdAt: string; method: string | null; mfa: boolean; ip: string | null; userAgent: string | null }

/** "Chrome on Windows" from a user-agent string. Good enough to recognise your own devices. */
export function deviceOf(ua: string | null) {
  if (!ua) return "Unknown device"
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown system"
  return `${browser} on ${os}`
}

export function SignInHistory({ path }: { path: string | null }) {
  const { data, loading } = useApi<{ items: Row[] }>(path)
  if (loading && !data) return <Skeleton className="h-32" />
  if (!data?.items.length) return <p className="text-sm text-muted-foreground">No sign-ins recorded yet. Sign-ins are recorded from the day this feature was switched on.</p>
  return (
    <div className="max-h-80 overflow-auto rounded-lg border">
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Method</TableHead><TableHead>Device</TableHead><TableHead>Address</TableHead></TableRow></TableHeader>
        <TableBody>{data.items.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</TableCell>
            <TableCell>{r.method ? titleCase(r.method) : "—"}{r.mfa && <Badge variant="secondary" className="ml-1.5">2-step</Badge>}</TableCell>
            <TableCell>{deviceOf(r.userAgent)}</TableCell>
            <TableCell className="tabular-nums text-muted-foreground">{r.ip ?? "—"}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  )
}
