/**
 * Monitoring memory for THIS server instance: a bounded ring of recent server errors and a rolling AI call tally. The ring is the fallback when the
 * database cannot be read. Server errors are ALSO written to the MonitorEvent table (see persistEvent), which is what the dashboard reads: that copy
 * survives restarts and is shared between instances. The AI tally stays in memory only.
 */
const MAX_ERRORS = 500;
const MAX_AI = 200;
export type MonitorError = { id: string; at: string; service: "application" | "database" | "storage" | "ai" | "email" | "auth" | "other"; status: number; code: string; method: string | null; path: string | null; requestId: string | null; message: string };
type AiCall = { at: number; ok: boolean; timeout: boolean; ms: number; status: number | null };
type Store = { started: number; errors: MonitorError[]; ai: AiCall[]; seq: number; lastAiOk: number | null };
const g = globalThis as unknown as { __monitor?: Store; __monitorPersist?: Persist };
const store = (): Store => (g.__monitor ??= { started: Date.now(), errors: [], ai: [], seq: 0, lastAiOk: null });

// ---------- durable copy of each server error (MonitorEvent) ----------
// One bounded queue and one pump. Every error is queued; the pump writes from the queue under hard limits so monitoring can never add load when things are already
// going wrong: at most PERSIST.perMinute writes a minute and PERSIST.perDay a day per instance, at most PERSIST.inflight at once, each write time-limited, and after
// a failed write (for example the database is down) all writing pauses for pauseMs. Events wait in the queue meanwhile (newest PERSIST.backlog kept; older ones are
// dropped and counted) and are written once the database answers, so an outage's own errors are not lost. Whatever is dropped is still in the in-memory ring; only its
// durable copy is skipped. A write failure is never visible to the request that caused the error.
export const PERSIST = { perMinute: 30, perDay: 2000, inflight: 3, timeoutMs: 1500, pauseMs: 30_000, backlog: 200 };
export type EventWriter = (e: MonitorError) => Promise<void>;
type Persist = { writer: EventWriter | null; minuteStart: number; minuteN: number; dayStart: number; dayN: number; inflight: number; pausedUntil: number; written: number; skipped: number; failed: number; backlog: MonitorError[]; timer: NodeJS.Timeout | null };
const persistState = (): Persist => (g.__monitorPersist ??= { writer: null, minuteStart: 0, minuteN: 0, dayStart: 0, dayN: 0, inflight: 0, pausedUntil: 0, written: 0, skipped: 0, failed: 0, backlog: [], timer: null });
/** Replaces the database writer (tests), or pass null to restore the default. */
export function setEventWriter(w: EventWriter | null) { persistState().writer = w; }
export const persistStats = () => { const p = persistState(); return { written: p.written, skipped: p.skipped, failed: p.failed, pausedUntil: p.pausedUntil, backlog: p.backlog.length, inflight: p.inflight }; };
const dbWriter: EventWriter = async (e) => {
  const { db } = await import("@/lib/db");
  await db.monitorEvent.create({ data: { id: e.id.length === 36 ? e.id : undefined, at: new Date(e.at), service: e.service, status: e.status, code: e.code, method: e.method, path: e.path, requestId: e.requestId, message: e.message } });
};
/** One write, time-limited. True on success; on failure it is counted and further writing pauses. */
async function writeOne(p: Persist, e: MonitorError): Promise<boolean> {
  let timer: NodeJS.Timeout;
  try {
    const write = (p.writer ?? dbWriter)(e);
    write.catch(() => undefined); // a rejection that arrives after the timeout already won must not surface as unhandled
    await Promise.race([write, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), PERSIST.timeoutMs); })]);
    p.written++; return true;
  } catch { p.failed++; p.pausedUntil = Date.now() + PERSIST.pauseMs; return false; }
  finally { clearTimeout(timer!); }
}
const later = (p: Persist, ms: number) => { if (p.timer) return; p.timer = setTimeout(() => { p.timer = null; pump(p); }, Math.max(50, ms)); p.timer.unref?.(); };
function pump(p: Persist) {
  try {
    const now = Date.now();
    if (now < p.pausedUntil) { if (p.backlog.length) later(p, p.pausedUntil - now); return; }
    if (now - p.minuteStart >= 60_000) { p.minuteStart = now; p.minuteN = 0; }
    if (now - p.dayStart >= 86_400_000) { p.dayStart = now; p.dayN = 0; }
    while (p.backlog.length && p.inflight < PERSIST.inflight) {
      if (p.minuteN >= PERSIST.perMinute || p.dayN >= PERSIST.perDay) { later(p, p.minuteN >= PERSIST.perMinute ? p.minuteStart + 60_000 - now : 600_000); return; }
      const e = p.backlog.shift()!; p.minuteN++; p.dayN++; p.inflight++;
      void writeOne(p, e).then((ok) => { if (!ok) { p.backlog.unshift(e); if (p.backlog.length > PERSIST.backlog) { p.backlog.shift(); p.skipped++; } } }).finally(() => { p.inflight--; pump(p); });
    }
  } catch { /* monitoring must never change the outcome of a request */ }
}
function persistEvent(e: MonitorError) {
  try {
    const p = persistState();
    p.backlog.push(e); if (p.backlog.length > PERSIST.backlog) { p.backlog.shift(); p.skipped++; }
    pump(p);
  } catch { /* never throws */ }
}

