// Seeds one demo login per role into the database and Supabase project named by .env (NOT .env.local).
// Usage: ALLOW_REMOTE_DB=I_UNDERSTAND_THIS_IS_NOT_LOCAL npx tsx scripts/seed-demo.ts
// Idempotent: existing auth users get their password reset to the demo password; rows are upserted.
import { loadEnvFiles } from "./lib/envFiles";
import { assertLocalTargets } from "../lib/localOnly";

loadEnvFiles(process.cwd(), process.env, [".env"]); // .env only, on purpose
assertLocalTargets(process.env, { what: "seed demo data" }); // needs ALLOW_REMOTE_DB for a hosted project
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { ModuleKey, PrismaClient, type Role } from "../generated/prisma/client";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Set ${k}`); return v; };
const PASSWORD = "Demo@12345678";
const COLLEGE = "Demo College";
const e = (n: string) => `${n}@demo-placement.example.com`;

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: need("DATABASE_URL") }) });
  const sb = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  async function authUser(email: string): Promise<string> {
    const c = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (c.data.user) return c.data.user.id;
    for (let page = 1; page < 20; page++) {
      const l = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      const u = l.data.users.find((x) => x.email?.toLowerCase() === email);
      if (u) { await sb.auth.admin.updateUserById(u.id, { password: PASSWORD, email_confirm: true }); return u.id; }
      if (l.data.users.length < 1000) break;
    }
    throw new Error(`Could not create or find ${email}: ${c.error?.message}`);
  }

  const slug = "demo-college";
  const college = await db.college.upsert({ where: { slug }, update: {}, create: { name: COLLEGE, slug } });
  for (const module of Object.values(ModuleKey)) {
    await db.collegeModule.upsert({ where: { collegeId_module: { collegeId: college.id, module } }, update: {}, create: { collegeId: college.id, module } });
  }
  for (const name of ["student-documents", "drive-documents", "offer-letters"]) {
    const b = await sb.storage.createBucket(name, { public: false });
    if (b.error && !/already exists/i.test(b.error.message)) throw b.error;
  }

  const dept = await db.department.upsert({ where: { collegeId_code: { collegeId: college.id, code: "CS" } }, update: {}, create: { collegeId: college.id, name: "Computer Science", code: "CS" } });
  const program = await db.program.findFirst({ where: { collegeId: college.id, code: "MCA" } })
    ?? await db.program.create({ data: { collegeId: college.id, name: "MCA", code: "MCA", departmentId: dept.id } });
  const batch = await db.batch.upsert({ where: { collegeId_name: { collegeId: college.id, name: "2025-2027" } }, update: {}, create: { collegeId: college.id, programId: program.id, name: "2025-2027", startYear: 2025, endYear: 2027, admissionYear: 2025 } });

  const staff: { key: string; name: string; role: Role; dept?: boolean }[] = [
    { key: "tpo.admin", name: "Demo TPO Admin", role: "TPO_ADMIN" },
    { key: "placement.officer", name: "Demo Placement Officer", role: "PLACEMENT_OFFICER" },
    { key: "dept.coordinator", name: "Demo Department Coordinator", role: "DEPARTMENT_COORDINATOR", dept: true },
    { key: "principal", name: "Demo Principal", role: "PRINCIPAL" },
    { key: "faculty", name: "Demo Faculty", role: "FACULTY" },
  ];
  const out: [string, string, string][] = [];
  for (const s of staff) {
    const email = e(s.key);
    const id = await authUser(email);
    await db.user.upsert({
      where: { id },
      update: { name: s.name, role: s.role, isActive: true },
      create: { id, collegeId: college.id, email, name: s.name, role: s.role, departmentId: s.dept ? dept.id : null },
    });
    if (s.role === "FACULTY") {
      await db.facultyProfile.upsert({ where: { userId: id }, update: {}, create: { userId: id, collegeId: college.id, designation: "Assistant Professor" } });
      await db.facultyDepartment.upsert({ where: { userId_departmentId: { userId: id, departmentId: dept.id } }, update: {}, create: { userId: id, departmentId: dept.id, collegeId: college.id } });
    }
    out.push([s.role, email, "/staff"]);
  }

  const sEmail = e("student");
  const sId = await authUser(sEmail);
  const existing = await db.student.findFirst({ where: { collegeId: college.id, email: sEmail } });
  const sData = { name: "Demo Student", userId: sId, departmentId: dept.id, programId: program.id, batchId: batch.id, onboardingStatus: "VERIFIED" as const, inviteStatus: "ACTIVATED" as const, stage: "ONBOARDED" as const, onboardedAt: new Date(), isActive: true, isArchived: false };
  if (existing) await db.student.update({ where: { id: existing.id }, data: sData });
  else await db.student.create({ data: { ...sData, collegeId: college.id, enrollmentNo: "DEMO001", email: sEmail, admissionYear: 2025 } });
  out.push(["STUDENT", sEmail, "/student"]);

  const company = await db.company.upsert({ where: { collegeId_name: { collegeId: college.id, name: "Demo Corp" } }, update: {}, create: { collegeId: college.id, name: "Demo Corp", industry: "Software" } });
  const rEmail = e("recruiter");
  const rId = await authUser(rEmail);
  await db.recruiter.upsert({ where: { id: rId }, update: { name: "Demo Recruiter", isActive: true }, create: { id: rId, collegeId: college.id, companyId: company.id, email: rEmail, name: "Demo Recruiter" } });
  out.push(["RECRUITER", rEmail, "/recruiter"]);

  const pEmail = e("platform.admin");
  const pId = await authUser(pEmail);
  await db.platformAdmin.upsert({ where: { id: pId }, update: { isActive: true }, create: { id: pId, email: pEmail, name: "Demo Platform Admin" } });
  out.push(["PLATFORM_ADMIN", pEmail, "/platform"]);

  console.log(`\nSeeded "${college.name}". Password for all: ${PASSWORD}\n`);
  for (const [r, em, p] of out) console.log(`${r.padEnd(24)} ${em.padEnd(46)} ${p}`);
  await db.$disconnect();
}
main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
