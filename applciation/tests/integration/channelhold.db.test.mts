// SMS and WhatsApp hold against the ISOLATED LOCAL Docker PostgreSQL only.   npm run test:channels:db
// The real dispatch path (deliverNotification / deliverPending) with provider keys present, the institution switched ON and the student opted IN. A fetch counter proves no provider is contacted.
import { randomUUID } from "node:crypto";
import { loadEnvFiles } from "../../scripts/lib/envFiles";
import { assertLocalTargets } from "../../lib/localOnly";

loadEnvFiles();
assertLocalTargets(process.env, { strict: true, what: "run the channel hold database tests" });
process.env.REQUIRE_LOCAL_DB = "true";
let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };

const calls: string[] = [];
globalThis.fetch = (async (u: unknown) => { calls.push(String(u)); throw new Error("a network call was made"); }) as typeof fetch;
Object.assign(process.env, { TWILIO_ACCOUNT_SID: "ACdbtestsid", TWILIO_AUTH_TOKEN: "db-test-token", TWILIO_SMS_FROM: "+15550000001", TWILIO_WHATSAPP_FROM: "+15550000002" });
delete process.env.CHANNEL_DRY_RUN;

const { db } = await import("../../lib/db");
const { deliverNotification, deliverPending } = await import("../../lib/dispatch");
const { HOLD_REASON } = await import("../../lib/channels");
const tag = randomUUID().slice(0, 8);
const col = await db.college.create({ data: { name: `Hold Test ${tag}`, slug: `hold-${tag}` } });
try {
  await db.collegeSettings.create({ data: { collegeId: col.id, smsEnabled: true, whatsappEnabled: true } });
  const dep = await db.department.create({ data: { collegeId: col.id, name: "D", code: "D" } });
  const bat = await db.batch.create({ data: { collegeId: col.id, name: "B", startYear: 2022, endYear: 2026 } });
  const st = await db.student.create({ data: { collegeId: col.id, enrollmentNo: `E${tag}`, name: "Hold Student", email: `hold-${tag}@example.test`, phone: "+919876543210", departmentId: dep.id, batchId: bat.id } });
  const key = `S:${st.id}`;
  for (const channel of ["SMS", "WHATSAPP"]) await db.notificationPref.create({ data: { collegeId: col.id, ownerKey: key, studentId: st.id, category: "PROFILE", channel, enabled: true } });
  const mk = (title: string) => db.notification.create({ data: { collegeId: col.id, studentId: st.id, type: "project.update", title, body: "b" } });
  const noon = new Date("2026-11-12T07:00:00Z"); // 12:30 IST, outside quiet hours: only the hold can stop the send

  const n1 = await mk("one");
  const sent = await deliverNotification(n1, noon);
  const rows = await db.notificationDelivery.findMany({ where: { notificationId: n1.id } });
  t("institution on + student opted in + provider keys present + daytime: nothing is sent (0 deliveries)", sent === 0);
  t("no request was made to any provider", calls.length === 0, calls.join(","));
  t("both channels are logged as SKIPPED with the on-hold reason, none SENT or FAILED", rows.length === 2 && rows.every((r) => r.status === "SKIPPED" && r.detail === HOLD_REASON && !r.providerRef), JSON.stringify(rows.map((r) => [r.channel, r.status, r.detail])));

  process.env.CHANNEL_DRY_RUN = "true";
  const n2 = await mk("two"); const s2 = await deliverNotification(n2, noon);
  const r2 = await db.notificationDelivery.findMany({ where: { notificationId: n2.id } });
  t("dry-run mode does not turn the hold into a 'sent' record", s2 === 0 && r2.length === 2 && r2.every((r) => r.status === "SKIPPED" && r.providerRef == null));
  delete process.env.CHANNEL_DRY_RUN;

  const n3 = await mk("three");
  const p = await deliverPending(col.id, 6, noon);
  const r3 = await db.notificationDelivery.findMany({ where: { notificationId: n3.id } });
  t("the background catch-up job (deliverPending) is held the same way and contacts no provider", p.delivered === 0 && r3.length === 2 && r3.every((r) => r.status === "SKIPPED") && calls.length === 0);
  t("across all runs no SMS or WhatsApp delivery has status SENT or SENDING", (await db.notificationDelivery.count({ where: { collegeId: col.id, status: { in: ["SENT", "SENDING"] } } })) === 0);
  t("the institution's own setting and the student's opt-in were left as they were (configuration preserved)", (await db.collegeSettings.findUnique({ where: { collegeId: col.id } }))?.smsEnabled === true && (await db.notificationPref.count({ where: { ownerKey: key, enabled: true } })) === 2);
} finally {
  await db.notificationDelivery.deleteMany({ where: { collegeId: col.id } }); await db.notification.deleteMany({ where: { collegeId: col.id } }); await db.notificationPref.deleteMany({ where: { collegeId: col.id } });
  await db.student.deleteMany({ where: { collegeId: col.id } }); await db.batch.deleteMany({ where: { collegeId: col.id } }); await db.department.deleteMany({ where: { collegeId: col.id } });
  await db.collegeSettings.deleteMany({ where: { collegeId: col.id } }); await db.college.delete({ where: { id: col.id } }).catch(() => {});
  await db.$disconnect();
}
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
