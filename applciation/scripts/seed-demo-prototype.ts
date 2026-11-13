// Prototype demo seed: TWO synthetic colleges, one individual account per role, generated passwords, sample departments / students / employers / drives / applications.
// All data is fictional. All e-mail addresses use the reserved example.com domain, so nothing can reach a real person.
//
// NOT RUN YET. It must only ever be pointed at a NEW, dedicated demo Supabase project, and only after explicit approval.
//
//   Dry run (no connection, prints the plan):   npx tsx scripts/seed-demo-prototype.ts --dry-run
//   Real run (after approval):                  ALLOW_REMOTE_DB=I_UNDERSTAND_THIS_IS_NOT_LOCAL npx tsx scripts/seed-demo-prototype.ts --env-file <path to an untracked env file for the DEMO project>
//
// Safety rules built in:
//  - reads ONLY the env file you name (never .env / .env.local by accident);
//  - refuses a non-local target unless ALLOW_REMOTE_DB is set, exactly like the other database scripts;
//  - refuses the existing project (ref in FORBIDDEN_REFS) even with the override;
//  - passwords are random per account and written to a git-ignored file (default .env.demo-credentials.json, matched by the `.env*` ignore rule), never printed;
//  - idempotent: re-running upserts rows and resets each account's password to a NEW random value.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { ModuleKey, PrismaClient } from "../generated/prisma/client";
import { loadEnvFiles } from "./lib/envFiles";
import { assertLocalTargets } from "../lib/localOnly";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const OUT = resolve(arg("--out") ?? ".env.demo-credentials.json");
const FORBIDDEN_REFS = ["pjyfzinhunaygqkdbfez"]; // the existing project: never a demo target

const DOMAIN = "demo-placement.example.com";
const COLLEGES = [
  { slug: "demo-college-a", name: "Demo College A (synthetic)", short: "a", dept: { name: "Computer Science", code: "CS" }, dept2: { name: "Electronics", code: "EC" }, company: { name: "Northwind Demo Software", industry: "Software" }, role: "Software Engineer Trainee" },
  { slug: "demo-college-b", name: "Demo College B (synthetic)", short: "b", dept: { name: "Mechanical Engineering", code: "ME" }, dept2: { name: "Civil Engineering", code: "CE" }, company: { name: "Contoso Demo Manufacturing", industry: "Manufacturing" }, role: "Graduate Engineer Trainee" },
] as const;
const STAFF = [
  { key: "tpo", name: "TPO Admin", role: "TPO_ADMIN" },
  { key: "officer", name: "Placement Officer", role: "PLACEMENT_OFFICER" },
  { key: "hod", name: "Department Coordinator", role: "DEPARTMENT_COORDINATOR", dept: true },
  { key: "principal", name: "Principal", role: "PRINCIPAL" },
  { key: "faculty", name: "Faculty Mentor", role: "FACULTY" },
] as const;
const STUDENTS_PER_COLLEGE = 6;
const email = (key: string, short: string) => `${key}.${short}@${DOMAIN}`;
const password = () => `${randomBytes(15).toString("base64url")}!9aA`; // 20+ chars, mixed case, digit, symbol

if (DRY) {
  console.log("DRY RUN: no connection is made, nothing is written.");
  for (const c of COLLEGES) {
    console.log(`\n${c.name} (${c.slug}): departments ${c.dept.code}, ${c.dept2.code}; employer "${c.company.name}"; ${STUDENTS_PER_COLLEGE} students; 2 drives (1 published, 1 draft); applications for the published drive`);
    for (const s of STAFF) console.log(`  ${s.role.padEnd(24)} ${email(s.key, c.short)}`);
    console.log(`  STUDENT                  student1..${STUDENTS_PER_COLLEGE}.${c.short}@${DOMAIN}`);
    console.log(`  RECRUITER                recruiter.${c.short}@${DOMAIN}`);
  }
  console.log(`\nPLATFORM_ADMIN           platform.admin@${DOMAIN}  (needs MFA enrolment at first sign-in)`);
  console.log(`Accounts: ${COLLEGES.length * (STAFF.length + STUDENTS_PER_COLLEGE + 1) + 1}. Credentials would be written to ${OUT}.`);
  process.exit(0);
}

