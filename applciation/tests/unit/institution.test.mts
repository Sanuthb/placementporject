// Pure logic of M2 institution management: provisioning input, faculty/university validation, the faculty deny-by-default rule and navigation.
import assert from "node:assert/strict";
import { provisionInput, slugify } from "../../lib/provision";
import { isFacultyOnly } from "../../lib/auth/session";
import { allocationFields, profileFields } from "../../lib/faculty";
import { programCreate, universityBase } from "../../lib/api/academic";
import { rolesSchema } from "../../lib/api/staffRoles";
import { visibleNav } from "../../lib/web/nav";
import { checkMapping, MappingError, type Structure } from "../../lib/academicMapping";

let fails = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log("PASS", name); } catch (e) { fails++; console.log("FAIL", name, (e as Error).message.split("\n")[0]); } };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

t("faculty-only: FACULTY alone is faculty-only; any other role removes the restriction", () => {
  assert.ok(isFacultyOnly({ roles: ["FACULTY"] }));
  assert.ok(!isFacultyOnly({ roles: ["FACULTY", "PLACEMENT_OFFICER"] }));
  assert.ok(!isFacultyOnly({ roles: ["TPO_ADMIN"] }));
  assert.ok(!isFacultyOnly({ roles: [] }));
});
t("roles: FACULTY is accepted as a staff role, existing roles unchanged", () => {
  assert.deepEqual(rolesSchema.parse(["FACULTY"]), ["FACULTY"]);
  assert.deepEqual(rolesSchema.parse(["PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"]), ["PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"]);
  assert.throws(() => rolesSchema.parse(["PLATFORM_ADMIN"]));
});
t("navigation: faculty-only sees only the faculty pages (their students and roadmaps); officers and admins never see the faculty page", () => {
  const items = (roles: string[]) => visibleNav("staff", ["DRIVES", "ONBOARDING"], roles).flatMap((s) => s.items.map((i) => i.href));
  assert.deepEqual(items(["FACULTY"]), ["/staff/faculty", "/staff/roadmaps"]);
  // The roadmap list is for placement staff too, but through their own entry; a faculty-only login gets nothing else.
  assert.ok(items(["PLACEMENT_OFFICER"]).includes("/staff/roadmaps") && items(["TPO_ADMIN"]).includes("/staff/roadmaps"));
  assert.equal(items(["FACULTY", "PLACEMENT_OFFICER"]).filter((h) => h === "/staff/roadmaps").length, 1);
  assert.ok(!items(["PLACEMENT_OFFICER"]).includes("/staff/faculty"));
  assert.ok(!items(["TPO_ADMIN"]).includes("/staff/faculty"));
  assert.ok(items(["FACULTY", "PLACEMENT_OFFICER"]).includes("/staff/faculty") && items(["FACULTY", "PLACEMENT_OFFICER"]).includes("/staff/drives"));
  assert.ok(items(["TPO_ADMIN"]).includes("/staff/settings"));
});
t("provisioning: needs a name and an administrator; normalises the email; rejects a bad address", () => {
  const ok = provisionInput.parse({ name: "Acme Institute", admin: { name: "Asha", email: "Asha@Example.COM" } });
  assert.equal(ok.admin.email, "asha@example.com");
  assert.throws(() => provisionInput.parse({ name: "Acme Institute", admin: { name: "Asha", email: "nope" } }));
  assert.throws(() => provisionInput.parse({ name: "Ac", admin: { name: "Asha", email: "a@b.co" } }));
  assert.throws(() => provisionInput.parse({ name: "Acme Institute", slug: "Bad Slug!", admin: { name: "Asha", email: "a@b.co" } }));
});
t("provisioning: academic year must end after it starts; unknown modules refused", () => {
  const base = { name: "Acme Institute", admin: { name: "Asha", email: "a@b.co" } };
  assert.throws(() => provisionInput.parse({ ...base, academicYear: { name: "2026-27", startDate: "2027-01-01", endDate: "2026-01-01" } }));
  assert.ok(provisionInput.parse({ ...base, academicYear: { name: "2026-27", startDate: "2026-06-01", endDate: "2027-05-31" } }).academicYear);
  assert.throws(() => provisionInput.parse({ ...base, modules: ["NOT_A_MODULE"] }));
});
t("provisioning: slugs are url-safe", () => {
  assert.equal(slugify("St. Xavier's College, Mumbai!"), "st-xavier-s-college-mumbai");
  assert.equal(slugify("!!!"), "institution");
});
t("university: code upper-cased, website must be a URL", () => {
  assert.equal(universityBase.parse({ name: "Anna University", code: "au" }).code, "AU");
  assert.throws(() => universityBase.parse({ name: "Anna University", code: "AU", website: "not a url" }));
});
t("programme: accepts universityId and keeps the legacy university text", () => {
  const base = { name: "MCA Prog", code: "mca", departmentId: uuid(1) };
  assert.equal(programCreate.parse({ ...base, universityId: uuid(2) }).universityId, uuid(2));
  assert.equal(programCreate.parse({ ...base, university: "Old Text University" }).university, "Old Text University");
  assert.throws(() => programCreate.parse({ ...base, universityId: "x" }));
});
t("faculty: allocation ids must be uuids; profile fields optional", () => {
  assert.deepEqual(allocationFields.parse({}), {});
  assert.throws(() => allocationFields.parse({ departmentIds: ["x"] }));
  assert.equal(profileFields.parse({ employeeId: "E-1" }).employeeId, "E-1");
});
t("academic structure: a branch of another programme, a foreign semester and a mismatched department are refused", () => {
  const st: Structure = {
    departments: new Map([[uuid(1), { id: uuid(1), name: "CSE" }], [uuid(9), { id: uuid(9), name: "ECE" }]]),
    programs: new Map([[uuid(2), { id: uuid(2), name: "MCA", departmentId: uuid(1) }]]),
    branches: new Map([[uuid(3), { id: uuid(3), programId: uuid(99) }]]),
    batches: new Map([[uuid(4), { id: uuid(4), name: "MCA 26", programId: uuid(2), branchId: null }]]),
    semesters: new Map([[uuid(5), { id: uuid(5), batchId: uuid(98), academicYearId: null }]]),
    years: new Set(),
  };
  assert.throws(() => checkMapping(st, { departmentId: uuid(1), batchId: uuid(4), branchId: uuid(3) }), MappingError);
  assert.throws(() => checkMapping(st, { departmentId: uuid(1), batchId: uuid(4), semesterId: uuid(5) }), MappingError);
  assert.throws(() => checkMapping(st, { departmentId: uuid(9), batchId: uuid(4) }), MappingError);
  assert.equal(checkMapping(st, { departmentId: uuid(1), batchId: uuid(4) }).programId, uuid(2));
});

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
