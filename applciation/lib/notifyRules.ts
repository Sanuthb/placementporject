/**
 * Pure rules for the notification centre: which category a notification belongs to, which channels a person has chosen, how a phone number is cleaned, when text messages
 * may be sent, what a text message says, which reminders are due, and how calendar files are written. No database, no network.
 */
export const CHANNELS = [["IN_APP", "In the app"], ["EMAIL", "Email"], ["SMS", "SMS"], ["WHATSAPP", "WhatsApp"]] as const;
export type Channel = (typeof CHANNELS)[number][0];
export const EXTERNAL: Channel[] = ["EMAIL", "SMS", "WHATSAPP"];

/** The kinds of notification a person can tune. `mandatory` ones always appear in the app (security, offers and account messages); their other channels are still a choice. */
export const CATEGORIES = [
  ["ACCOUNT", "Account and registration", true], ["PROFILE", "Profile and verification", false], ["ANNOUNCEMENTS", "Announcements", false], ["RESOURCES", "Study material and resources", false],
  ["COURSES", "Courses and deadlines", false], ["TESTS", "Test scheduling and results", false], ["INTERVIEWS", "Interview scheduling and reports", false], ["CAMPAIGNS", "Preparation campaigns and invitations", false],
  ["REMINDERS", "Preparation and event reminders", false], ["PLACEMENT", "Placement drives and rounds", false], ["OFFERS", "Offers and joining", true], ["SUPPORT", "Help and tickets", false],
] as const;
export type Category = (typeof CATEGORIES)[number][0];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(([k, l]) => [k, l])) as Record<Category, string>;
export const isMandatory = (c: Category) => CATEGORIES.find(([k]) => k === c)?.[2] === true;

/** Longest prefix wins. Anything not listed is a profile-type message, so it is never lost. */
const PREFIX: [string, Category][] = [
  ["onboarding", "ACCOUNT"], ["registration", "ACCOUNT"], ["account", "ACCOUNT"], ["block", "ACCOUNT"], ["section", "PROFILE"], ["student.correction", "PROFILE"], ["verification", "PROFILE"],
  ["announcement", "ANNOUNCEMENTS"], ["jobAlert", "ANNOUNCEMENTS"], ["resource", "RESOURCES"], ["course.deadline", "COURSES"], ["course", "COURSES"], ["assessment.reminder", "REMINDERS"], ["assessment", "TESTS"],
  ["interview", "INTERVIEWS"], ["discussion", "INTERVIEWS"], ["campaign.reminder", "REMINDERS"], ["preparation", "REMINDERS"], ["round.reminder", "REMINDERS"], ["drive.reminder", "REMINDERS"], ["psychometrics.reminder", "REMINDERS"],
  ["campaign", "CAMPAIGNS"], ["drive", "PLACEMENT"], ["round", "PLACEMENT"], ["participation", "PLACEMENT"], ["offer", "OFFERS"], ["joining", "OFFERS"], ["ticket", "SUPPORT"], ["roadmap", "PROFILE"],
  ["internship", "PLACEMENT"], ["project", "PROFILE"], ["jd", "PLACEMENT"], ["experience", "PLACEMENT"],
];
export const categoryOf = (type: string): Category => PREFIX.filter(([p]) => type === p || type.startsWith(`${p}.`) || type.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "PROFILE";

export type Pref = { category: string; channel: string; enabled: boolean };
/**
 * The channels a person receives a category on. The app is always on for mandatory categories and on by default otherwise; email, SMS and WhatsApp are off until the person
 * turns them on (text messages need their opt-in). The two older email switches keep governing the email that announcements and reminders already send.
 */
export function channelsFor(category: Category, prefs: Pref[]): Record<Channel, boolean> {
  const get = (ch: Channel) => prefs.find((p) => p.category === category && p.channel === ch)?.enabled;
  return { IN_APP: isMandatory(category) ? true : get("IN_APP") ?? true, EMAIL: get("EMAIL") ?? false, SMS: get("SMS") ?? false, WHATSAPP: get("WHATSAPP") ?? false };
}
export const wantsInApp = (category: Category, prefs: Pref[]) => channelsFor(category, prefs).IN_APP;

/** A phone number as the sending services need it (E.164), or null when it cannot be one. A bare 10-digit number is taken as Indian. */
export function normalisePhone(raw: string | null | undefined, defaultCountry = "91"): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  const d = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("00") ? digits.slice(2) : digits;
  if (!/^\d+$/.test(d)) return null;
  const full = digits.startsWith("+") || digits.startsWith("00") ? d : d.length === 10 ? `${defaultCountry}${d}` : d.length === 11 && d.startsWith("0") ? `${defaultCountry}${d.slice(1)}` : d.length === 12 && d.startsWith(defaultCountry) ? d : null;
  return full && full.length >= 11 && full.length <= 15 ? `+${full}` : null;
}

const IST_MIN = 330;
/** Text messages are not sent at night (9 pm to 8 am India time), except offers, which are time-sensitive. */
export function inQuietHours(now: Date, category: Category) {
  if (category === "OFFERS") return false;
  const m = (now.getUTCHours() * 60 + now.getUTCMinutes() + IST_MIN) % 1440;
  return m >= 21 * 60 || m < 8 * 60;
}

