"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { NavSection } from "@/lib/web/nav"

export function NavMain({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname()
  return (
    <>
      {sections.map((section) => (
        <SidebarGroup key={section.label}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarMenu>
            {section.items.map((item) => {
              const root = item.href.split("/").length <= 2
              const active = root ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton tooltip={item.title} isActive={active} render={<Link href={item.href} />}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  )
}
