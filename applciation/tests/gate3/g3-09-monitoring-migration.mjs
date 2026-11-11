// Gate 4 Phase 4.3 closing: migration and rollback safety of the monitoring tables (JobRun, MonitorEvent).
// ISOLATED LOCAL DOCKER DATABASE ONLY. A scratch database is created next to the test data, used, and dropped; nothing else is touched and nothing hosted is contacted.
// Proves: the migration is additive-only (by reading its SQL), a fresh deploy of the whole chain works, an upgrade over existing data changes nothing else,
// the schema matches schema.prisma (no drift), the rollback is clean and leaves no trace, and re-applying works and is idempotent.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import { recorder } from "./rec.mjs";

const R = recorder("g3-09-monitoring-migration");
const ID = ["SA-TC-055"];
const t = (n, ok, x = "") => R.t(ID, n, ok, x, "");
const base = new URL(process.env.DIRECT_URL ?? "");
if (!/^(localhost|127\.0\.0\.1)$/.test(base.hostname)) { console.error("Refusing: DIRECT_URL is not local"); process.exit(2); }
const SCRATCH = "mig_scratch_" + Date.now().toString(36);
const urlFor = (db) => { const u = new URL(base); u.pathname = "/" + db; return u.toString(); };
const WIN = process.platform === "win32";
const MIG = "20261116090000_monitoring_history";
const prisma = (args, dbUrl) => { const r = spawnSync(WIN ? "npx.cmd" : "npx", ["prisma", ...args], { encoding: "utf8", shell: WIN, env: { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl } }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }; };

// ---- 1. what the migration contains (read, not assumed)
const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
const stmts = sql.split("\n").filter((l) => !/^\s*(--|$)/.test(l)).join("\n").split(";").map((x) => x.trim()).filter(Boolean);
const allowed = (s) => /^CREATE TABLE "(JobRun|MonitorEvent)"/.test(s) || /^CREATE (UNIQUE )?INDEX "(JobRun|MonitorEvent)_[\w]+" ON "(JobRun|MonitorEvent)"/.test(s) || /^ALTER TABLE "(JobRun|MonitorEvent)" ENABLE ROW LEVEL SECURITY$/.test(s);
t("the migration is additive only: every statement creates one of the two new tables, an index on them, or enables row-level security on them", stmts.length === 8 && stmts.every(allowed), stmts.filter((s) => !allowed(s)).join(" ; ") || `${stmts.length} statements`);
t("the migration contains no DROP, TRUNCATE, DELETE, UPDATE, RENAME, ALTER COLUMN, ADD COLUMN or foreign key", !/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|ALTER COLUMN|ADD COLUMN|FOREIGN KEY|REFERENCES)\b/i.test(stmts.join("\n")));

