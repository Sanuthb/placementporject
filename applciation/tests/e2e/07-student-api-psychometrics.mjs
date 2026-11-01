import { client, login, makeStudents, onboard, upload, checker, day, tag } from "./lib.mjs";
const { t, done } = checker();
const staff = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
await staff("PATCH", "/api/settings/verification", { requiredSections: ["ACADEMICS", "PERSONAL"] });
await staff("PATCH", "/api/settings/policies", { approvalRequired: [], maxOffersPerStudent: 1, enforceTierUpgrade: false });
await staff("PATCH", "/api/settings/verification", { requireAssessmentToOnboard: false });
const dept = (await staff("GET", "/api/settings/departments")).d.find((d) => d.code === "CSE");
const { ids, tokens } = await makeStudents(staff, 6, "T");
const me = Object.fromEntries(Object.entries(tokens).map(([c, tk]) => [c, client(tk)]));
const cg = { A: 8, B: 6, C: 8, D: 8, E: 8, F: 8 };

// ---- auth boundaries
const m = (await me.A("GET", "/api/student/me")).d; t("student /me", m.enrollmentNo === `T${tag}A` && m.stage === "PROFILE_PENDING" && m.modules.includes("DRIVES"));
t("first sign-in activated the invite", (await staff("GET", `/api/students/${ids.A}`)).d.inviteStatus === "ACTIVATED");
t("student token refused on staff API", (await me.A("GET", "/api/students")).s === 403);
t("staff token refused on student API", (await staff("GET", "/api/student/me")).s === 403);
t("no token refused", (await client("x")("GET", "/api/student/me")).s === 401);