const envFile = arg("--env-file");
if (!envFile) { console.error("Pass --env-file <path> naming an env file for the DEMO project (never the existing .env)."); process.exit(2); }
loadEnvFiles(dirname(resolve(envFile)), process.env, [basename(envFile)]);
assertLocalTargets(process.env, { what: "seed prototype demo data" });
for (const v of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_URL"]) for (const ref of FORBIDDEN_REFS) if ((process.env[v] ?? "").includes(ref)) { console.error(`Refusing: ${v} names the existing project. Use the new demo project.`); process.exit(2); }

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Set ${k}`); return v; };
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: need("DATABASE_URL") }) });
const sb = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const creds: { role: string; college: string; email: string; password: string; path: string }[] = [];

async function authUser(addr: string): Promise<{ id: string; pw: string }> {
  const pw = password();
  const c = await sb.auth.admin.createUser({ email: addr, password: pw, email_confirm: true });
  if (c.data.user) return { id: c.data.user.id, pw };
  for (let page = 1; page < 20; page++) {
    const l = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    const u = l.data.users.find((x) => x.email?.toLowerCase() === addr);
    if (u) { await sb.auth.admin.updateUserById(u.id, { password: pw, email_confirm: true }); return { id: u.id, pw }; }
    if (l.data.users.length < 1000) break;
  }
  throw new Error(`Could not create or find ${addr}: ${c.error?.message}`);
}
const addCred = (role: string, college: string, addr: string, pw: string, path: string) => creds.push({ role, college, email: addr, password: pw, path });
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  for (const name of ["student-documents", "drive-documents", "offer-letters"]) {
    const b = await sb.storage.createBucket(name, { public: false });
    if (b.error && !/already exists/i.test(b.error.message)) throw b.error;
  }

  for (const c of COLLEGES) {
    const college = await db.college.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: { name: c.name, slug: c.slug } });
    for (const key of Object.values(ModuleKey)) await db.collegeModule.upsert({ where: { collegeId_module: { collegeId: college.id, module: key } }, update: {}, create: { collegeId: college.id, module: key } });

    const dept = await db.department.upsert({ where: { collegeId_code: { collegeId: college.id, code: c.dept.code } }, update: {}, create: { collegeId: college.id, name: c.dept.name, code: c.dept.code } });
    await db.department.upsert({ where: { collegeId_code: { collegeId: college.id, code: c.dept2.code } }, update: {}, create: { collegeId: college.id, name: c.dept2.name, code: c.dept2.code } });
    const program = (await db.program.findFirst({ where: { collegeId: college.id, code: "BTECH" } })) ?? (await db.program.create({ data: { collegeId: college.id, name: "B.Tech", code: "BTECH", departmentId: dept.id } }));
    const batch = await db.batch.upsert({ where: { collegeId_name: { collegeId: college.id, name: "2023-2027" } }, update: {}, create: { collegeId: college.id, programId: program.id, name: "2023-2027", startYear: 2023, endYear: 2027, admissionYear: 2023 } });

    let tpoId = "";
    for (const s of STAFF) {
      const addr = email(s.key, c.short);
      const { id, pw } = await authUser(addr);
      await db.user.upsert({ where: { id }, update: { name: `${s.name} (${c.short.toUpperCase()})`, role: s.role, isActive: true }, create: { id, collegeId: college.id, email: addr, name: `${s.name} (${c.short.toUpperCase()})`, role: s.role, departmentId: "dept" in s ? dept.id : null } });
      if (s.role === "FACULTY") {
        await db.facultyProfile.upsert({ where: { userId: id }, update: {}, create: { userId: id, collegeId: college.id, designation: "Assistant Professor" } });
        await db.facultyDepartment.upsert({ where: { userId_departmentId: { userId: id, departmentId: dept.id } }, update: {}, create: { userId: id, departmentId: dept.id, collegeId: college.id } });
      }
      if (s.role === "TPO_ADMIN") tpoId = id;
      addCred(s.role, c.slug, addr, pw, "/staff");
    }

    const studentIds: string[] = [];
    for (let i = 1; i <= STUDENTS_PER_COLLEGE; i++) {
      const addr = `student${i}.${c.short}@${DOMAIN}`;
      const { id: userId, pw } = await authUser(addr);
      const data = { name: `Sample Student ${c.short.toUpperCase()}${i}`, userId, departmentId: dept.id, programId: program.id, batchId: batch.id, onboardingStatus: "VERIFIED" as const, inviteStatus: "ACTIVATED" as const, stage: "ONBOARDED" as const, onboardedAt: new Date(), isActive: true, isArchived: false };
      const found = await db.student.findFirst({ where: { collegeId: college.id, email: addr } });
      const st = found ? await db.student.update({ where: { id: found.id }, data }) : await db.student.create({ data: { ...data, collegeId: college.id, enrollmentNo: `DEMO-${c.short.toUpperCase()}-${String(i).padStart(3, "0")}`, email: addr, admissionYear: 2023 } });
      studentIds.push(st.id);
      addCred("STUDENT", c.slug, addr, pw, "/student");
    }

    const company = await db.company.upsert({ where: { collegeId_name: { collegeId: college.id, name: c.company.name } }, update: {}, create: { collegeId: college.id, name: c.company.name, industry: c.company.industry } });
    const rAddr = `recruiter.${c.short}@${DOMAIN}`;
    const r = await authUser(rAddr);
    await db.recruiter.upsert({ where: { id: r.id }, update: { name: `Sample Recruiter ${c.short.toUpperCase()}`, isActive: true }, create: { id: r.id, collegeId: college.id, companyId: company.id, email: rAddr, name: `Sample Recruiter ${c.short.toUpperCase()}` } });
    addCred("RECRUITER", c.slug, rAddr, r.pw, "/recruiter");

    // Drives are looked up by (college, company, role) so a re-run does not duplicate them.
    const mk = async (role: string, status: "PUBLISHED" | "DRAFT") =>
      (await db.drive.findFirst({ where: { collegeId: college.id, companyId: company.id, role } })) ??
      (await db.drive.create({ data: { collegeId: college.id, companyId: company.id, role, jobType: "FULL_TIME", location: "Remote (sample)", packageMinLpa: 4, packageMaxLpa: 6, description: "Synthetic demo drive. Not a real opening.", applicationDeadline: days(14), driveDate: days(21), status, publishedAt: status === "PUBLISHED" ? new Date() : null, createdById: tpoId } }));
    const open = await mk(c.role, "PUBLISHED");
    await mk(`${c.role} (draft)`, "DRAFT");
    const states = ["APPLIED", "SHORTLISTED", "APPLIED", "ON_HOLD", "REJECTED", "APPLIED"] as const;
    for (const [i, sid] of studentIds.entries()) {
      await db.application.upsert({ where: { driveId_studentId: { driveId: open.id, studentId: sid } }, update: {}, create: { collegeId: college.id, driveId: open.id, studentId: sid, status: states[i % states.length] } });
    }
    console.log(`Seeded ${c.name}`);
  }

  const pAddr = `platform.admin@${DOMAIN}`;
  const p = await authUser(pAddr);
  await db.platformAdmin.upsert({ where: { id: p.id }, update: { isActive: true }, create: { id: p.id, email: pAddr, name: "Platform Admin (synthetic)" } });
  addCred("PLATFORM_ADMIN", "-", pAddr, p.pw, "/platform");

  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), note: "Synthetic demo accounts. Delete after the demo.", accounts: creds }, null, 2), { mode: 0o600 });
  console.log(`\n${creds.length} accounts created. Credentials written to ${OUT} (not printed). Roles seeded per college: ${STAFF.map((s) => s.role).join(", ")}, STUDENT, RECRUITER; plus one PLATFORM_ADMIN.`);
  await db.$disconnect();
}
main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
