// Invitation-based student onboarding: invite, accept, wizard, verification, expiry, bulk. Cleans up what it creates.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { B, checker, client, login, tag, upload } from "./lib.mjs";

const { t, done } = checker();
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL });
await pgc.connect();
const staff = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
const anon = (m, p, body) => fetch(B + p, { method: m, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => { const j = await r.json().catch(() => null); return { s: r.status, d: j?.data, code: j?.error?.code, j }; });
const tokenOf = (link) => new URLSearchParams(link.split("#")[1]).get("t");
const created = { students: [], authIds: [] };
const PDF = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF";

try {
  // --- structure to invite into
  const [batches, programs, depts] = await Promise.all(["batches", "programs", "departments"].map((x) => staff("GET", `/api/settings/${x}`).then((r) => r.d)));
  const batch = batches.find((b) => b.isActive && b.programId && programs.find((p) => p.id === b.programId)?.departmentId) ?? batches.find((b) => b.isActive);
  const program = programs.find((p) => p.id === batch.programId);
  const dept = depts.find((d) => d.id === program?.departmentId) ?? depts[0];
  const base = { departmentId: dept.id, batchId: batch.id, programId: batch.programId ?? null, admissionYear: batch.admissionYear ?? batch.startYear };
  const mk = (c, over = {}) => ({ name: `Inv Student ${c}`, enrollmentNo: `INV${tag}${c}`, email: `inv${tag}${c.toLowerCase()}@example.com`, ...base, ...over });

  // --- 1. creating an invitation
  t("invite: bad email rejected", (await staff("POST", "/api/students/invitations", mk("X", { email: "nope" }))).s === 400);
  t("invite: graduation before admission rejected", (await staff("POST", "/api/students/invitations", mk("X", { graduationYear: 1999 }))).s === 400);
  const a = await staff("POST", "/api/students/invitations", mk("A"));
  t("invite: created, email sent", a.s === 200 && a.d.emailSent === true, JSON.stringify(a.j));
  const idA = a.d.studentId; created.students.push(idA);
  const dup1 = await staff("POST", "/api/students/invitations", mk("A", { email: "other" + tag + "@example.com" }));
  t("invite: duplicate admission number blocked with a pending-invite hint", dup1.s === 409 && /invitation/i.test(dup1.j.error.message), JSON.stringify(dup1.j));
  t("invite: duplicate email blocked", (await staff("POST", "/api/students/invitations", mk("A", { enrollmentNo: "OTHER" + tag }))).s === 409);
  const inv = await staff("GET", `/api/students/${idA}/invitation`);
  t("invitation: status SENT with an email log", inv.d.invitation.status === "SENT" && inv.d.invitation.emails[0]?.status === "SENT", JSON.stringify(inv.j));
  t("invitation: response holds no token or link", !/token|#t=|\/invite/i.test(JSON.stringify(inv.j)));
  const rows = (await pgc.query(`select "tokenHash" from "StudentInvitation" where "studentId"=$1`, [idA])).rows[0];
  t("invitation: only a 64-char hash is stored", /^[0-9a-f]{64}$/.test(rows.tokenHash));
  const mail = (await pgc.query(`select * from "InvitationEmailLog" where "invitationId"=$1`, [inv.d.invitation.id])).rows[0];
  t("email log keeps no token", !JSON.stringify(mail).match(/#t=|invite#/));

  // --- 2. token handling
  const l1 = await staff("POST", `/api/students/${idA}/invitation/link`);
  const tok1 = tokenOf(l1.d.link);
  t("link: issues a fragment link", l1.s === 200 && /\/invite#t=[A-Za-z0-9_-]{43}$/.test(l1.d.link), l1.d?.link);
  t("lookup: garbage token gives a generic 410", (await anon("POST", "/api/invitations/lookup", { token: "x".repeat(43) })).s === 410);
  const look = await anon("POST", "/api/invitations/lookup", { token: tok1 });
  t("lookup: shows branding and assigned details, masks the email", look.s === 200 && look.d.institution.name && look.d.assigned.admissionNumber === `INV${tag}A` && look.d.emailHint.includes("*") && !JSON.stringify(look.d).includes(`inv${tag}a@`), JSON.stringify(look.j));
  const l2 = await staff("POST", `/api/students/${idA}/invitation/link`);
  const tok2 = tokenOf(l2.d.link);
  t("link: issuing a new link kills the old one", (await anon("POST", "/api/invitations/lookup", { token: tok1 })).s === 410 && (await anon("POST", "/api/invitations/lookup", { token: tok2 })).s === 200);

  // --- 3. acceptance
  const email = `inv${tag}a@example.com`, pw = `Stud-${tag}-pw1`;
  t("accept: wrong email refused", (await anon("POST", "/api/invitations/accept", { token: tok2, email: "someone@else.com", password: pw })).code === "EMAIL_MISMATCH");
  t("accept: weak password refused", (await anon("POST", "/api/invitations/accept", { token: tok2, email, password: "short" })).s === 400);
  const acc = await anon("POST", "/api/invitations/accept", { token: tok2, email, password: pw });
  t("accept: succeeds with the invited email", acc.s === 200 && acc.d.accepted === true, JSON.stringify(acc.j));
  t("accept: single use (second try is refused)", (await anon("POST", "/api/invitations/accept", { token: tok2, email, password: pw })).s === 410);
  t("accept: lookup is refused afterwards", (await anon("POST", "/api/invitations/lookup", { token: tok2 })).s === 410);
  const st = (await pgc.query(`select "userId","onboardingStatus","inviteStatus" from "Student" where id=$1`, [idA])).rows[0];
  if (st.userId) created.authIds.push(st.userId);
  t("accept: login linked to the same student record, status Invitation Accepted", !!st.userId && st.onboardingStatus === "INVITATION_ACCEPTED" && st.inviteStatus === "ACTIVATED", JSON.stringify(st));
  t("accept: no second student created", (await pgc.query(`select count(*)::int n from "Student" where email=$1`, [email])).rows[0].n === 1);
  t("accept: resend after acceptance refused", (await staff("POST", `/api/students/${idA}/invitation/resend`)).s === 409);

  // --- 4. the wizard
  const me = client(await login(email, pw));
  const w0 = await me("GET", "/api/student/onboarding");
  t("wizard: loads assigned details read-only", w0.s === 200 && w0.d.assigned.admissionNumber === `INV${tag}A` && w0.d.status === "INVITATION_ACCEPTED" && w0.d.editable, JSON.stringify(w0.j)?.slice(0, 300));
  const sub0 = await me("POST", "/api/student/onboarding/submit");
  t("submit: refused while required information is missing, and says what", sub0.s === 400 && sub0.code === "INCOMPLETE" && sub0.j.error.details.length > 3, JSON.stringify(sub0.j)?.slice(0, 300));
  const personal = { fullName: `Inv Student A Renamed`, dob: "2003-04-05", gender: "Female", mobile: "9876543210", address: "12 Main Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };
  const save = await me("PUT", "/api/student/onboarding", { currentStep: 2, personal, academics: { cgpa: 8.2, activeBacklogs: 0 }, career: { summary: "Keen learner", technicalSkills: ["SQL"], programmingLanguages: ["Python"], projects: [{ title: "Portal" }] } });
  t("wizard: draft saved, status Profile In Progress", save.s === 200 && save.d.status === "PROFILE_IN_PROGRESS" && save.d.currentStep === 2, JSON.stringify(save.j)?.slice(0, 200));
  t("wizard: a different name is held for review, not written over the record", save.d.nameReview?.entered === "Inv Student A Renamed" && (await pgc.query(`select name from "Student" where id=$1`, [idA])).rows[0].name === "Inv Student A", JSON.stringify(save.d.nameReview));
  const again = await me("GET", "/api/student/onboarding");
  t("wizard: progress survives a reload", again.d.personal.city === "Bengaluru" && again.d.currentStep === 2 && again.d.career.technicalSkills[0] === "SQL");
  t("education: a record needs level and institution", (await me("POST", "/api/student/education", { level: "School" })).s === 400);
  t("education: completion before admission refused", (await me("POST", "/api/student/education", { level: "School", qualification: "SSLC", institution: "X", admissionYear: 2018, completionYear: 2010 })).s === 400);
  const e10 = await me("POST", "/api/student/education", { level: "School", qualification: "SSLC", institution: "Govt High School", boardOrUniversity: "KSEEB", completionYear: 2018, percentage: 88 });
  const e12 = await me("POST", "/api/student/education", { level: "Higher Secondary", qualification: "PUC", institution: "Sri PU College", boardOrUniversity: "PU Board", completionYear: 2020, percentage: 84, backlogs: 0 });
  t("education: SSLC and PUC added", e10.s === 200 && e12.s === 200, JSON.stringify([e10.j, e12.j]));
  const miss1 = (await me("GET", "/api/student/onboarding")).d;
  t("documents: SSLC and PUC marks cards become required", miss1.requiredDocuments.includes("TENTH_MARKS") && miss1.requiredDocuments.includes("TWELFTH_MARKS") && miss1.missing.some((m) => m.field === "doc:TENTH_MARKS"));
  const fake = new FormData(); fake.append("category", "TENTH_MARKS"); fake.append("file", new Blob(["not really a pdf"], { type: "application/pdf" }), "fake.pdf");
  t("documents: content that does not match its type is refused", (await me("POST", "/api/student/documents", null, fake)).s === 400);
  const txt = new FormData(); txt.append("category", "TENTH_MARKS"); txt.append("file", new Blob(["hello"], { type: "text/plain" }), "x.txt");
  t("documents: unsupported type refused", (await me("POST", "/api/student/documents", null, txt)).s === 400);
  const up = async (cat, name) => { const f = new FormData(); f.append("category", cat); f.append("file", new Blob([PDF], { type: "application/pdf" }), name); return me("POST", "/api/student/documents", null, f); };
  const d10 = await up("TENTH_MARKS", "sslc.pdf"), d12 = await up("TWELFTH_MARKS", "puc.pdf");
  t("documents: PDFs uploaded as PENDING", d10.s === 200 && d12.s === 200 && d10.d.status === "PENDING", JSON.stringify([d10.j, d12.j]));
  const docs = (await me("GET", "/api/student/documents")).d;
  t("documents: listed with private signed links", docs.length === 2 && docs.every((d) => d.url && d.url.includes("token")));
  t("submit: still blocked until the declaration is accepted", (await me("POST", "/api/student/onboarding/submit")).s === 400);
  await me("PUT", "/api/student/onboarding", { acceptDeclaration: true });
  const sub = await me("POST", "/api/student/onboarding/submit");
  t("submit: accepted, status Submitted for Verification", sub.s === 200 && sub.d.status === "SUBMITTED", JSON.stringify(sub.j));
  t("submit: nothing is verified by submitting", (await pgc.query(`select count(*)::int n from "StudentSection" where "studentId"=$1 and status='VERIFIED'`, [idA])).rows[0].n === 0);
  t("submit: profile is locked afterwards", (await me("PUT", "/api/student/onboarding", { personal })).code === "LOCKED" && (await me("POST", "/api/student/education", { level: "School", qualification: "a", institution: "bb" })).code === "LOCKED");
  const stRow = (await pgc.query(`select phone,"dateOfBirth",gender,address from "Student" where id=$1`, [idA])).rows[0];
  t("submit: contact details copied to the student record", stRow.phone === "9876543210" && String(stRow.address).includes("Bengaluru") && !!stRow.dateOfBirth);
  t("submit: staff were notified", (await pgc.query(`select count(*)::int n from "Notification" where type='onboarding.submitted' and link like $1`, [`%${idA}`])).rows[0].n > 0);

  // --- 5. verification
  const rev = await staff("GET", `/api/students/${idA}/onboarding`);
  t("review: staff see everything the student entered and the documents", rev.s === 200 && rev.d.profile.personal.city === "Bengaluru" && rev.d.documents.length === 2 && rev.d.education.length === 2 && rev.d.sections.length >= 7, JSON.stringify(rev.j)?.slice(0, 200));
  await staff("POST", `/api/students/${idA}/onboarding/start-review`);
  t("review: opening it moves to Verification in Progress", (await pgc.query(`select "onboardingStatus" s from "Student" where id=$1`, [idA])).rows[0].s === "VERIFICATION_IN_PROGRESS");
  const v1 = await staff("POST", `/api/students/${idA}/onboarding/verify`, {});
  t("verify: blocked until the different name is decided", v1.code === "NAME_REVIEW_REQUIRED", JSON.stringify(v1.j));
  const v2 = await staff("POST", `/api/students/${idA}/onboarding/verify`, { nameDecision: "keep" });
  t("verify: blocked while documents are pending (and the name decision rolls back)", v2.code === "DOCUMENTS_OPEN" && (await pgc.query(`select "nameDecidedAt" d from "StudentOnboardingProfile" where "studentId"=$1`, [idA])).rows[0].d === null, JSON.stringify(v2.j));
  const rej = await staff("PATCH", `/api/students/${idA}/documents/${d12.d.id}`, { status: "REJECTED", rejectReason: "Marks card is cut off" });
  t("documents: a verifier can reject one with a reason", rej.s === 200 && rej.d.status === "REJECTED");
  t("documents: profile status is independent of document status", (await pgc.query(`select "onboardingStatus" s from "Student" where id=$1`, [idA])).rows[0].s === "VERIFICATION_IN_PROGRESS");
  const ch = await staff("POST", `/api/students/${idA}/onboarding/request-corrections`, { comment: "Please re-upload the PUC marks card." });
  t("corrections: requested with a comment", ch.s === 200 && ch.d.status === "CHANGES_REQUESTED", JSON.stringify(ch.j));
  const w1 = (await me("GET", "/api/student/onboarding")).d;
  t("corrections: student sees the comment and can edit again", w1.status === "CHANGES_REQUESTED" && w1.editable && w1.reviewNote.includes("PUC") && w1.sections.some((s) => s.status === "CHANGES_REQUESTED") && w1.missing.some((m) => m.field.startsWith("rejected:")), JSON.stringify(w1.missing));
  t("corrections: student was notified", (await pgc.query(`select count(*)::int n from "Notification" where type='onboarding.changes' and "studentId"=$1`, [idA])).rows[0].n > 0);
  const gone = await me("DELETE", `/api/student/documents/${d12.d.id}`);
  const d12b = await up("TWELFTH_MARKS", "puc-full.pdf");
  t("corrections: student replaces the rejected document", gone.s === 200 && d12b.s === 200);
  const re = await me("POST", "/api/student/onboarding/submit");
  t("corrections: resubmitted", re.s === 200, JSON.stringify(re.j));
  t("verify: blocked while the new document is unreviewed", (await staff("POST", `/api/students/${idA}/onboarding/verify`, { nameDecision: "keep" })).code === "DOCUMENTS_OPEN");
  for (const d of (await staff("GET", `/api/students/${idA}/documents`)).d) await staff("PATCH", `/api/students/${idA}/documents/${d.id}`, { status: "VERIFIED" });
  const vf = await staff("POST", `/api/students/${idA}/onboarding/verify`, { nameDecision: "keep", comment: "All good" });
  t("verify: profile verified after approval", vf.s === 200 && vf.d.status === "VERIFIED", JSON.stringify(vf.j));
  const fin = (await pgc.query(`select name,"onboardingStatus" s,stage from "Student" where id=$1`, [idA])).rows[0];
  t("verify: invited name kept, stage verified, status Verified", fin.name === "Inv Student A" && fin.s === "VERIFIED" && fin.stage === "VERIFIED", JSON.stringify(fin));
  const hist = await staff("GET", `/api/students/${idA}/history`);
  const acts = hist.d.items.map((i) => i.action);
  t("audit: invite, accept, submit, changes, verify all recorded", ["student.invite", "student.invitation.accept", "student.onboarding.submit", "student.verification.changes", "student.verification.verify", "student.invitation.link", "student.name.review"].every((x) => acts.includes(x)), acts.join(","));
  t("verify: verifying twice is refused", (await staff("POST", `/api/students/${idA}/onboarding/verify`, {})).s === 409);

  // --- 6. access control
  const b = await staff("POST", "/api/students/invitations", mk("B")); created.students.push(b.d.studentId);
  const lB = tokenOf((await staff("POST", `/api/students/${b.d.studentId}/invitation/link`)).d.link);
  const emailB = `inv${tag}b@example.com`;
  await anon("POST", "/api/invitations/accept", { token: lB, email: emailB, password: pw });
  const meB = client(await login(emailB, pw));
  t("access: another student cannot delete my documents", (await meB("DELETE", `/api/student/documents/${d10.d.id}`)).s === 404);
  t("access: another student's list shows none of mine", (await meB("GET", "/api/student/documents")).d.length === 0 && (await meB("GET", "/api/student/education")).d.length === 0);
  t("access: a student cannot use staff verification", (await meB("POST", `/api/students/${idA}/onboarding/verify`, {})).s === 401 || (await meB("POST", `/api/students/${idA}/onboarding/verify`, {})).s === 403);
  t("access: student cannot read staff review data", [401, 403].includes((await meB("GET", `/api/students/${idA}/onboarding`)).s));
  t("access: staff cannot be used on the student onboarding api", [401, 403].includes((await staff("GET", "/api/student/onboarding")).s));

  // --- 7. expiry, resend, revoke
  const c = await staff("POST", "/api/students/invitations", mk("C")); created.students.push(c.d.studentId);
  const tokC = tokenOf((await staff("POST", `/api/students/${c.d.studentId}/invitation/link`)).d.link);
  await pgc.query(`update "StudentInvitation" set "expiresAt"=now()-interval '1 hour' where "studentId"=$1`, [c.d.studentId]);
  const exp = await anon("POST", "/api/invitations/lookup", { token: tokC });
  t("expiry: an expired invitation says so", exp.s === 410 && exp.code === "INVITATION_EXPIRED");
  t("expiry: an expired invitation cannot activate an account", (await anon("POST", "/api/invitations/accept", { token: tokC, email: `inv${tag}c@example.com`, password: pw })).code === "INVITATION_EXPIRED" && (await pgc.query(`select "userId" u from "Student" where id=$1`, [c.d.studentId])).rows[0].u === null);
  t("expiry: student shows Invitation Expired", (await pgc.query(`select "onboardingStatus" s from "Student" where id=$1`, [c.d.studentId])).rows[0].s === "INVITATION_EXPIRED");
  const rs = await staff("POST", `/api/students/${c.d.studentId}/invitation/resend`);
  t("resend: a fresh invitation is emailed", rs.s === 200 && rs.d.emailSent === true, JSON.stringify(rs.j));
  t("resend: the old token stays dead", (await anon("POST", "/api/invitations/lookup", { token: tokC })).s === 410);
  const rv = await staff("POST", `/api/students/${c.d.studentId}/invitation/revoke`);
  const tokC2 = tokenOf((await staff("POST", `/api/students/${c.d.studentId}/invitation/link`)).d.link);
  await staff("POST", `/api/students/${c.d.studentId}/invitation/revoke`);
  t("revoke: a revoked invitation cannot be used", rv.s === 200 && (await anon("POST", "/api/invitations/lookup", { token: tokC2 })).s === 410 && (await anon("POST", "/api/invitations/accept", { token: tokC2, email: `inv${tag}c@example.com`, password: pw })).s === 410);

  // --- 8. wrong-email lockout
  const d = await staff("POST", "/api/students/invitations", mk("D")); created.students.push(d.d.studentId);
  const tokD = tokenOf((await staff("POST", `/api/students/${d.d.studentId}/invitation/link`)).d.link);
  let last; for (let i = 0; i < 6; i++) last = await anon("POST", "/api/invitations/accept", { token: tokD, email: "guess@else.com", password: pw });
  t("lockout: repeated wrong emails lock the invitation", last.code === "INVITATION_LOCKED", last.code);
  t("lockout: even the right email is refused until a new invitation is issued", (await anon("POST", "/api/invitations/accept", { token: tokD, email: `inv${tag}d@example.com`, password: pw })).code === "INVITATION_LOCKED");

  // --- 9. bulk
  const csv = [
    "Admission Number,Student Name,Email,Department,Programme,Branch,Admission Year,Batch",
    `BULK${tag}1,Bulk One,bulk${tag}1@example.com,${dept.code},${program?.code ?? ""},,${base.admissionYear},${batch.name}`,
    `BULK${tag}2,Bulk Two,bulk${tag}2@example.com,${dept.code},${program?.code ?? ""},,${base.admissionYear},${batch.name}`,
    `BULK${tag}1,Bulk Dup,bulk${tag}9@example.com,${dept.code},${program?.code ?? ""},,${base.admissionYear},${batch.name}`,
    `BULK${tag}3,Bulk BadMail,not-an-email,${dept.code},${program?.code ?? ""},,${base.admissionYear},${batch.name}`,
    `BULK${tag}4,Bulk BadBatch,bulk${tag}4@example.com,${dept.code},${program?.code ?? ""},,${base.admissionYear},No Such Batch`,
    `,Bulk NoNumber,bulk${tag}5@example.com,${dept.code},${program?.code ?? ""},,${base.admissionYear},${batch.name}`,
  ].join("\n");
  const pv = await staff("POST", "/api/students/import/preview", null, upload("bulk.csv", csv));
  t("bulk: preview maps the new columns", pv.s === 200 && pv.d.fields.some((f) => f.key === "admission_year") && !pv.d.fields.some((f) => f.key === "phone" || f.key === "date_of_birth"), JSON.stringify(pv.j)?.slice(0, 200));
  const rowsR = await staff("GET", `/api/students/import/${pv.d.jobId}/rows`);
  t("bulk: 2 valid, 1 duplicate, 3 invalid", rowsR.d.counts.ready === 2 && rowsR.d.counts.skipped === 1 && rowsR.d.counts.invalid === 3, JSON.stringify(rowsR.d.counts));
  const reasons = rowsR.d.items.flatMap((x) => x.reasons).join(" | ");
  t("bulk: reasons name the problem (email, batch, missing number)", /email/i.test(reasons) && /batch/i.test(reasons) && /admission number/i.test(reasons), reasons);
  const cf = await staff("POST", `/api/students/import/${pv.d.jobId}/confirm`);
  t("bulk: confirm creates only the valid rows", cf.s === 200 && cf.d.created === 2, JSON.stringify(cf.j));
  const bulk = (await pgc.query(`select s.id, i.status from "Student" s join "StudentInvitation" i on i."studentId"=s.id where s."enrollmentNo" like $1`, [`BULK${tag}%`])).rows;
  bulk.forEach((r) => created.students.push(r.id));
  t("bulk: each valid row has an invitation", bulk.length === 2);
  let sent = 0;
  for (let i = 0; i < 20 && sent < 2; i++) { await new Promise((r) => setTimeout(r, 1000)); sent = (await pgc.query(`select count(*)::int n from "InvitationEmailLog" l join "StudentInvitation" i on i.id=l."invitationId" join "Student" s on s.id=i."studentId" where s."enrollmentNo" like $1 and l.status='SENT'`, [`BULK${tag}%`])).rows[0].n; }
  t("bulk: emails are sent after the response, each logged", sent === 2, String(sent));
  t("bulk: invitation status Sent once the email goes out", (await pgc.query(`select count(*)::int n from "StudentInvitation" i join "Student" s on s.id=i."studentId" where s."enrollmentNo" like $1 and i.status='SENT'`, [`BULK${tag}%`])).rows[0].n === 2);

  // --- 10. dashboard
  const sum = await staff("GET", "/api/students/summary");
  t("dashboard: summary has the six onboarding numbers", sum.s === 200 && ["invitationsSent", "pendingAcceptance", "profileInProgress", "pendingVerification", "verified"].every((k) => typeof sum.d.onboarding[k] === "number") && typeof sum.d.total === "number", JSON.stringify(sum.j)?.slice(0, 300));
  const f1 = await staff("GET", `/api/students?q=INV${tag}&profileStatus=VERIFIED`);
  t("dashboard: filter by profile status", f1.d.items.length === 1 && f1.d.items[0].enrollmentNo === `INV${tag}A`);
  const f2 = await staff("GET", `/api/students?q=INV${tag}&invitationStatus=REVOKED`);
  t("dashboard: filter by invitation status", f2.d.items.length === 1 && f2.d.items[0].enrollmentNo === `INV${tag}C`);
  const f3 = await staff("GET", `/api/students?q=INV${tag}&verificationStatus=VERIFIED`);
  t("dashboard: filter by verification status", f3.d.items.length === 1);
  const row = (await staff("GET", `/api/students?q=INV${tag}A`)).d.items[0];
  t("dashboard: rows carry invitation, onboarding status and last activity", row.invitation?.status === "ACCEPTED" && row.onboardingStatus === "VERIFIED" && !!row.lastActivityAt, JSON.stringify(row)?.slice(0, 300));
  t("dashboard: bad filter value rejected", (await staff("GET", "/api/students?profileStatus=NOPE")).s === 400);

  // --- 11. settings
  const set = await staff("PATCH", "/api/settings/invitations", { inviteExpiryDays: 3 });
  const e = await staff("POST", "/api/students/invitations", mk("E")); created.students.push(e.d.studentId);
  const days = Number((await pgc.query(`select extract(epoch from ("expiresAt" - (now() at time zone 'UTC')))/86400 as d from "StudentInvitation" where "studentId"=$1`, [e.d.studentId])).rows[0].d);
  t("settings: expiry period is configurable", set.s === 200 && days > 2.9 && days < 3.1, String(days));
  await staff("PATCH", "/api/settings/invitations", { inviteExpiryDays: 7 });
} finally {
  // clean up everything this run created
  try {
    if (created.students.length) {
      const paths = (await pgc.query(`select "storagePath" p from "StudentDocument" where "studentId" = any($1)`, [created.students])).rows.map((r) => r.p);
      if (paths.length) await admin.storage.from("student-documents").remove(paths).catch(() => {});
      await pgc.query(`delete from "Student" where id = any($1)`, [created.students]);
    }
    await pgc.query(`delete from "Notification" where "studentId" = any($1)`, [created.students]).catch(() => {});
    for (const id of created.authIds) await admin.auth.admin.deleteUser(id).catch(() => {});
    const left = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of left.data?.users ?? []) if (u.email?.startsWith(`inv${tag}`)) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  } finally { await pgc.end(); }
}
process.exit(done() ? 1 : 0);
