import { LibraryIcon, ClipboardCheckIcon, GraduationCapIcon, GlobeIcon, NewspaperIcon, BookOpenIcon, BriefcaseBusinessIcon, CalendarDaysIcon, ClipboardListIcon, BrainIcon, MegaphoneIcon, NotebookPenIcon, SparklesIcon, TargetIcon, InboxIcon, UsersRoundIcon, MailIcon, ScrollTextIcon, TicketIcon, FileBarChartIcon, UserCheckIcon, BarChart3Icon, BellIcon, FileTextIcon, LifeBuoyIcon, SlidersHorizontalIcon, UserIcon, BanIcon, BriefcaseIcon, BuildingIcon, CheckCheckIcon, HandshakeIcon, LayoutDashboardIcon, SettingsIcon, ShieldCheckIcon, UsersIcon, PresentationIcon, type LucideIcon } from "lucide-react"

import type { Kind } from "@/lib/web/auth"

export type NavItem = { title: string; href: string; icon: LucideIcon; module?: string; roles?: string[] }
export type NavSection = { label: string; items: NavItem[] }

/**
 * The sidebar for each kind of login. An item with a `module` is shown only when the college has bought it
 * (the API enforces this too). Items are added here as each phase's screens are built.
 */
export const NAV: Record<Kind, NavSection[]> = {
  staff: [
    { label: "Faculty", items: [{ title: "My students", href: "/staff/faculty", icon: PresentationIcon, roles: ["FACULTY"] }] },
    { label: "Placement", items: [{ title: "Dashboard", href: "/staff", icon: LayoutDashboardIcon }] },
    {
      label: "Students",
      items: [
        { title: "Students", href: "/staff/students", icon: UsersIcon, module: "ONBOARDING" },
        { title: "Verification", href: "/staff/verification", icon: ShieldCheckIcon, module: "ONBOARDING" },
        { title: "Personality tests", href: "/staff/psychometrics", icon: BrainIcon, module: "PSYCHOMETRICS" },
        { title: "Roadmaps", href: "/staff/roadmaps", icon: ClipboardListIcon, module: "ONBOARDING", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY"] },
        { title: "Status requests", href: "/staff/requests", icon: UserCheckIcon, module: "ONBOARDING", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
      ],
    },
    {
      label: "Recruitment",
      items: [
        { title: "Companies", href: "/staff/companies", icon: BuildingIcon, module: "DRIVES" },
        { title: "Drives", href: "/staff/drives", icon: BriefcaseIcon, module: "DRIVES" },
        { title: "Offers", href: "/staff/offers", icon: HandshakeIcon, module: "DRIVES" },
        { title: "Job alerts", href: "/staff/job-alerts", icon: MegaphoneIcon, module: "DRIVES" },
        { title: "Employer CRM", href: "/staff/crm", icon: TargetIcon, module: "EMPLOYER_CRM", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Recruiters", href: "/staff/recruiters", icon: UsersRoundIcon, module: "RECRUITER_PORTAL", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Blocking", href: "/staff/blocking", icon: BanIcon, module: "ATTENDANCE_BLOCKING" },
        { title: "Analytics", href: "/staff/analytics", icon: BarChart3Icon, module: "ANALYTICS" },
      ],
    },
    {
      label: "Student support",
      items: [
        { title: "Preparation", href: "/staff/prep", icon: NotebookPenIcon, module: "STUDENT_PREP", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Resource library", href: "/staff/resources", icon: LibraryIcon, module: "STUDENT_PREP", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Assessments", href: "/staff/assessments", icon: ClipboardListIcon, module: "ASSESSMENTS", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Internships", href: "/staff/internships", icon: BriefcaseBusinessIcon, module: "INTERNSHIPS" },
        { title: "Events and fairs", href: "/staff/events", icon: CalendarDaysIcon, module: "EVENTS", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Courses", href: "/staff/courses", icon: GraduationCapIcon, module: "LEARNING", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Learning", href: "/staff/learning", icon: BookOpenIcon, module: "LEARNING", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Talent showcase", href: "/staff/showcase", icon: SparklesIcon, module: "TALENT_SHOWCASE" },
      ],
    },
    {
      label: "Communication",
      items: [
        { title: "Messages", href: "/staff/communications", icon: MailIcon, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
        { title: "Support tickets", href: "/staff/tickets", icon: TicketIcon },
        { title: "Notifications", href: "/staff/notifications", icon: InboxIcon },
        { title: "Reports", href: "/staff/reports", icon: FileBarChartIcon, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
      ],
    },
    { label: "Administration", items: [{ title: "Audit log", href: "/staff/audit", icon: ScrollTextIcon, roles: ["TPO_ADMIN"] }, { title: "Approvals", href: "/staff/approvals", icon: CheckCheckIcon }, { title: "My security", href: "/staff/security", icon: ShieldCheckIcon }, { title: "Settings", href: "/staff/settings", icon: SettingsIcon, roles: ["TPO_ADMIN"] }] },
  ],
  student: [
    { label: "Placement", items: [{ title: "Home", href: "/student", icon: LayoutDashboardIcon }, { title: "Onboarding", href: "/student/onboarding", icon: UserIcon, module: "ONBOARDING" }, { title: "My profile", href: "/student/profile", icon: UserIcon, module: "ONBOARDING" }, { title: "My full view", href: "/student/overview", icon: UserIcon, module: "ONBOARDING" }, { title: "Resume", href: "/student/resume", icon: FileTextIcon, module: "ONBOARDING" }] },
    { label: "Drives", items: [{ title: "Calendar", href: "/student/calendar", icon: CalendarDaysIcon }, { title: "Blocks", href: "/student/blocks", icon: BanIcon, module: "ATTENDANCE_BLOCKING" }, { title: "Open drives", href: "/student/drives", icon: BriefcaseIcon, module: "DRIVES" }, { title: "My applications", href: "/student/applications", icon: CheckCheckIcon, module: "DRIVES" }, { title: "My offers", href: "/student/offers", icon: HandshakeIcon, module: "DRIVES" }] },
    {
      label: "Grow",
      items: [
        { title: "Assessments", href: "/student/assessments", icon: ClipboardCheckIcon, module: "ASSESSMENTS" },
        { title: "Personality test", href: "/student/personality", icon: BrainIcon, module: "PSYCHOMETRICS" },
        { title: "Career tests", href: "/student/tests", icon: ClipboardCheckIcon, module: "PSYCHOMETRICS" },
        { title: "My career profile", href: "/student/career-profile", icon: BrainIcon, module: "ONBOARDING" },
        { title: "My roadmap", href: "/student/roadmap", icon: ClipboardListIcon, module: "ONBOARDING" },
        { title: "Preparation", href: "/student/prep", icon: NotebookPenIcon, module: "STUDENT_PREP" },
        { title: "Study material", href: "/student/resources", icon: LibraryIcon, module: "STUDENT_PREP" },
        { title: "Courses", href: "/student/courses", icon: GraduationCapIcon, module: "LEARNING" },
        { title: "Learning", href: "/student/learning", icon: BookOpenIcon, module: "LEARNING" },
        { title: "Internships", href: "/student/internships", icon: BriefcaseBusinessIcon, module: "INTERNSHIPS" },
        { title: "Events", href: "/student/events", icon: CalendarDaysIcon, module: "EVENTS" },
        { title: "Job alerts", href: "/student/job-alerts", icon: NewspaperIcon, module: "DRIVES" },
        { title: "Shareable profile", href: "/student/showcase", icon: GlobeIcon, module: "TALENT_SHOWCASE" },
      ],
    },
    { label: "Help", items: [{ title: "Notifications", href: "/student/notifications", icon: BellIcon }, { title: "Help and FAQs", href: "/student/help", icon: LifeBuoyIcon }, { title: "Support", href: "/student/support", icon: LifeBuoyIcon }, { title: "Placement status", href: "/student/status", icon: SlidersHorizontalIcon }, { title: "Privacy and my data", href: "/student/privacy", icon: ShieldCheckIcon }] },
  ],
  recruiter: [{ label: "Recruiting", items: [{ title: "My drives", href: "/recruiter", icon: LayoutDashboardIcon }, { title: "Post jobs", href: "/recruiter/jobs", icon: BriefcaseIcon }] }],
}

export const KIND_LABEL: Record<Kind, string> = { staff: "Staff console", student: "Student", recruiter: "Recruiter" }

export function visibleNav(kind: Kind, modules: string[], roles: string[] = []): NavSection[] {
  // Faculty-only logins see only what is explicitly meant for faculty. Items with no role list are for placement staff.
  const facultyOnly = kind === "staff" && roles.length > 0 && roles.every((r) => r === "FACULTY")
  return NAV[kind]
    .map((s) => ({ ...s, items: s.items.filter((i) => (!i.module || modules.includes(i.module)) && (!i.roles || i.roles.some((r) => roles.includes(r)))) }))
    .map((s) => (facultyOnly ? { ...s, items: s.items.filter((i) => i.roles?.includes("FACULTY")) } : s))
    .filter((s) => s.items.length)
}