/** What a text message says: short, plain, no links to other sites. */
export function textMessage(note: { title: string; body?: string | null }, brand = "Placement Cell", max = 300) {
  const body = note.body?.replace(/\s+/g, " ").trim();
  const t = `${brand}: ${note.title.replace(/\s+/g, " ").trim()}${body ? `. ${body}` : ""}`;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export type SendCheck = { channel: Channel; send: boolean; reason?: string };
/** Whether one external channel should be used for one notification, and if not, why (so the delivery log can say). */
export function checkChannel(o: { channel: Channel; category: Category; prefs: Pref[]; collegeEnabled: boolean; providerConfigured: boolean; phone: string | null; email?: string | null; now: Date }): SendCheck {
  const { channel } = o;
  if (!channelsFor(o.category, o.prefs)[channel]) return { channel, send: false, reason: "The student has not turned this on" };
  if (channel === "EMAIL") return o.email ? { channel, send: true } : { channel, send: false, reason: "No email address" };
  if (!o.collegeEnabled) return { channel, send: false, reason: "Not switched on for this college" };
  if (!o.providerConfigured) return { channel, send: false, reason: "No sending service is configured" };
  if (!o.phone) return { channel, send: false, reason: "No valid phone number" };
  if (inQuietHours(o.now, o.category)) return { channel, send: false, reason: "Quiet hours (9 pm to 8 am)" };
  return { channel, send: true };
}

// ---- reminders ----
export type ReminderFacts = {
  now: Date
  /** Tests opening or closing soon, for each student they are for. */
  tests: { studentId: string; scheduleId: string; title: string; startsAt: Date; endsAt: Date; taken: boolean }[]
  /** Assignments (course lessons) due, for students enrolled who have not handed in. */
  assignments: { studentId: string; lessonId: string; courseTitle: string; title: string; dueAt: Date; submitted: boolean }[]
  /** Preparation plan items due. */
  planItems: { studentId: string; itemId: string; title: string; dueAt: Date; done: boolean; campaign: string }[]
  /** Interviews and discussions set up for the student with a last day. */
  assigned: { studentId: string; kind: "interview" | "discussion"; assignmentId: string; title: string; dueAt: Date; done: boolean }[]
};
export type Reminder = { studentId: string; type: string; link: string; title: string; body: string };
const HOUR = 3_600_000, fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/**
 * Reminders that are due now. A test is reminded when it opens within 24 hours or closes within 24 hours (and is not taken); an assignment or an assigned interview or discussion within 48 hours
 * of its last day (and not done); a plan item due within 24 hours (and not done). Each has a stable `link` so a reminder is sent once per person per item however often this runs.
 */
export function planReminders(f: ReminderFacts): Reminder[] {
  const t = f.now.getTime(), out: Reminder[] = [];
  for (const x of f.tests) {
    if (x.taken || x.endsAt.getTime() <= t) continue;
    if (x.startsAt.getTime() > t && x.startsAt.getTime() - t <= 24 * HOUR) out.push({ studentId: x.studentId, type: "assessment.reminder", link: `/student/assessments/${x.scheduleId}#opens`, title: `${x.title} opens soon`, body: `It opens ${fmt(x.startsAt)} and closes ${fmt(x.endsAt)}.` });
    else if (x.startsAt.getTime() <= t && x.endsAt.getTime() - t <= 24 * HOUR) out.push({ studentId: x.studentId, type: "assessment.reminder", link: `/student/assessments/${x.scheduleId}#closes`, title: `${x.title} closes soon`, body: `You have not taken it yet. It closes ${fmt(x.endsAt)}.` });
  }
  for (const x of f.assignments) if (!x.submitted && x.dueAt.getTime() > t && x.dueAt.getTime() - t <= 48 * HOUR) out.push({ studentId: x.studentId, type: "course.deadline", link: `/student/courses#lesson-${x.lessonId}`, title: `Assignment due soon: ${x.title}`, body: `${x.courseTitle}. Due ${fmt(x.dueAt)}.` });
  for (const x of f.planItems) if (!x.done && x.dueAt.getTime() > t - 12 * HOUR && x.dueAt.getTime() - t <= 24 * HOUR) out.push({ studentId: x.studentId, type: "preparation.reminder", link: `/student/campaigns#item-${x.itemId}`, title: `Preparation task due: ${x.title}`, body: `${x.campaign}. Due ${fmt(x.dueAt)}.` });
  for (const x of f.assigned) if (!x.done && x.dueAt.getTime() > t && x.dueAt.getTime() - t <= 48 * HOUR) out.push({ studentId: x.studentId, type: `${x.kind}.reminder`, link: `/student/prep#${x.kind}-${x.assignmentId}`, title: `${x.kind === "interview" ? "Mock interview" : "Discussion practice"} due soon: ${x.title}`, body: `Last day ${fmt(x.dueAt)}.` });
  const seen = new Set<string>();
  return out.filter((r) => { const k = `${r.studentId}|${r.link}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---- calendar files ----
export type CalEvent = { uid: string; title: string; start: Date; end?: Date; place?: string | null; description?: string | null; allDay?: boolean };
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
/** Folds a line to 75 octets as the calendar format asks, continuing with a space. */
export function fold(line: string) {
  const out: string[] = []; let cur = "", bytes = 0;
  for (const ch of line) { const n = Buffer.byteLength(ch); if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; } cur += ch; bytes += n; }
  out.push(cur);
  return out.join("\r\n ");
}
/** A calendar file (.ics) any calendar app can open or subscribe to. Times are in UTC; each event carries a reminder 30 minutes before. */
export function buildIcs(events: CalEvent[], now = new Date(), name = "Placement calendar") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Placement Platform//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@placement`, `DTSTAMP:${stamp(now)}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${day(e.start)}`, `DTEND;VALUE=DATE:${day(new Date((e.end ?? e.start).getTime() + 86_400_000))}`);
    else lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end ?? new Date(e.start.getTime() + HOUR))}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (!e.allDay) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "TRIGGER:-PT30M", "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
