"use client"

import * as React from "react"
import { GraduationCapIcon } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import type { Profile } from "@/lib/web/auth"
import { KIND_LABEL, visibleNav } from "@/lib/web/nav"

export function AppSidebar({ profile, ...props }: { profile: Profile } & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GraduationCapIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Placement</span>
                <span className="truncate text-xs">{KIND_LABEL[profile.kind]}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain sections={visibleNav(profile.kind, profile.modules, profile.role)} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={profile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
