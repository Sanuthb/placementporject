import { createClient } from "@supabase/supabase-js";
const B = process.env.BASE_URL ?? "http://localhost:3111";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data, error } = await sb.auth.signInWithPassword({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
if (error) { console.log("LOGIN FAIL", error.message); process.exit(1); }
const auth = { authorization: "Bearer " + data.session.access_token };
const call = async (m, p, body, raw, headers) => {
  const r = await fetch(B + p, { method: m, headers: headers ?? (raw ? auth : { ...auth, "content-type": "application/json" }), body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 80); }
  return { s: r.status, j, d: j?.data, code: j?.error?.code };
};
let fails = 0;
const t = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const day = 86400000, tag = Date.now().toString().slice(-6);
const upload = (name, text) => { const f = new FormData(); f.append("file", new Blob([text]), name); return f; };

// ---- setup
await call("PATCH", "/api/settings/verification", { requiredSections: ["ACADEMICS", "PERSONAL"] });
await call("PATCH", "/api/settings/policies", { approvalRequired: [], maxOffersPerStudent: 1, enforceTierUpgrade: false });
const dept = (await call("GET", "/api/settings/departments")).d.find((d) => d.code === "CSE");
let csv = "enrollment_no,name,email,phone,department_code,batch_name,program_code\n";
for (const c of "ABCDE") csv += `Q${tag}${c},Q ${c},q${tag}${c.toLowerCase()}@example.com,,CSE,2021-2025,\n`;
const pv = await call("POST", "/api/students/import/preview", null, upload("s.csv", csv)); await call("POST", `/api/students/import/${pv.d.jobId}/confirm`);
const list = (await call("GET", `/api/students?q=Q${tag}&limit=10`)).d.items; const st = (c) => list.find((x) => x.enrollmentNo === `Q${tag}${c}`).id; const en = (c) => `Q${tag}${c}`;
for (const c of "ABCDE") {
  await call("PUT", `/api/students/${st(c)}/sections/ACADEMICS`, { data: { cgpa: 8, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true });
  await call("PUT", `/api/students/${st(c)}/sections/PERSONAL`, { data: { dob: "2003-01-01" }, submit: true });
  await call("POST", `/api/students/${st(c)}/sections/ACADEMICS/approve`, {}); await call("POST", `/api/students/${st(c)}/sections/PERSONAL/approve`, {});
  await call("POST", `/api/students/${st(c)}/onboard`);
}
const co = (await call("POST", "/api/companies", { name: `AttCo ${tag}`, tier: "CORE" })).d.id;
const mkDrive = async (rounds) => {
  const d = await call("POST", "/api/drives", { companyId: co, role: "SDE", jobType: "FULL_TIME", applicationDeadline: new Date(Date.now() + 7 * day).toISOString(), driveDate: new Date(Date.now() + 9 * day).toISOString(), minCgpa: 7, allowPlaced: true, rounds });
  await call("POST", `/api/drives/${d.d.id}/publish`); return d.d.id;
};
const applyAll = async (drive, cs) => { const m = {}; for (const c of cs) m[c] = (await call("POST", `/api/drives/${drive}/applications`, { studentId: st(c) })).d.id; return m; };

// ---- attendance (round level)
const d1 = await mkDrive([{ type: "APTITUDE" }, { type: "TECHNICAL" }]);
const a1 = await applyAll(d1, "ABCD");
await call("POST", `/api/drives/${d1}/applications/decide`, { applicationIds: Object.values(a1), status: "SHORTLISTED" });
const [r1, r2] = (await call("GET", `/api/drives/${d1}`)).d.rounds.map((r) => r.id);
let sum = (await call("GET", `/api/drives/${d1}/attendance?roundId=${r1}`)).d; t("expected 4, none marked", sum.counts.expected === 4 && sum.counts.notMarked === 4, JSON.stringify(sum.counts));
const ses = await call("POST", `/api/drives/${d1}/attendance/session`, { roundId: r1 }); const code = ses.d?.code;
t("session code + qr payload", /^[A-Z2-9]{6}$/.test(code) && ses.d.qrPayload.includes(code));
t("same session returned again", (await call("POST", `/api/drives/${d1}/attendance/session`, { roundId: r1 })).d.code === code);
t("wrong code refused", (await call("POST", `/api/drives/${d1}/attendance/check-in`, { roundId: r1, code: "AAAAAA", enrollmentNo: en("A") })).code === "BAD_CODE");
t("A checks in with code", (await call("POST", `/api/drives/${d1}/attendance/check-in`, { roundId: r1, code, enrollmentNo: en("A") })).d?.status === "PRESENT");
t("B marked manually", (await call("POST", `/api/drives/${d1}/attendance/mark`, { roundId: r1, enrollmentNo: en("B"), status: "PRESENT" })).d?.status === "PRESENT");
t("student not in the drive refused", (await call("POST", `/api/drives/${d1}/attendance/mark`, { roundId: r1, enrollmentNo: en("E"), status: "PRESENT" })).s === 400);
sum = (await call("GET", `/api/drives/${d1}/attendance?roundId=${r1}`)).d; t("live counts 2/0/2", sum.counts.present === 2 && sum.counts.notMarked === 2, JSON.stringify(sum.counts));
const rot = await call("POST", `/api/drives/${d1}/attendance/rotate-code`, { roundId: r1 }); t("rotate gives new code", rot.d?.code && rot.d.code !== code);
t("old code now fails", (await call("POST", `/api/drives/${d1}/attendance/check-in`, { roundId: r1, code, enrollmentNo: en("C") })).code === "BAD_CODE");
const cl = await call("POST", `/api/drives/${d1}/attendance/close`, { roundId: r1 }); t("close marks 2 absent", cl.d?.markedAbsent === 2 && cl.d.counts.absent === 2 && cl.d.counts.notMarked === 0, JSON.stringify(cl.j));
t("close is repeatable", (await call("POST", `/api/drives/${d1}/attendance/close`, { roundId: r1 })).d?.markedAbsent === 0);
t("check-in after close refused", (await call("POST", `/api/drives/${d1}/attendance/check-in`, { roundId: r1, code: rot.d.code, enrollmentNo: en("C") })).code === "SESSION_CLOSED");
const cand = (await call("GET", `/api/drives/${d1}/rounds/${r1}/candidates`)).d.items; const resOf = (c) => cand.find((x) => x.student.enrollmentNo === en(c)).result?.status;
t("attendance fed round results", resOf("A") === "ATTENDED" && resOf("B") === "ATTENDED" && resOf("C") === "ABSENT" && resOf("D") === "ABSENT", JSON.stringify(cand.map((x) => x.result?.status)));
t("C corrected to present after close", (await call("POST", `/api/drives/${d1}/attendance/mark`, { roundId: r1, enrollmentNo: en("C"), status: "PRESENT" })).d?.status === "PRESENT");
t("A and B clear round 1 (attendance did not block)", (await call("POST", `/api/drives/${d1}/rounds/${r1}/results`, { results: [{ applicationId: a1.A, status: "CLEARED" }, { applicationId: a1.B, status: "CLEARED" }] })).d?.updated === 2);
t("excuse needs a recorded absence", (await call("POST", `/api/drives/${d1}/attendance/excuse`, { roundId: r1, studentId: st("A"), reason: "n/a for present" })).s === 404);

// ---- interview scheduling (round 2: A and B are waiting)
const p1 = (await call("POST", `/api/drives/${d1}/panels`, { name: "Panel 1", room: "Room 101" })).d, p2 = (await call("POST", `/api/drives/${d1}/panels`, { name: "Panel 2" })).d;
t("duplicate panel name 409", (await call("POST", `/api/drives/${d1}/panels`, { name: "Panel 1" })).s === 409);
const at = (h, m) => new Date(Date.UTC(2027, 0, 5, h, m)).toISOString();
const slot = (panelId, app, s, e) => call("POST", `/api/drives/${d1}/slots`, { roundId: r2, panelId, applicationId: app, startsAt: s, endsAt: e });
const sA = await slot(p1.id, a1.A, at(10, 0), at(10, 30)); t("slot for A on panel 1", sA.s === 200, JSON.stringify(sA.j));
t("panel double-booking refused", (await slot(p1.id, a1.B, at(10, 15), at(10, 45))).code === "SLOT_CONFLICT");
t("student double-booking refused", (await slot(p2.id, a1.A, at(10, 10), at(10, 40))).s === 409);
t("student not waiting for round 2 refused", (await slot(p2.id, a1.D, at(10, 0), at(10, 30))).s === 400);
const sB = await slot(p2.id, a1.B, at(10, 0), at(10, 30)); t("slot for B on panel 2", sB.s === 200);
t("reschedule into a clash refused", (await call("POST", `/api/drives/${d1}/slots/${sB.d.id}/reschedule`, { startsAt: at(10, 0), endsAt: at(10, 30), panelId: p1.id })).code === "SLOT_CONFLICT");
const rs = await call("POST", `/api/drives/${d1}/slots/${sB.d.id}/reschedule`, { startsAt: at(10, 45), endsAt: at(11, 15), panelId: p1.id, reason: "Panel 2 unavailable" }); t("reschedule + student notified", rs.d?.notified === true, JSON.stringify(rs.j));
t("start A", (await call("PATCH", `/api/drives/${d1}/slots/${sA.d.id}`, { status: "IN_PROGRESS" })).d?.status === "IN_PROGRESS");
t("panel runs one interview at a time", (await call("PATCH", `/api/drives/${d1}/slots/${sB.d.id}`, { status: "IN_PROGRESS" })).code === "PANEL_BUSY");
const live = (await call("GET", `/api/drives/${d1}/slots?roundId=${r2}`)).d; const lp1 = live.panels.find((p) => p.id === p1.id);
t("live view: A in interview, B next", lp1.inInterview?.application.student.name === "Q A" && lp1.next?.application.student.name === "Q B", JSON.stringify(lp1.next));
t("complete A", (await call("PATCH", `/api/drives/${d1}/slots/${sA.d.id}`, { status: "COMPLETED" })).d?.status === "COMPLETED");
t("completed slot cannot restart", (await call("PATCH", `/api/drives/${d1}/slots/${sA.d.id}`, { status: "IN_PROGRESS" })).s === 409);
t("panel with slots cannot be deleted", (await call("DELETE", `/api/drives/${d1}/panels/${p1.id}`)).s === 409);
t("cancel B", (await call("PATCH", `/api/drives/${d1}/slots/${sB.d.id}`, { status: "CANCELLED" })).d?.status === "CANCELLED");

// ---- drive-level attendance + blocking
const d2 = await mkDrive([]); const a2 = await applyAll(d2, "ABCD");
await call("POST", `/api/drives/${d2}/applications/decide`, { applicationIds: Object.values(a2), status: "SHORTLISTED" });
await call("POST", `/api/drives/${d2}/attendance/session`, {});
t("drive-level: A present", (await call("POST", `/api/drives/${d2}/attendance/mark`, { enrollmentNo: en("A"), status: "PRESENT" })).d?.status === "PRESENT");
t("drive-level close marks 3 absent", (await call("POST", `/api/drives/${d2}/attendance/close`, {})).d?.markedAbsent === 3);
t("excuse B's absence", (await call("POST", `/api/drives/${d2}/attendance/excuse`, { studentId: st("B"), reason: "Medical certificate" })).d?.excused === true);
t("close d1 round 2 too", (await call("POST", `/api/drives/${d1}/attendance/close`, { roundId: r2 })).s === 200);

t("bad policy params refused", (await call("POST", "/api/blocking/policies", { type: "MISSED_DRIVES", name: "bad", params: { threshold: 0, blockDays: 5 } })).s === 400);
const pol = await call("POST", "/api/blocking/policies", { type: "MISSED_DRIVES", name: "Two strikes", params: { threshold: 2, blockDays: 7, graceHours: 0 } }); t("create policy", pol.s === 200 && pol.d.params.graceHours === 0, JSON.stringify(pol.j));
const ev1 = await call("POST", "/api/blocking/evaluate"); t("evaluate: exactly D blocked", ev1.d?.created === 1, JSON.stringify(ev1.j));
t("evaluate again: nothing new", (await call("POST", "/api/blocking/evaluate")).d?.created === 0);
const blocks = (await call("GET", "/api/blocking/blocks")).d.items; const bD = blocks.find((b) => b.student.enrollmentNo === en("D"));
t("D has an automatic block, student notified", bD?.source === "POLICY" && !!bD.notifiedAt && /2 placement drives/.test(bD.reason), JSON.stringify(bD));
t("C, B not blocked (corrected / excused)", !blocks.some((b) => [en("B"), en("C")].includes(b.student.enrollmentNo)));
const d3 = await mkDrive([]);
const elig = (await call("GET", `/api/drives/${d3}/eligibility?status=all`)).d.items.find((i) => i.studentId === st("D"));
t("blocked student ineligible with reason", elig?.eligible === false && elig.blocked && /Blocked until/.test(elig.reasons[0]), JSON.stringify(elig));
t("exception cannot bypass a block", (await call("POST", `/api/drives/${d3}/exceptions`, { studentId: st("D"), reason: "Please allow this one" })).s === 400);
t("cannot apply while blocked", (await call("POST", `/api/drives/${d3}/applications`, { studentId: st("D") })).s === 400);
t("lift needs a reason", (await call("POST", `/api/blocking/blocks/${bD.id}/lift`, {})).s === 400);
t("lift with reason", (await call("POST", `/api/blocking/blocks/${bD.id}/lift`, { reason: "Principal approved after review" })).d?.status === "LIFTED");
t("lift twice 409", (await call("POST", `/api/blocking/blocks/${bD.id}/lift`, { reason: "again again" })).s === 409);
t("can apply after lift", (await call("POST", `/api/drives/${d3}/applications`, { studentId: st("D") })).s === 200);
t("same missed drives are not counted twice", (await call("POST", "/api/blocking/evaluate")).d?.created === 0);
t("manual block", (await call("POST", "/api/blocking/blocks", { studentId: st("E"), reason: "Misconduct during drive", endsAt: new Date(Date.now() + 3 * day).toISOString() })).s === 200);
t("manual block in the past refused", (await call("POST", "/api/blocking/blocks", { studentId: st("E"), reason: "x y z", endsAt: new Date(Date.now() - day).toISOString() })).s === 400);
t("filter blocks by source", (await call("GET", "/api/blocking/blocks?source=MANUAL")).d.items.every((b) => b.source === "MANUAL"));
t("tier policy can be created once", (await call("POST", "/api/blocking/policies", { type: "PLACED_LOWER_TIER", name: "No downgrades" })).s === 200 && (await call("POST", "/api/blocking/policies", { type: "PLACED_LOWER_TIER", name: "dup" })).s === 400);
const cron = process.env.CRON_SECRET;
t("scheduler with secret runs", (await call("POST", "/api/blocking/evaluate", null, null, { authorization: "Bearer " + cron })).d?.colleges >= 1);
t("wrong secret rejected", (await call("POST", "/api/blocking/evaluate", null, null, { authorization: "Bearer nope" })).s === 401);
t("no credentials rejected", (await call("POST", "/api/blocking/evaluate", null, null, {})).s === 401);
// clean up so later runs start fresh: deactivate policies, lift manual block
for (const p of (await call("GET", "/api/blocking/policies")).d) await call("PATCH", `/api/blocking/policies/${p.id}`, { isActive: false });
for (const b of (await call("GET", "/api/blocking/blocks")).d.items) await call("POST", `/api/blocking/blocks/${b.id}/lift`, { reason: "Test cleanup" });

// ---- historical import
const hist = `enrollment_no,name,email,department_code,batch_name,company_name,company_tier,role,package_lpa,offer_year,joined
H${tag}1,Old One,h${tag}1@example.com,CSE,2021-2025,Legacy ${tag},DREAM,SDE,18,2023,yes
H${tag}1,Old One,h${tag}1@example.com,CSE,2021-2025,Legacy ${tag},DREAM,Analyst,12,2022,no
H${tag}2,Bad Dept,h${tag}2@example.com,ZZZ,2021-2025,Legacy ${tag},,SDE,9,2023,
${en("A")},Current Student,cur${tag}@example.com,CSE,2021-2025,Legacy ${tag},,SDE,9,2023,
H${tag}4,Old Two,h${tag}4@example.com,CSE,2021-2025,Tiny ${tag},REGULAR,Tester,6,2023,
`;
const dry = await call("POST", "/api/placements/historical-import?dryRun=true", null, upload("h.csv", hist)); t("dry run counts", dry.d?.valid === 3 && dry.d.failed === 2 && dry.d.studentsToCreate === 2 && dry.d.companiesToCreate === 2, JSON.stringify(dry.j));
t("dry run wrote nothing", (await call("GET", `/api/students?q=H${tag}&isArchived=true`)).d.items.length === 0);
const real = await call("POST", "/api/placements/historical-import", null, upload("h.csv", hist)); t("import creates 3 offers", real.d?.offersCreated === 3, JSON.stringify(real.j));
t("re-import is idempotent", (await call("POST", "/api/placements/historical-import", null, upload("h.csv", hist))).d?.duplicatesSkipped === 3);
t("history stays out of the current list", (await call("GET", `/api/students?q=H${tag}`)).d.items.length === 0);
t("history visible as archived", (await call("GET", `/api/students?q=H${tag}&isArchived=true`)).d.items.length === 2);
const comp = (await call("GET", `/api/companies?q=Legacy ${tag}`)).d.items[0]; const ch = (await call("GET", `/api/companies/${comp.id}`)).d.history;
t("company history includes past hires", ch.studentsHired === 1 && ch.highestPackageLpa === 18 && comp.tier === "DREAM", JSON.stringify(ch));

// ---- job alerts
await call("PUT", `/api/students/${st("A")}/sections/SKILLS`, { data: { skills: ["React", { name: "SQL" }] }, submit: true });
await call("POST", `/api/students/${st("A")}/sections/SKILLS/approve`, {});
t("alert with unknown department refused", (await call("POST", "/api/job-alerts", { title: "Dev", companyName: "X Co", jobType: "FULL_TIME", applyUrl: "https://x.test/apply", targetDepartmentIds: ["00000000-0000-4000-8000-000000000000"] })).s === 400);
const al = await call("POST", "/api/job-alerts", { title: "React Developer", companyName: "Offcampus Inc", jobType: "INTERNSHIP", applyUrl: "https://x.test/apply", targetDepartmentIds: [dept.id], targetSkills: ["react"] }); t("create alert (draft)", al.s === 200 && al.d.status === "DRAFT", JSON.stringify(al.j));
const pub = await call("POST", `/api/job-alerts/${al.d.id}/publish`, { notifyByEmail: true }); t("publish: audience = skill match only, emailed", pub.d?.audience === 1 && pub.d.emailed?.sent === 1, JSON.stringify(pub.j));
t("publish twice 409", (await call("POST", `/api/job-alerts/${al.d.id}/publish`, {})).s === 409);
const stt = (await call("GET", `/api/job-alerts/${al.d.id}/stats`)).d; t("stats", stt.audience === 1 && stt.views === 0 && stt.clicks === 0);
t("close", (await call("POST", `/api/job-alerts/${al.d.id}/close`)).d?.status === "CLOSED");
t("closed alert cannot be edited", (await call("PATCH", `/api/job-alerts/${al.d.id}`, { title: "Renamed alert" })).s === 409);
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
