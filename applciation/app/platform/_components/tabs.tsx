"use client"

import * as React from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

/**
 * The tab bar used inside platform pages: a flat row with a navy underline under the active tab and an icon in front of each label.
 * It reuses the shared tab primitives (so keyboard and screen-reader behaviour is unchanged) and only restyles them, for this portal only.
 */
export function PlatformTabList({ className, ...props }: React.ComponentProps<typeof TabsList>) {
  return <TabsList variant="line" className={cn("group-data-horizontal/tabs:h-auto h-auto w-full justify-start gap-1 overflow-y-hidden rounded-none border-b bg-transparent p-0 sm:gap-2", className)} {...props} />
}

export function PlatformTab({ icon: Icon, children, className, ...props }: React.ComponentProps<typeof TabsTrigger> & { icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <TabsTrigger
      className={cn(
        "h-auto flex-none gap-2 rounded-none border-0 bg-transparent px-3 py-3 text-sm font-medium text-muted-foreground shadow-none hover:text-foreground",
        "data-active:bg-transparent data-active:text-primary data-active:shadow-none",
        "group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-0.5 after:bg-primary data-active:after:opacity-100",
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="size-4" /> : null}
      {children}
    </TabsTrigger>
  )
}