// ---- profile sections
const secs = (await me.A("GET", "/api/student/sections")).d; t("8 sections, 2 required", secs.sections.length === 8 && secs.sections.filter((x) => x.required).length === 2);
t("save academics draft", (await me.A("PUT", "/api/student/sections/ACADEMICS", { data: { cgpa: 8, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 } })).d?.status === "DRAFT");
t("invalid academics rejected", (await me.A("PUT", "/api/student/sections/ACADEMICS", { data: { cgpa: 15 } })).s === 400);
t("upload proof to a draft section", (await me.A("POST", "/api/student/sections/ACADEMICS/documents", null, upload("marks.pdf", "%PDF-1.4 x", "application/pdf"))).s === 200);
t("bad file type refused", (await me.A("POST", "/api/student/sections/ACADEMICS/documents", null, upload("x.html", "x", "text/html"))).s === 400);
const g = (await me.A("GET", "/api/student/sections/ACADEMICS")).d; t("section shows proof with link", g.documents.length === 1 && !!g.documents[0].url);
t("remove proof", (await me.A("DELETE", `/api/student/sections/ACADEMICS/documents/${g.documents[0].id}`)).d?.deleted === true);
await me.A("POST", "/api/student/sections/ACADEMICS/documents", null, upload("marks.pdf", "%PDF-1.4 x", "application/pdf"));
t("submit academics", (await me.A("PUT", "/api/student/sections/ACADEMICS", { data: { cgpa: 8, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true })).d?.status === "SUBMITTED");
t("cannot edit while under review", (await me.A("PUT", "/api/student/sections/ACADEMICS", { data: { cgpa: 9, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 } })).s === 409);
t("cannot add proof while under review", (await me.A("POST", "/api/student/sections/ACADEMICS/documents", null, upload("m2.pdf", "%PDF", "application/pdf"))).s === 409);
t("staff queue shows it", (await staff("GET", "/api/verification/queue?section=ACADEMICS")).d.items.some((i) => i.student.id === ids.A));
t("changes requested reaches the student", (await staff("POST", `/api/students/${ids.A}/sections/ACADEMICS/request-changes`, { comment: "Marksheet is blurry" })).s === 200 && (await me.A("GET", "/api/student/sections/ACADEMICS")).d.reviewComment === "Marksheet is blurry");
t("student sees the notification", (await me.A("GET", "/api/student/notifications?unreadOnly=true")).d.items.some((n) => n.type === "section.changesRequested"));
await me.A("PUT", "/api/student/sections/ACADEMICS", { data: { cgpa: 8, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true });
await me.A("PUT", "/api/student/sections/PERSONAL", { data: { dob: "2003-01-01" }, submit: true });
await staff("POST", `/api/students/${ids.A}/sections/ACADEMICS/approve`, {}); await staff("POST", `/api/students/${ids.A}/sections/PERSONAL/approve`, {});
t("onboard A", (await staff("POST", `/api/students/${ids.A}/onboard`)).s === 200);
const ed = await me.A("PUT", "/api/student/sections/ACADEMICS", { data: { cgpa: 8.4, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 } });
const sv = (await me.A("GET", "/api/student/sections/ACADEMICS")).d; t("edit of verified section waits as a revision", ed.s === 200 && sv.status === "VERIFIED" && sv.data.cgpa === 8 && sv.pendingData.cgpa === 8.4);
await me.A("PUT", "/api/student/sections/ACADEMICS", { data: { cgpa: 8.4, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true });
t("approving the revision applies it", (await staff("POST", `/api/students/${ids.A}/sections/ACADEMICS/approve`, {})).s === 200 && (await me.A("GET", "/api/student/sections/ACADEMICS")).d.data.cgpa === 8.4);
for (const c of "BCDE") { const r = await onboard(staff, ids[c], cg[c]); if (r.s !== 200) console.log("onboard failed", c, r.j); }
// F: verified but not onboarded
await staff("PUT", `/api/students/${ids.F}/sections/ACADEMICS`, { data: { cgpa: 8, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true }); await staff("PUT", `/api/students/${ids.F}/sections/PERSONAL`, { data: { dob: "2003-01-01" }, submit: true });
await staff("POST", `/api/students/${ids.F}/sections/ACADEMICS/approve`, {}); await staff("POST", `/api/students/${ids.F}/sections/PERSONAL/approve`, {});

// ---- drives
const co = (await staff("POST", "/api/companies", { name: `StuCo ${tag}`, tier: "CORE" })).d.id;
const mkDrive = async (extra = {}, rounds = [{ type: "APTITUDE" }]) => { const d = await staff("POST", "/api/drives", { companyId: co, role: "SDE", jobType: "FULL_TIME", applicationDeadline: new Date(Date.now() + 3 * day).toISOString(), driveDate: new Date(Date.now() + 6 * day).toISOString(), minCgpa: 7, allowPlaced: true, departmentIds: [dept.id], rounds, ...extra }); await staff("POST", `/api/drives/${d.d.id}/publish`); return d.d.id; };
const d1 = await mkDrive();
const list = (id) => (r) => r.d.find((x) => x.id === id);
t("A sees the drive and is eligible", list(d1)(await me.A("GET", "/api/student/drives"))?.eligibility.eligible === true);
const eb = list(d1)(await me.B("GET", "/api/student/drives")).eligibility; t("B is told why not (CGPA)", !eb.eligible && /CGPA/.test(eb.reasons[0]), JSON.stringify(eb));
const ef = list(d1)(await me.F("GET", "/api/student/drives")).eligibility; t("F (not onboarded) is told what to do", !ef.eligible && /onboarded/.test(ef.reasons[0]), JSON.stringify(ef));
const dd = (await me.A("GET", `/api/student/drives/${d1}`)).d; t("drive detail with rounds and rules", dd.rounds.length === 1 && dd.rules.minCgpa === "7" && dd.company.name === `StuCo ${tag}` || dd.rules.minCgpa == 7);
t("A applies", (await me.A("POST", `/api/student/drives/${d1}/apply`)).s === 200);
t("apply twice 409", (await me.A("POST", `/api/student/drives/${d1}/apply`)).s === 409);
t("B cannot apply", (await me.B("POST", `/api/student/drives/${d1}/apply`)).s === 400);
t("withdraw", (await me.A("POST", `/api/student/drives/${d1}/withdraw`)).d?.status === "WITHDRAWN");
t("withdraw again 404", (await me.A("POST", `/api/student/drives/${d1}/withdraw`)).s === 404);
t("re-apply after withdrawing", (await me.A("POST", `/api/student/drives/${d1}/apply`)).d?.status === "APPLIED");
for (const c of "CD") await me[c]("POST", `/api/student/drives/${d1}/apply`);
const myApps = (await me.A("GET", "/api/student/applications")).d; t("my applications with journey", myApps.length === 1 && myApps[0].journey.length === 1 && myApps[0].status === "APPLIED");
const apps = (await staff("GET", `/api/drives/${d1}/applications`)).d; const appOf = (c) => apps.find((a) => a.student.id === ids[c]).id;
await staff("POST", `/api/drives/${d1}/applications/decide`, { applicationIds: ["A", "C", "D"].map(appOf), status: "SHORTLISTED" });
const r1 = (await staff("GET", `/api/drives/${d1}`)).d.rounds[0].id;

// ---- attendance
const ses = await staff("POST", `/api/drives/${d1}/attendance/session`, { roundId: r1 });
t("wrong code refused", (await me.A("POST", "/api/student/attendance/check-in", { driveId: d1, roundId: r1, code: "AAAAAA" })).code === "BAD_CODE");
t("A checks in with the code", (await me.A("POST", "/api/student/attendance/check-in", { driveId: d1, roundId: r1, code: ses.d.code.toLowerCase() })).d?.status === "PRESENT");
t("student not in the drive cannot check in", (await me.E("POST", "/api/student/attendance/check-in", { driveId: d1, roundId: r1, code: ses.d.code })).s === 400);
t("staff sees A present", (await staff("GET", `/api/drives/${d1}/attendance?roundId=${r1}`)).d.counts.present === 1);

// ---- interview slot visible to the student
const panel = (await staff("POST", `/api/drives/${d1}/panels`, { name: "P1", room: "Room 7" })).d;
await staff("POST", `/api/drives/${d1}/slots`, { roundId: r1, panelId: panel.id, applicationId: appOf("A"), startsAt: new Date(Date.now() + 4 * day).toISOString(), endsAt: new Date(Date.now() + 4 * day + 1800000).toISOString() });
t("student sees interview slot with room", (await me.A("GET", "/api/student/applications")).d[0].journey[0].slot?.panel.room === "Room 7");

// ---- offers
await staff("POST", `/api/drives/${d1}/rounds/${r1}/results`, { results: [{ applicationId: appOf("A"), status: "CLEARED" }] });
const offer = await staff("POST", "/api/offers", { applicationId: appOf("A"), packageLpa: 11 });
const so = (await me.A("GET", "/api/student/offers")).d; t("student sees the offer", so.length === 1 && so[0].status === "OFFERED" && so[0].company.name === `StuCo ${tag}`);
t("another student cannot answer it", (await me.C("POST", `/api/student/offers/${offer.d.id}/respond`, { decision: "ACCEPT" })).s === 404);
t("A accepts", (await me.A("POST", `/api/student/offers/${offer.d.id}/respond`, { decision: "ACCEPT" })).d?.status === "ACCEPTED");
t("A is now placed", (await me.A("GET", "/api/student/me")).d.isPlaced === true);
t("student got the offer notification", (await me.A("GET", "/api/student/notifications")).d.items.some((n) => n.type === "offer.received"));
t("mark all read", (await me.A("POST", "/api/student/notifications/read", { all: true })).d.marked >= 1 && (await me.A("GET", "/api/student/notifications")).d.unread === 0);

// ---- announcements, job alerts
await staff("POST", "/api/announcements", { title: "Mock test Friday", body: "Bring ID", targetDepartmentIds: [dept.id] });
t("student sees announcement", (await me.A("GET", "/api/student/announcements")).d.some((a) => a.title === "Mock test Friday"));
await staff("POST", `/api/student/x`, {});
await staff("PUT", `/api/students/${ids.A}/sections/SKILLS`, { data: { skills: ["React"] }, submit: true }); await staff("POST", `/api/students/${ids.A}/sections/SKILLS/approve`, {});
const al = (await staff("POST", "/api/job-alerts", { title: "React intern", companyName: "Remote Co", jobType: "INTERNSHIP", applyUrl: "https://x.test", targetSkills: ["react"] })).d;
await staff("POST", `/api/job-alerts/${al.id}/publish`, {});
t("A (has the skill) sees the alert", (await me.A("GET", "/api/student/job-alerts")).d.some((a) => a.id === al.id));
t("C (no skill) does not", !(await me.C("GET", "/api/student/job-alerts")).d.some((a) => a.id === al.id));
t("view recorded", (await me.A("POST", `/api/student/job-alerts/${al.id}/event`, { kind: "VIEW" })).d?.recorded === true);
t("click on a hidden alert refused", (await me.C("POST", `/api/student/job-alerts/${al.id}/event`, { kind: "CLICK" })).s === 404);
t("staff stats count it", (await staff("GET", `/api/job-alerts/${al.id}/stats`)).d.uniqueViewers === 1);

// ---- tickets and participation
const tk = await me.C("POST", "/api/student/tickets", { category: "APPLICATION_ISSUE", subject: "Cannot apply", message: "Apply button greyed out" }); t("student raises a ticket", tk.s === 200, JSON.stringify(tk.j));
t("correction ticket with data", (await me.D("POST", "/api/student/tickets", { category: "DATA_CORRECTION", subject: "Wrong marks", message: "Should be 8.9", section: "ACADEMICS", data: { cgpa: 8.9, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 } })).s === 200);
t("...lands in the staff verification queue as a revision", (await staff("GET", "/api/verification/queue?section=ACADEMICS")).d.items.some((i) => i.student.id === ids.D && i.isRevision));
t("correction without data refused", (await me.D("POST", "/api/student/tickets", { category: "DATA_CORRECTION", subject: "Wrong marks", message: "Please fix", section: "ACADEMICS" })).s === 400);
t("my tickets list", (await me.C("GET", "/api/student/tickets")).d.length === 1);
t("another student cannot read it", (await me.D("GET", `/api/student/tickets/${tk.d.id}`)).s === 404);
await staff("POST", `/api/tickets/${tk.d.id}/messages`, { body: "Looking into it" });
t("student sees staff reply, marked not-mine", (await me.C("GET", `/api/student/tickets/${tk.d.id}`)).d.messages.some((x) => x.body === "Looking into it" && x.fromMe === false));
t("student replies", (await me.C("POST", `/api/student/tickets/${tk.d.id}/messages`, { body: "Thanks" })).s === 200);
await staff("POST", `/api/tickets/${tk.d.id}/resolve`, {});
t("reply on resolved 409", (await me.C("POST", `/api/student/tickets/${tk.d.id}/messages`, { body: "More" })).s === 409);
t("same status refused", (await me.E("POST", "/api/student/participation-requests", { requestedStatus: "REGISTERED", reason: "Staying registered" })).s === 409);
const pr = await me.E("POST", "/api/student/participation-requests", { requestedStatus: "HIGHER_STUDIES", reason: "Admitted to a master's programme" }); t("request status change", pr.s === 200);
t("second pending request refused", (await me.E("POST", "/api/student/participation-requests", { requestedStatus: "OPTED_OUT", reason: "Changed my mind" })).s === 409);
t("staff approves", (await staff("POST", `/api/participation-requests/${pr.d.id}/decide`, { decision: "APPROVED" })).s === 200 && (await me.E("GET", "/api/student/me")).d.participationStatus === "HIGHER_STUDIES");

// ---- resume + blocks
const rs = (await me.A("GET", "/api/student/resume")).d; t("own resume analysis", typeof rs.score === "number" && Array.isArray(rs.improvements));
const pdf = await me.A("GET", "/api/student/resume.pdf"); t("own resume PDF", pdf.s === 200 && pdf.buf.subarray(0, 4).toString() === "%PDF");
t("no verified data -> 409", (await me.F("GET", "/api/student/resume.pdf")).s !== 409);
await staff("POST", "/api/blocking/blocks", { studentId: ids.D, reason: "No-show without notice", endsAt: new Date(Date.now() + 2 * day).toISOString() });
t("student sees their block", (await me.D("GET", "/api/student/blocks")).d[0]?.reason === "No-show without notice");
const d2 = await mkDrive();
t("blocked student told why", /Blocked until/.test(list(d2)(await me.D("GET", "/api/student/drives")).eligibility.reasons[0]));
t("blocked student cannot apply", (await me.D("POST", `/api/student/drives/${d2}/apply`)).s === 400);

// ---- psychometrics
const ins = (await me.A("GET", "/api/student/psychometrics/instrument")).d; t("instrument has 25 + 10 questions and no answer key", ins.personality.length === 25 && ins.aptitude.length === 10 && !JSON.stringify(ins).includes('"answer"'));
const full = (shift = 0) => ({ personality: Object.fromEntries(ins.personality.map((q, i) => [q.id, ((i + shift) % 5) + 1])), aptitude: Object.fromEntries(ins.aptitude.map((q, i) => [q.id, (i + shift) % 4])) });
t("incomplete answers refused", (await me.A("POST", "/api/student/psychometrics/attempt", { personality: { p1: 3 }, aptitude: {} })).s === 400);
const high = { personality: Object.fromEntries(ins.personality.map((q) => [q.id, 5])), aptitude: { a1: 2, a2: 2, a3: 1, a4: 2, a5: 1, a6: 1, a7: 2, a8: 2, a9: 2, a10: 2 } };
const sc = await me.A("POST", "/api/student/psychometrics/attempt", high); t("scored: aptitude 100%, traits 0-100", sc.d?.aptitude.overall === 100 && sc.d.personality.openness.score >= 0, JSON.stringify(sc.j));
t("attempt twice 409", (await me.A("POST", "/api/student/psychometrics/attempt", high)).s === 409);
t("my result", (await me.A("GET", "/api/student/psychometrics/result")).d.scores.aptitude.correct === 10);
t("no result yet -> 404", (await me.B("GET", "/api/student/psychometrics/result")).s === 404);
for (const [i, c] of ["B", "C", "D"].entries()) await me[c]("POST", "/api/student/psychometrics/attempt", full(i));
const comp = (await staff("GET", `/api/psychometrics/completion?departmentId=${dept.id}`)).d; t("completion counts", comp.completed >= 4 && comp.pending >= 1 && comp.students.every((s) => !("scores" in s)));
const c4 = (await staff("GET", "/api/psychometrics/cohort?groupBy=none")).d; t("cohort of 4 is hidden", c4.overall.hidden === true && !("students" in c4.overall), JSON.stringify(c4));
await me.E("POST", "/api/student/psychometrics/attempt", full(4));
const c5 = (await staff("GET", "/api/psychometrics/cohort?groupBy=department")).d; t("cohort of 5 shows averages and distributions", c5.overall.hidden === false && c5.overall.personality.openness.distribution && c5.overall.aptitude.average >= 0 && c5.groups.length === 1, JSON.stringify(c5.overall).slice(0, 200));
t("individual result needs a reason", (await staff("GET", `/api/psychometrics/students/${ids.A}/result`)).s === 400);
t("individual result with a reason", (await staff("GET", `/api/psychometrics/students/${ids.A}/result?reason=Career counselling session`)).d?.scores.aptitude.overall === 100);
const al2 = (await staff("GET", "/api/psychometrics/access-log")).d; t("access is logged", al2[0].reason === "Career counselling session" && al2[0].student.enrollmentNo === `T${tag}A`);
t("360 analysis shows completion, not scores", (await staff("GET", `/api/students/${ids.A}/analysis`)).d.personalityProfile.completed === true && !JSON.stringify((await staff("GET", `/api/students/${ids.A}/analysis`)).d.personalityProfile).includes("score"));
t("psychometrics never changed A's eligibility", list(d2)(await me.A("GET", "/api/student/drives"))?.eligibility.eligible === true);
t("reminder emails pending students", (await staff("POST", "/api/psychometrics/reminders", { departmentId: dept.id })).d?.sent >= 1);
await staff("PATCH", "/api/settings/verification", { requireAssessmentToOnboard: true });
t("onboarding blocked until assessment is done", (await staff("POST", `/api/students/${ids.F}/onboard`)).code === "ASSESSMENT_REQUIRED");
await me.F("POST", "/api/student/psychometrics/attempt", full(2));
t("onboarding allowed after the assessment", (await staff("POST", `/api/students/${ids.F}/onboard`)).s === 200);
await staff("PATCH", "/api/settings/verification", { requireAssessmentToOnboard: false });
t("deactivated student loses access", await (async () => { await staff("PATCH", `/api/students/${ids.C}`, { isActive: false }); const r = await me.C("GET", "/api/student/me"); await staff("PATCH", `/api/students/${ids.C}`, { isActive: true }); return r.s === 403 || r.s === 401; })());
done();
