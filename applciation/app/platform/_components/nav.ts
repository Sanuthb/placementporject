import {
  ActivityIcon, BlocksIcon, BotIcon, MegaphoneIcon, SirenIcon, ShieldAlertIcon, ChartColumnIcon, Building2Icon, KeyRoundIcon, LayoutDashboardIcon, LifeBuoyIcon, PlugIcon, ScrollTextIcon, Settings2Icon, ShieldCheckIcon, UserRoundIcon,
  type LucideIcon,
} from "lucide-react"

export type PlatformNavItem = { href: string; title: string; description: string; icon: LucideIcon }
export type PlatformNavGroup = { label: string; items: PlatformNavItem[] }

/** The one navigation list for the platform portal. Every page is reachable from here; the sidebar and the breadcrumbs both read it. */
export const PLATFORM_NAV: PlatformNavGroup[] = [
  { label: "Overview", items: [{ href: "/platform", title: "Dashboard", description: "Platform-wide summary", icon: LayoutDashboardIcon }] },
  { label: "Institutions", items: [{ href: "/platform/institutions", title: "Institution Directory", description: "Create, review, switch on or off and edit institutions", icon: Building2Icon }] },
  {
    label: "Platform management",
    items: [
      { href: "/platform/modules", title: "Module Management", description: "Which parts of the platform are available", icon: BlocksIcon },
      { href: "/platform/announcements", title: "Announcements", description: "Notices for institutions", icon: MegaphoneIcon },
    ],
  },
  { label: "Analytics", items: [{ href: "/platform/analytics", title: "Platform Analytics", description: "Growth, activity and institution comparison", icon: ChartColumnIcon }] },
  {
    label: "Operations",
    items: [
      { href: "/platform/monitoring", title: "System Health", description: "Service checks, background jobs and application errors", icon: ActivityIcon },
      { href: "/platform/incidents", title: "Incidents", description: "Outages and degradations, with their timelines", icon: SirenIcon },
    ],
  },
  { label: "AI Centre", items: [{ href: "/platform/ai", title: "AI Centre", description: "Providers, models, usage and limits", icon: BotIcon }] },
  { label: "Integrations", items: [{ href: "/platform/integrations", title: "Integration Status", description: "State of the services the platform uses", icon: PlugIcon }] },
  { label: "Support", items: [{ href: "/platform/support", title: "Support Requests", description: "Requests from institution administrators", icon: LifeBuoyIcon }] },
  {
    label: "Security",
    items: [
      { href: "/platform/security", title: "Security Centre", description: "Two-step sign-in and reviewed security events", icon: ShieldAlertIcon },
      { href: "/platform/access", title: "Roles and Access", description: "Roles, administrators and the technical permission matrix", icon: KeyRoundIcon },
      { href: "/platform/audit", title: "Audit Logs", description: "Record of administrator actions", icon: ScrollTextIcon },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/platform/system", title: "System Configuration", description: "Settings in effect (read-only)", icon: Settings2Icon },
      { href: "/platform/policy", title: "Security and Retention", description: "Two-step rule and data retention", icon: ShieldCheckIcon },
    ],
  },
  { label: "Account", items: [{ href: "/platform/account", title: "Administrator Account", description: "Your profile and two-step sign-in", icon: UserRoundIcon }] },
]

const ALL = PLATFORM_NAV.flatMap((g) => g.items)

/** Breadcrumb trail for a path: Platform, then the section, then (for an institution) its name or sub-page. */
export function crumbsFor(pathname: string): { href?: string; title: string }[] {
  if (pathname === "/platform") return [{ title: "Dashboard" }]
  const top = [...ALL].filter((i) => i.href !== "/platform").sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
  const trail: { href?: string; title: string }[] = [{ href: "/platform", title: "Platform" }]
  if (!top) return trail.concat({ title: "Page" })
  if (pathname === top.href) return trail.concat({ title: top.title })
  trail.push({ href: top.href, title: top.title })
  if (pathname.endsWith("/staff")) trail.push({ title: "Institution", href: pathname.replace(/\/staff$/, "") }, { title: "Staff roles" })
  else trail.push({ title: "Details" })
  return trail
}