const admin = new pg.Client({ connectionString: urlFor("postgres") }); await admin.connect();
let sc = null;
try {
  await admin.query(`create database "${SCRATCH}"`);
  sc = new pg.Client({ connectionString: urlFor(SCRATCH) }); await sc.connect();
  const q = async (s, p) => (await sc.query(s, p)).rows;
  const counts = async () => { const out = {}; for (const { tablename: n } of await q(`select tablename from pg_tables where schemaname='public' order by 1`)) out[n] = Number((await q(`select count(*) from "${n}"`))[0].count); return out; };
  const same = (a, b, skip = []) => Object.keys(a).filter((k) => !skip.includes(k)).every((k) => a[k] === b[k]) && Object.keys(b).filter((k) => !skip.includes(k) && !(k in a)).length === 0;
  const status = () => prisma(["migrate", "status"], urlFor(SCRATCH));
  const pending = (o) => (/have not yet been applied:\s*([\s\S]*?)\n\s*\n/i.exec(o)?.[1] ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

  // ---- 2. a FRESH database: the whole chain applies
  const fresh = prisma(["migrate", "deploy"], urlFor(SCRATCH));
  t("a fresh database: the complete migration chain applies, this one included, with exit code 0", fresh.code === 0 && new RegExp(MIG).test(fresh.out) && /successfully applied/i.test(fresh.out), fresh.out.slice(-300));
  t("migrate status says the database is up to date", /up to date/i.test(status().out));
  const drift = prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], urlFor(SCRATCH));
  t("the database equals schema.prisma exactly: no drift (prisma migrate diff exits 0)", drift.code === 0 && /No difference/i.test(drift.out), drift.out.slice(-200));

  // ---- 3. the schema, read back from the catalog
  const cols = await q(`select table_name t, column_name c, data_type d, is_nullable n, column_default df from information_schema.columns where table_name in ('JobRun','MonitorEvent') order by 1, ordinal_position`);
  const colset = (tb) => cols.filter((x) => x.t === tb).map((x) => `${x.c}:${x.d}:${x.n}`).join(",");
  t("JobRun has exactly the designed columns and types", colset("JobRun") === "id:uuid:NO,job:text:NO,trigger:text:NO,slotAt:timestamp without time zone:NO,startedAt:timestamp without time zone:NO,lastStartedAt:timestamp without time zone:NO,finishedAt:timestamp without time zone:YES,ok:boolean:YES,durationMs:integer:YES,attempts:integer:NO,failedAttempts:integer:NO,summary:jsonb:YES,error:text:YES", colset("JobRun"));
  t("MonitorEvent has exactly the designed columns and types", colset("MonitorEvent") === "id:uuid:NO,at:timestamp without time zone:NO,service:text:NO,status:integer:YES,code:text:NO,method:text:YES,path:text:YES,requestId:text:YES,message:text:NO", colset("MonitorEvent"));
  const idx = (await q(`select indexname from pg_indexes where tablename in ('JobRun','MonitorEvent') order by 1`)).map((r) => r.indexname).join(",");
  t("the indexes are exactly: JobRun unique (job, slotAt), JobRun (slotAt), MonitorEvent (at), MonitorEvent (service, at), plus the two primary keys", idx === "JobRun_job_slotAt_key,JobRun_pkey,JobRun_slotAt_idx,MonitorEvent_at_idx,MonitorEvent_pkey,MonitorEvent_service_at_idx", idx);
  const fk = await q(`select conname from pg_constraint where contype='f' and (conrelid in ('"JobRun"'::regclass,'"MonitorEvent"'::regclass) or confrelid in ('"JobRun"'::regclass,'"MonitorEvent"'::regclass))`);
  const rls = await q(`select relname, relrowsecurity from pg_class where relname in ('JobRun','MonitorEvent')`);
  t("no foreign key in or out of either table (they can be dropped without touching anything else); row-level security is on for both", fk.length === 0 && rls.length === 2 && rls.every((r) => r.relrowsecurity), JSON.stringify([fk, rls]));
  const dup = await q(`insert into "JobRun" (id, job, trigger, "slotAt") values (gen_random_uuid(), 'j', 'scheduler', '2026-01-01T00:00:00Z') returning id`);
  let dupErr = ""; try { await sc.query(`insert into "JobRun" (id, job, trigger, "slotAt") values (gen_random_uuid(), 'j', 'scheduler', '2026-01-01T00:00:00Z')`); } catch (e) { dupErr = e.code; }
  t("the unique index refuses a second row for the same job and slot (the duplicate guard the job wrapper relies on)", dup.length === 1 && dupErr === "23505", `code ${dupErr}`);
  await sc.query(`delete from "JobRun"`);

  // ---- 4. UPGRADE over existing data: give existing tables rows, put the database back in its pre-migration state, apply only the new migration
  await sc.query(`insert into "College"(id,name,slug,"updatedAt") select gen_random_uuid(), 'Scratch College ' || g, 'scratch-' || g, now() from generate_series(1, 5) g`);
  await sc.query(`insert into "CollegeModule"("collegeId", module) select c.id, m from "College" c, unnest(enum_range(null::"ModuleKey")) m`);
  await sc.query(`insert into "RateLimitBucket"(key, "windowStart", count) select 'k' || g, g, 1 from generate_series(1, 50) g`);
  await sc.query(`drop table "MonitorEvent"; drop table "JobRun"; delete from "_prisma_migrations" where migration_name = '${MIG}'`);
  const before = await counts();
  const st1 = status();
  t("pre-migration state with real rows in existing tables: migrate status lists exactly this one migration as pending", pending(st1.out).join() === MIG, st1.out.slice(-200));
  const up = prisma(["migrate", "deploy"], urlFor(SCRATCH));
  const after = await counts();
  t("upgrade: migrate deploy applies only this migration and succeeds", up.code === 0 && (up.out.match(/20\d{12}_\w+/g) ?? []).every((m) => m === MIG) && /successfully applied/i.test(up.out), up.out.slice(-250));
  t("upgrade: no existing table lost, gained or changed a row (only the migration ledger grew by one, and the two new tables appeared empty)", same(before, after, ["_prisma_migrations", "JobRun", "MonitorEvent"]) && after._prisma_migrations === before._prisma_migrations + 1 && after.JobRun === 0 && after.MonitorEvent === 0, JSON.stringify({ before: before.College, after: after.College }));
  t("upgrade: five colleges, their 65 module rows and 50 rate-limit buckets are intact", after.College === 5 && after.CollegeModule === 65 && after.RateLimitBucket === 50, JSON.stringify([after.College, after.CollegeModule, after.RateLimitBucket]));
  t("upgrade: the result equals schema.prisma (no drift)", prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], urlFor(SCRATCH)).code === 0);

  // ---- 5. ROLLBACK with data in the new tables
  await sc.query(`insert into "JobRun" (id, job, trigger, "slotAt", ok) select gen_random_uuid(), 'job' || g, 'scheduler', now() - (g || ' hours')::interval, true from generate_series(1, 200) g`);
  await sc.query(`insert into "MonitorEvent" (id, service, status, code, message) select gen_random_uuid(), 'application', 500, 'E', 'm' from generate_series(1, 300) g`);
  const loaded = await counts();
  await sc.query("begin"); await sc.query(`drop table "MonitorEvent"`); await sc.query(`drop table "JobRun"`); await sc.query(`delete from "_prisma_migrations" where migration_name = '${MIG}'`); await sc.query("commit");
  const rolled = await counts();
  t("rollback (two DROP TABLE statements and removing the ledger row, in one transaction) removes both tables and every row in them", !("JobRun" in rolled) && !("MonitorEvent" in rolled) && loaded.JobRun === 200 && loaded.MonitorEvent === 300);
  t("rollback: every other table has exactly the rows it had before (nothing depended on the new tables)", same(loaded, rolled, ["_prisma_migrations", "JobRun", "MonitorEvent"]) && rolled._prisma_migrations === loaded._prisma_migrations - 1, JSON.stringify([loaded.College, rolled.College]));
  const left = await q(`select relname from pg_class where relname ilike 'JobRun%' or relname ilike 'MonitorEvent%'`);
  t("rollback leaves nothing behind: no table, index, sequence or constraint with either name", left.length === 0, JSON.stringify(left));
  t("after the rollback migrate status shows exactly this migration pending again", pending(status().out).join() === MIG);

  // ---- 6. RE-APPLY and idempotence
  const re = prisma(["migrate", "deploy"], urlFor(SCRATCH));
  const again = prisma(["migrate", "deploy"], urlFor(SCRATCH));
  const fin = await counts();
  t("re-apply after the rollback succeeds and the tables come back empty", re.code === 0 && fin.JobRun === 0 && fin.MonitorEvent === 0 && same(loaded, fin, ["_prisma_migrations", "JobRun", "MonitorEvent"]));
  t("running deploy again is a no-op (idempotent: 'No pending migrations') and the schema still equals schema.prisma", again.code === 0 && /No pending migrations/i.test(again.out) && prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], urlFor(SCRATCH)).code === 0, again.out.slice(-120));
  t("the hosted database was never contacted: every connection in this suite went to localhost", base.hostname === "localhost" || base.hostname === "127.0.0.1");
} finally {
  if (sc) await sc.end().catch(() => 0);
  await admin.query(`drop database if exists "${SCRATCH}" with (force)`).catch(() => 0);
  await admin.end().catch(() => 0);
}
process.exit(R.done() ? 1 : 0);
