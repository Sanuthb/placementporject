// Pure logic: no database, no network.
import { answersSchema, scoreAttempt, instrumentForStudent } from "../../lib/psychometrics";
import { scoreAnswers, orderFor, type PaperQuestion } from "../../lib/assessments";
import { checkEnv } from "../../lib/env";
import { fill } from "../../lib/ops/email";
import { analyzeResume } from "../../lib/resume";

let fails = 0;
const t = (name: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };

// psychometrics
const ins = instrumentForStudent();
const all = (n: number) => ({ personality: Object.fromEntries(ins.personality.map((q) => [q.id, n])), aptitude: Object.fromEntries(ins.aptitude.map((q) => [q.id, 0])) });
const s3 = scoreAttempt(answersSchema.parse(all(3)));
t("all-neutral answers score 50 on every trait (reverse items cancel out)", Object.values(s3.personality).every((x) => x.score === 50 && x.band === "moderate"), JSON.stringify(s3.personality));
const s5 = scoreAttempt(answersSchema.parse(all(5)));
t("agreeing with everything is not a perfect score (reverse-scored items)", Object.values(s5.personality).every((x) => x.score > 0 && x.score < 100));
t("incomplete answers rejected", !answersSchema.safeParse({ personality: { p1: 3 }, aptitude: {} }).success);
t("out-of-range answer rejected", !answersSchema.safeParse({ ...all(3), personality: { ...all(3).personality, p1: 9 } }).success);
t("answer key never leaves the server", !JSON.stringify(ins).includes("answer"));

// assessments
const Q = (id: string, correct: number[], marks = 2, neg = 0.5): PaperQuestion => ({ id, text: id, options: ["a", "b", "c", "d"], correct, marks, negativeMarks: neg });
const qs = [Q("q1", [1]), Q("q2", [0, 2]), Q("q3", [3])];
t("all right = full marks", scoreAnswers(qs, { q1: [1], q2: [2, 0], q3: [3] }).score === 6);
t("multi-select needs the exact set", scoreAnswers(qs, { q2: [0] }).score === 0 && scoreAnswers(qs, { q2: [0, 2] }).score === 2);
t("wrong answers cost negative marks, skipped cost nothing", scoreAnswers(qs, { q1: [0], q3: [] }).score === 0 && scoreAnswers(qs, { q1: [1], q3: [0] }).score === 1.5);
t("score never goes below zero", scoreAnswers(qs, { q1: [0], q2: [1], q3: [0] }).score === 0);
t("max score is the sum of marks", scoreAnswers(qs, {}).max === 6);
const ord = (seed: string) => orderFor(qs, seed, true).map((q) => q.id).join();
t("question order is stable per attempt", ord("attempt-1") === ord("attempt-1"));
t("different attempts can see different orders", new Set(["a", "b", "c", "d", "e", "f"].map(ord)).size > 1);
t("no shuffle keeps paper order", orderFor(qs, "x", false).map((q) => q.id).join() === "q1,q2,q3");

// templates
t("{{name}} filled, with fallback", fill("Hi {{name}} / {{ NAME }}", "Asha") === "Hi Asha / Asha" && fill("Hi {{name}}") === "Hi there");

// resume scoring
const full = analyzeResume({ email: "a@b.c", phone: "999" }, { RESUME: { text: "Built distributed systems with Kafka and Postgres at scale, mentoring juniors.", summary: "Backend engineer" }, SKILLS: { skills: ["a", "b", "c", "d", "e"] }, PROJECTS: { projects: [{}, {}] }, INTERNSHIPS: { internships: [{}] }, EDUCATION_HISTORY: { x: 1 }, ACADEMICS: { cgpa: 8 } }, true);
t("complete resume scores 100 and is ready", full.score === 100 && full.ready && full.improvements.length === 0);
t("empty resume scores low with advice", analyzeResume({ email: "a@b.c", phone: null }, {}, false).improvements.length >= 5);
t("score 70+ but unverified is not 'ready'", !analyzeResume({ email: "a@b.c", phone: "9" }, { RESUME: { text: "x".repeat(80) }, SKILLS: { skills: [1, 2, 3, 4, 5] }, PROJECTS: { projects: [1, 2] }, INTERNSHIPS: { internships: [1] }, EDUCATION_HISTORY: { a: 1 }, ACADEMICS: { a: 1 } }, false).ready);

// configuration checks
const good = { NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@host:6543/db?pgbouncer=true", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40), CRON_SECRET: "c".repeat(32), CORS_ORIGINS: "https://app.example", APP_URL: "https://app.example", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p" } as unknown as NodeJS.ProcessEnv;
const ok = checkEnv(good); t("good production config: no errors, no warnings", ok.errors.length === 0 && ok.warnings.length === 0, JSON.stringify(ok));
t("missing database url is an error", checkEnv({ ...good, DATABASE_URL: "" }).errors.length > 0);
t("service key equal to anon key is an error", checkEnv({ ...good, SUPABASE_SERVICE_ROLE_KEY: good.SUPABASE_ANON_KEY }).errors.some((e) => /same as/.test(e)));
t("short cron secret is an error", checkEnv({ ...good, CRON_SECRET: "short" }).errors.length > 0);
const w = checkEnv({ ...good, SMTP_DRY_RUN: "true", CORS_ORIGINS: "", CRON_SECRET: undefined }).warnings.join(" | ");
t("production warnings: dry-run mail, no CORS, no cron secret", /NOT sent/.test(w) && /CORS_ORIGINS/.test(w) && /CRON_SECRET/.test(w), w);
t("dev config is not nagged", checkEnv({ ...good, NODE_ENV: "development", CRON_SECRET: undefined, SMTP_HOST: undefined }).warnings.length === 0);

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