export const startedAt = () => new Date(store().started);

/** Removes anything that could carry a secret or a person: connection strings, URLs with credentials, bearer and JWT tokens, keys, emails, long opaque strings, stack frames. */
export function scrub(input: unknown, max = 240): string {
  let s = typeof input === "string" ? input : input instanceof Error ? input.message : (() => { try { return JSON.stringify(input) ?? ""; } catch { return ""; } })();
  s = s.split("\n")[0] ?? "";                                                                                  // first line only: no stack frames
  s = s.replace(/(?:\/[\w.@-]+){3,}\.(?:ts|js|mjs|tsx)\b(?::\d+)*/g, "[file]")                                     // source paths first (so "x.ts:12" is not mistaken for host:port)
    .replace(/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|smtp|smtps):\/\/\S+/gi, "[connection string]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]*@\S+/gi, "[url with credentials]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [hidden]")
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, "[token]")
    .replace(/\b(sk|pk|rk|gsk|xox[abp])[-_][A-Za-z0-9_-]{12,}/g, "[key]")
    .replace(/\b(password|passwd|pwd|secret|token|api[-_ ]?key|apikey|authorization|cookie)\s*[:=]\s*\S+/gi, "$1=[hidden]")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\b(?:localhost|[a-z][\w-]*(?:\.[\w-]+)+|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]):\d{2,5}\b/gi, "[host]")
    .replace(/\b(?![0-9a-f]{8}-[0-9a-f]{4}-)[A-Za-z0-9+_-]{32,}={0,2}/g, "[hidden]");                    // long opaque strings; UUIDs (request ids) are not secrets and stay
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * A failure note that is safe to keep. Database errors carry the failing query and sometimes the values in it (a student's address, number or name), so only their
 * class and code are kept. Anything else goes through the scrubber above and long digit runs are masked. One line, at most 300 characters.
 */
export function safeFailure(e: unknown): string {
  try {
    const name = e instanceof Error && /^[A-Za-z][\w.]{0,60}$/.test(e.name) ? e.name : "Error";
    const rawCode = (e as { code?: unknown } | null)?.code;
    const code = typeof rawCode === "string" && /^[A-Z0-9_]{2,40}$/.test(rawCode) ? ` ${rawCode}` : "";
    if (/^PrismaClient|^DriverAdapter|^DatabaseError$/.test(name)) return `${name}${code}: database error (details withheld)`;
    const msg = scrub(e instanceof Error ? e.message : String(e), 300).replace(/\b\d{6,}\b/g, "[number]");
    return `${name}${code}: ${msg}`.slice(0, 300);
  } catch { return "Error: failure (details withheld)"; }
}

/** A request path with anything identifying removed: UUIDs become :id, and long segments (a public link token) become :token. */
export function scrubPath(path: string): string {
  return path.split("?")[0].split("/").map((seg) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) ? ":id" : seg.length >= 20 && /[0-9]/.test(seg) ? ":token" : seg.length >= 32 ? ":token" : seg)).join("/").slice(0, 120);
}
/** Request ids are correlation handles (a UUID, or a caller-supplied label). Keep them if they are plain, otherwise hide them. */
const cleanRequestId = (id: string) => (/^[\w.:-]{1,64}$/.test(id) ? id : "[hidden]");

