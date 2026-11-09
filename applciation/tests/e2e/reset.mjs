// Puts the demo/test database in the state the end-to-end suites expect. NEVER run against real data.
import { client, login } from "./lib.mjs";
import pg from "pg";

if (process.env.E2E_ALLOW !== "1") { console.error("Refusing to run: these tests create and delete data. Set E2E_ALLOW=1 and point .env at a TEST database."); process.exit(2); }
const c = new pg.Client({ connectionString: process.env.DIRECT_URL }); await c.connect();
// Tables whose contents change what the suites count (cohort sizes, block evaluations, audiences...).
for (const t of ["Block", "BlockPolicy", "AttendanceRecord", "AttendanceSession", "PsychAttempt", "AssessmentAttempt", "CounsellingSlot", "RateLimitBucket"]) await c.query(`delete from "${t}"`);
await c.query(`delete from "StudentSection" where section = 'SKILLS'`);
await c.end();

const staff = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
await staff("POST", "/api/settings/departments", { name: "Computer Science", code: "CSE" }); // 409 if it already exists: fine
// Batches are created from a programme now (see app/api/settings/batches): a 4-year programme admitted in 2021 gives the "2021-2025" batch the suites use.
const dept = (await staff("GET", "/api/settings/departments")).d.find((d) => d.code === "CSE");
await staff("POST", "/api/settings/programs", { name: "Bachelor of Engineering", code: "BE", departmentId: dept.id, level: "UG", durationYears: 4, semesterCount: 8 });
const prog = (await staff("GET", "/api/settings/programs")).d.find((p) => p.code === "BE");
await staff("POST", "/api/settings/batches", { programId: prog.id, admissionYear: 2021, name: "2021-2025" });
await staff("PATCH", "/api/settings/verification", { requiredSections: ["ACADEMICS", "PERSONAL"], requireAssessmentToOnboard: false });
await staff("PATCH", "/api/settings/policies", { approvalRequired: [], maxOffersPerStudent: 1, enforceTierUpgrade: false });
console.log("reset ok");
