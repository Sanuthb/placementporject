import * as React from "react"

/** The heading every platform page starts with: a title, one line saying what the page is for, and the page's main actions on the right. */
export function PageHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** A bordered, scrollable box for a table, so every table on mobile scrolls sideways inside its card instead of breaking the page. */
export function TableBox({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">{children}</div>
}

/** What a list shows when there is nothing to list. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{children}</div>
}