const serviceOf = (code: string, status: number, path: string | null): MonitorError["service"] => {
  if (/^AI_/.test(code)) return "ai";
  if (/^EMAIL_|MAIL/.test(code)) return "email";
  if (/STORAGE|UPLOAD|SIGNED/.test(code)) return "storage";
  if (/^AUTH_UNAVAILABLE/.test(code)) return "auth";
  if (path && /^\/api\/(health|platform\/monitoring)/.test(path)) return "application";
  return status >= 500 ? "application" : "other";
};
/** Records a server-side failure (HTTP 5xx or a service-unavailable code). Never throws. */
export function recordError(e: { status: number; code: string; message?: unknown; method?: string | null; path?: string | null; requestId?: string | null; service?: MonitorError["service"] }) {
  try {
    if (e.status < 500) return;
    const s = store(); s.seq++;
    const path = e.path ? scrubPath(e.path) : null;
    const entry: MonitorError = { id: crypto.randomUUID(), at: new Date().toISOString(), service: e.service ?? serviceOf(e.code, e.status, path), status: e.status, code: scrub(e.code, 60), method: e.method ?? null, path, requestId: e.requestId ? cleanRequestId(e.requestId) : null, message: scrub(e.message ?? e.code) };
    s.errors.push(entry);
    if (s.errors.length > MAX_ERRORS) s.errors.splice(0, s.errors.length - MAX_ERRORS);
    persistEvent(entry);
  } catch { /* monitoring must never change the outcome of a request */ }
}

export type ErrorQuery = { service?: MonitorError["service"]; from?: Date; to?: Date; q?: string; page: number; pageSize: number };
/** Newest first, filtered, paged. The ring is bounded, so this never grows with traffic. */
export function listErrors(q: ErrorQuery) {
  const all = store().errors;
  const needle = q.q?.toLowerCase();
  const rows = all.filter((e) => (!q.service || e.service === q.service) && (!q.from || new Date(e.at) >= q.from) && (!q.to || new Date(e.at) <= q.to) && (!needle || `${e.path ?? ""} ${e.code} ${e.message} ${e.requestId ?? ""}`.toLowerCase().includes(needle))).reverse();
  return { items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page, pageSize: q.pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / q.pageSize)), capacity: MAX_ERRORS, retained: all.length, since: startedAt().toISOString() };
}
export function errorCounts(now = Date.now()) {
  const all = store().errors; const since = (ms: number) => all.filter((e) => now - new Date(e.at).getTime() <= ms);
  const by = (list: MonitorError[]) => list.reduce<Record<string, number>>((a, e) => ((a[e.service] = (a[e.service] ?? 0) + 1), a), {});
  const h1 = since(3_600_000);
  const tally = (key: (e: MonitorError) => string) => Object.entries(h1.reduce<Record<string, number>>((a, e) => ((a[key(e)] = (a[key(e)] ?? 0) + 1), a), {})).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, n]) => ({ key: k, count: n }));
  return { last15Minutes: since(900_000).length, lastHour: h1.length, last24Hours: since(86_400_000).length, byServiceLastHour: by(h1), byStatusLastHour: tally((e) => String(e.status)), byRouteLastHour: tally((e) => `${e.method ?? "?"} ${e.path ?? "?"}`), retained: all.length, capacity: MAX_ERRORS };
}

/** One AI provider call: outcome and duration only. Never the prompt, the answer or the key. */
export function recordAiCall(c: { ok: boolean; timeout?: boolean; ms: number; status?: number | null }) {
  try { const s = store(); s.ai.push({ at: Date.now(), ok: c.ok, timeout: !!c.timeout, ms: Math.round(c.ms), status: c.status ?? null }); if (c.ok) s.lastAiOk = Date.now(); if (s.ai.length > MAX_AI) s.ai.splice(0, s.ai.length - MAX_AI); } catch { /* never throws */ }
}
export function aiStats(now = Date.now(), windowMs = 3_600_000) {
  const s = store(); const w = s.ai.filter((c) => now - c.at <= windowMs); const ok = w.filter((c) => c.ok);
  const lat = ok.map((c) => c.ms).sort((a, b) => a - b);
  return { windowMinutes: Math.round(windowMs / 60_000), calls: w.length, failures: w.filter((c) => !c.ok).length, timeouts: w.filter((c) => c.timeout).length, avgLatencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null, p95LatencyMs: lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : null, lastSuccessAt: s.lastAiOk ? new Date(s.lastAiOk).toISOString() : null };
}
/** Test helper only. */
export function resetMonitorStore() { const p = g.__monitorPersist; if (p?.timer) clearTimeout(p.timer); delete g.__monitor; delete g.__monitorPersist; }
