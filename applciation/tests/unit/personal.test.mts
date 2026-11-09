// Personal details (M3 phase 1): what the PERSONAL section accepts, and what approving it writes onto the student record.
import assert from "node:assert/strict";
import { buildSections, computeMissing } from "../../lib/invitations/onboarding";
import { sectionSchemas } from "../../lib/verification";
import { joinAddress, MOBILE, personalSection, studentFieldsFromPersonal } from "../../lib/personal";

let fails = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log("PASS", name); } catch (e) { fails++; console.log("FAIL", name, (e as Error).message.split("\n")[0]); } };
const ok = (v: unknown) => personalSection.safeParse(v).success;
const msg = (v: unknown) => { const r = personalSection.safeParse(v); return r.success ? "" : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "); };

t("a normal personal section is accepted", () => assert.ok(ok({ fullName: "Asha Rao", dob: "2003-04-15", gender: "Female", phone: "+91 98765-43210", address: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001", linkedin: "https://www.linkedin.com/in/asha" })));
t("blank fields are allowed, so a draft with gaps can be saved", () => assert.ok(ok({ dob: "", phone: "", pincode: "", linkedin: "", alternateEmail: "" })));
t("a future date of birth is refused, with the reason", () => assert.match(msg({ dob: "2999-01-01" }), /future/));
t("an impossible or badly formatted date is refused", () => { assert.ok(!ok({ dob: "2003-02-31x" })); assert.ok(!ok({ dob: "15/04/2003" })); assert.ok(!ok({ dob: "not a date" })); });
t("a day that does not exist is refused", () => { assert.ok(!ok({ dob: "2003-02-31" })); assert.ok(!ok({ dob: "2003-04-31" })); assert.ok(!ok({ dob: "2003-02-29" })); assert.ok(ok({ dob: "2004-02-29" })); });
t("a date of birth before 1950 is refused", () => assert.ok(!ok({ dob: "1900-01-01" })));
t("mobile numbers: letters, too short and too long are refused", () => { assert.ok(!ok({ phone: "98abc" })); assert.ok(!ok({ phone: "12345" })); assert.ok(!ok({ phone: "1".repeat(20) })); });
t("the mobile rule is the one the wizard uses", () => { for (const v of ["9876543210", "+91 9876543210", "123-4567", "12345", "abcdefghij"]) assert.equal(MOBILE.test(v), ok({ phone: v }), v); });
t("alternate email and LinkedIn must be well formed when given", () => { assert.ok(!ok({ alternateEmail: "nope" })); assert.ok(!ok({ linkedin: "linkedin.com/in/x" })); assert.ok(ok({ alternateEmail: "a@b.co" })); });
t("postal codes of other countries are not forced into six digits", () => { assert.ok(ok({ pincode: "SW1A 1AA" })); assert.ok(ok({ pincode: "560001" })); assert.ok(!ok({ pincode: "!!" })); });
t("keys the platform does not know are kept, not rejected", () => { const r = personalSection.parse({ phone: "9876543210", somethingOld: "kept" }); assert.equal((r as Record<string, unknown>).somethingOld, "kept"); });
t("the section rule is wired into the verification engine for PERSONAL only", () => { assert.ok(!sectionSchemas.PERSONAL.safeParse({ dob: "2999-01-01" }).success); assert.ok(sectionSchemas.SKILLS.safeParse({ dob: "2999-01-01" }).success); });

t("what the wizard builds for verification passes the same validation", () => {
  const personal = { fullName: "Asha Rao", dob: "2003-04-15", gender: "Female", mobile: "9876543210", address: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };
  const s = buildSections({ personal, academics: { cgpa: 8, activeBacklogs: 0 }, career: { technicalSkills: [], programmingLanguages: [], careerInterests: [], preferredRoles: [], certifications: [], projects: [], internships: [] }, education: [], documents: [] });
  assert.ok(sectionSchemas.PERSONAL.safeParse(s.PERSONAL).success, msg(s.PERSONAL));
  const empty = buildSections({ personal: {}, academics: {}, career: { technicalSkills: [], programmingLanguages: [], careerInterests: [], preferredRoles: [], certifications: [], projects: [], internships: [] }, education: [], documents: [] });
  assert.ok(sectionSchemas.PERSONAL.safeParse(empty.PERSONAL).success, "all-blank wizard output must still be savable");
});
t("anything the wizard would call complete is accepted by the section rule", () => {
  const personal = { fullName: "Asha Rao", dob: "2003-04-15", mobile: "+91 98765 43210", address: "x", city: "y", state: "z", pincode: "560001" };
  const missing = computeMissing({ personal, academics: { cgpa: 0, activeBacklogs: 0 }, education: [], documents: [], declarationAccepted: true }).filter((m) => m.step === 2);
  assert.equal(missing.length, 0);
  assert.ok(ok({ ...personal, phone: personal.mobile }));
});

t("address is joined the way the onboarding submit joins it, and blanks are skipped", () => {
  assert.equal(joinAddress({ address: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" }), "12 MG Road, Bengaluru, Karnataka, 560001");
  assert.equal(joinAddress({ address: "12 MG Road", city: "", state: undefined, pincode: " " }), "12 MG Road");
  assert.equal(joinAddress({}), "");
});
t("approving writes phone, gender, date of birth and address to the student record", () => {
  const f = studentFieldsFromPersonal({ fullName: "Other Name", dob: "2003-04-15", gender: "Female", phone: " 9876543210 ", address: "12 MG Road", city: "Bengaluru" });
  assert.equal(f.phone, "9876543210"); assert.equal(f.gender, "Female"); assert.equal(f.address, "12 MG Road, Bengaluru");
  assert.equal(f.dateOfBirth?.toISOString().slice(0, 10), "2003-04-15");
});
t("the name is never written from the personal section", () => assert.ok(!("name" in studentFieldsFromPersonal({ fullName: "Someone Else", name: "Someone Else" }))));
t("a blank never erases what is on the record", () => assert.deepEqual(studentFieldsFromPersonal({ dob: "", phone: "", gender: "", address: "", city: "" }), {}));
t("an invalid stored date is ignored rather than written", () => assert.ok(!("dateOfBirth" in studentFieldsFromPersonal({ dob: "garbage" }))));

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
