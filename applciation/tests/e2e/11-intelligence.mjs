// Student 360° intelligence: scores come from records, gaps are honest, nothing personal is exposed. Cleans up what it creates.
import pg from "pg";
import { checker, client, login, tag } from "./lib.mjs";

const { t, done } = checker();
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL });
await pgc.connect();
const staff = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
const ids = [];
try {
  const [batches, programs, depts] = await Promise.all(["batches", "programs", "departments"].map((x) => staff("GET", `/api/settings/${x}`).then((r) => r.d)));
  const batch = batches.find((b) => b.isActive && b.programId && programs.find((p) => p.id === b.programId)?.departmentId) ?? batches.find((b) => b.isActive);
  const dept = depts.find((d) => d.id === programs.find((p) => p.id === batch.programId)?.departmentId) ?? depts[0];
  const a = await staff("POST", "/api/students/invitations", { name: `Intel ${tag}`, enrollmentNo: `INT${tag}`, email: `intel${tag}@example.com`, departmentId: dept.id, batchId: batch.id, programId: batch.programId ?? null, admissionYear: batch.admissionYear ?? batch.startYear });
  const id = a.d.studentId; ids.push(id);

  const empty = await staff("GET", `/api/students/${id}/intelligence`);
  const dims = empty.d?.evidence?.dimensions ?? [];
  t("intelligence: loads for a student with no data", empty.s === 200 && dims.length >= 8, JSON.stringify(empty.j)?.slice(0, 200));
  t("intelligence: every dimension is separate and there is no overall score", ["academics", "aptitude", "personality", "disc", "riasec", "technical", "communication", "experience", "preferences"].every((k) => dims.some((d) => d.key === k)) && !("overall" in empty.d.evidence) && !dims.some((d) => d.key === "overall"));
  t("intelligence: no data means no score, and the gap is said", dims.every((d) => d.kind === "none" && d.score === null) && dims.every((d) => d.gaps.length > 0), JSON.stringify(dims.map((d) => [d.key, d.kind, d.score])));
  t("intelligence: no reading exists yet, and AI availability is reported", empty.d.report === null && typeof empty.d.aiConfigured === "boolean");
  t("intelligence: no name, email or phone in the evidence", !JSON.stringify(empty.d.evidence).match(new RegExp(`Intel ${tag}|intel${tag}@|9876543210`)));
  t("intelligence: the behavioural-style (DISC) and career-interest (RIASEC) tests are honestly marked as not taken yet (the M4 instruments replaced the old 'No DISC / No RIASEC' wording)", /not taken yet/.test(dims.find((d) => d.key === "disc").gaps[0]) && /not taken yet/.test(dims.find((d) => d.key === "riasec").gaps[0]), JSON.stringify([dims.find((d) => d.key === "disc").gaps, dims.find((d) => d.key === "riasec").gaps]));

  // Give the student declared marks (as submitted data) and see the scores appear, marked as unverified.
  await pgc.query(`insert into "StudentSection" (id,"collegeId","studentId",section,status,data,"updatedAt") select gen_random_uuid(), "collegeId", id, 'ACADEMICS', 'SUBMITTED', $2::jsonb, now() from "Student" where id=$1`, [id, JSON.stringify({ cgpa: 8, tenthPercentage: 90, twelfthPercentage: 80, activeBacklogs: 1 })]);
  await pgc.query(`insert into "StudentSection" (id,"collegeId","studentId",section,status,data,"updatedAt") select gen_random_uuid(), "collegeId", id, 'SKILLS', 'SUBMITTED', $2::jsonb, now() from "Student" where id=$1`, [id, JSON.stringify({ skills: ["SQL"], programmingLanguages: ["Python"], careerInterests: ["Data"], preferredRoles: ["Analyst"] })]);
  const w = await staff("GET", `/api/students/${id}/intelligence`);
  const ac = w.d.evidence.dimensions.find((d) => d.key === "academics");
  // (0.5*80 + 0.25*80 + 0.15*90) / 0.9 = 81.67, minus 5 for one backlog = 76.67
  t("academics: score is computed by code from the marks (blend minus backlog penalty)", ac.kind === "measured" && Math.abs(ac.score - 76.7) < 0.2, JSON.stringify(ac.score));
  t("academics: unverified marks are flagged and capped at medium confidence", ac.confidence === "medium" && ac.gaps.some((g) => /not yet verified/.test(g)) && ac.items.every((i) => i.verified === false));
  const tech = w.d.evidence.dimensions.find((d) => d.key === "technical");
  t("technical: self-declared skills get no invented score", tech.kind === "declared" && tech.score === null && tech.items[0].value.includes("SQL") && tech.gaps[0].includes("Self-declared"));
  t("preferences: declared interests are carried", w.d.evidence.dimensions.find((d) => d.key === "preferences").items.length === 2);
  t("aptitude and personality stay empty without an assessment", ["aptitude", "personality"].every((k) => w.d.evidence.dimensions.find((d) => d.key === k).score === null));

  // Personality is consent-gated: results exist but the student has not agreed to share.
  await pgc.query(`insert into "PsychAttempt" (id,"collegeId","studentId","instrumentVersion",answers,scores) select gen_random_uuid(), "collegeId", id, '1.0', '{}'::jsonb, $2::jsonb from "Student" where id=$1`, [id, JSON.stringify({ personality: { openness: { score: 80, band: "high", meaning: "" }, conscientiousness: { score: 60, band: "moderate", meaning: "" }, extraversion: { score: 40, band: "moderate", meaning: "" }, agreeableness: { score: 70, band: "high", meaning: "" }, emotional_stability: { score: 55, band: "moderate", meaning: "" } }, aptitude: { overall: 70, correct: 7, total: 10, byArea: { numerical: 75, verbal: 67, logical: 67 } } })]);
  const hidden = (await staff("GET", `/api/students/${id}/intelligence`)).d.evidence.dimensions;
  t("consent: personality and aptitude from the built-in test stay hidden until the student shares", hidden.find((d) => d.key === "personality").items.length === 0 && hidden.find((d) => d.key === "aptitude").score === null && /not agreed to share/.test(hidden.find((d) => d.key === "personality").gaps[0]), JSON.stringify(hidden.find((d) => d.key === "personality")));
  await pgc.query(`update "Student" set "psychShareWithStaff"=true where id=$1`, [id]);
  const logsBefore = (await pgc.query(`select count(*)::int n from "PsychAccessLog" where "studentId"=$1`, [id])).rows[0].n;
  const shown = (await staff("GET", `/api/students/${id}/intelligence`)).d.evidence.dimensions;
  const pers = shown.find((d) => d.key === "personality"), apt = shown.find((d) => d.key === "aptitude");
  t("consent: once shared, the five traits appear without an overall personality score", pers.items.length === 5 && pers.score === null && /never used to decide eligibility/i.test(pers.note));
  t("consent: aptitude is scored per area and averaged", apt.score !== null && Math.abs(apt.score - 69.7) < 0.5 && apt.items.length === 3, JSON.stringify(apt.score));
  t("consent: viewing shared personality data is logged", (await pgc.query(`select count(*)::int n from "PsychAccessLog" where "studentId"=$1`, [id])).rows[0].n > logsBefore);

  // The reading: either it is switched off (clear message) or it works; either way it is stored and flagged stale after changes.
  const gen = await staff("POST", `/api/students/${id}/intelligence/generate`);
  t("generate: clear message when AI is off, otherwise a stored reading", gen.s === 503 ? gen.code === "AI_NOT_CONFIGURED" : gen.s === 200 && !!gen.d.narrative.summary, `${gen.s} ${gen.code}`);
  if (gen.s === 200) {
    const g2 = await staff("GET", `/api/students/${id}/intelligence`);
    t("generate: reading is stored and current", g2.d.report.stale === false && g2.d.report.narrative.cautions.some((c) => /does not decide eligibility/.test(c)));
    await pgc.query(`update "StudentSection" set data = data || '{"cgpa": 9}'::jsonb where "studentId"=$1 and section='ACADEMICS'`, [id]);
    t("update: a change in the records marks the reading as out of date", (await staff("GET", `/api/students/${id}/intelligence`)).d.report.stale === true);
  }

  // access
  const noAuth = await fetch((process.env.BASE_URL ?? "http://localhost:3111") + `/api/students/${id}/intelligence`);
  t("access: requires sign-in", noAuth.status === 401);
  t("access: unknown student is a 404", (await staff("GET", "/api/students/00000000-0000-4000-8000-000000000000/intelligence")).s === 404);
} finally {
  try { if (ids.length) await pgc.query(`delete from "Student" where id = any($1)`, [ids]); } finally { await pgc.end(); }
}
process.exit(done() ? 1 : 0);
