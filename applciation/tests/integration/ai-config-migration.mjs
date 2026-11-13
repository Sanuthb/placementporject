// Migration and rollback safety of the AI configuration migration (Phase 4.4.2). ISOLATED LOCAL DOCKER DATABASE ONLY: a scratch database is created, used and dropped.
//   node tests/integration/ai-config-migration.mjs        (needs the local stack: see docs/LOCAL_ENV.md; reads .env.local for the local DIRECT_URL)
// Covers the three 4.4 migrations (20261117090000_ai_configuration, 20261118090000_ai_global_switch and 20261119090000_ai_usage_limits) and their ordering. Proves: additive-only SQL, a fresh deploy of the whole chain, an upgrade over existing rows that changes nothing else, no drift from schema.prisma, a clean rollback that leaves nothing
// behind (tables, indexes AND enum types), and an idempotent re-apply.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { parse } from "dotenv";

// DIRECT_URL: real environment first, then .env.local ONLY (a bare .env may name a hosted project and is never read here)
if (!process.env.DIRECT_URL && existsSync(".env.local")) { const e = parse(readFileSync(".env.local")); process.env.DIRECT_URL = e.DIRECT_URL; }
const hostOf = (v) => /^[a-z]+:\/\/(?:[^/@]*@)?(\[[^\]]*\]|[^/:?#]*)/i.exec(v ?? "")?.[1]?.replace(/^\[|\]$/g, "").toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(hostOf(process.env.DIRECT_URL) ?? "")) { console.error("Refusing: DIRECT_URL is not the isolated local stack"); process.exit(2); }

let fails = 0, n = 0;
const t = (name, ok, x = "") => { n++; if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : String(x).slice(0, 300)); };
const base = new URL(process.env.DIRECT_URL);
const SCRATCH = "mig_scratch_ai_" + Date.now().toString(36);
const urlFor = (db) => { const u = new URL(base); u.pathname = "/" + db; return u.toString(); };
const WIN = process.platform === "win32";
const MIG = "20261117090000_ai_configuration";
const MIG3 = "20261119090000_ai_usage_limits";
// Undoes the usage-and-limits migration (the manual rollback documented in its header), so the earlier migration can be undone and redone on its own.
const UNDO3 = `drop table "AiQuotaCounter"; drop table "AiLimit"; drop type "AiLimitKind"; drop index "AiUsageDaily_day_idx"; alter table "AiUsageDaily" drop column "blocked"; delete from "_prisma_migrations" where migration_name = '${MIG3}'`;
const prisma = (args, dbUrl) => { const r = spawnSync(WIN ? "npx.cmd" : "npx", ["prisma", ...args], { encoding: "utf8", shell: WIN, env: { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl } }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }; };

// ---- what the migration contains (read, not assumed)
const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
const stmts = sql.split("\n").filter((l) => !/^\s*(--|$)/.test(l)).join("\n").split(";").map((x) => x.trim()).filter(Boolean);
const OBJ = "(AiProviderConfig|AiUsageDaily)";
const allowed = (s) => /^CREATE TYPE "(AiProvider|AiPurpose)" AS ENUM \(/.test(s) || new RegExp(`^CREATE TABLE "${OBJ}"`).test(s) || new RegExp(`^CREATE (UNIQUE )?INDEX "${OBJ}_[\\w]+" ON "${OBJ}"`).test(s) || new RegExp(`^ALTER TABLE "${OBJ}" ENABLE ROW LEVEL SECURITY$`).test(s);
t("the migration is additive only: two enum types, two tables, their indexes, and row-level security on the new tables", stmts.length === 10 && stmts.every(allowed), stmts.filter((s) => !allowed(s)).join(" ; ") || `${stmts.length} statements`);
t("the migration contains no DROP, TRUNCATE, DELETE, UPDATE, RENAME, ALTER COLUMN, ADD COLUMN, foreign key or reference to an existing table", !/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|ALTER COLUMN|ADD COLUMN|FOREIGN KEY|REFERENCES)\b/i.test(stmts.join("\n")));

const admin = new pg.Client({ connectionString: urlFor("postgres") }); await admin.connect();
let sc = null;
try {
  await admin.query(`create database "${SCRATCH}"`);
  sc = new pg.Client({ connectionString: urlFor(SCRATCH) }); await sc.connect();
  const q = async (s, p) => (await sc.query(s, p)).rows;
  const counts = async () => { const out = {}; for (const { tablename: x } of await q(`select tablename from pg_tables where schemaname='public' order by 1`)) out[x] = Number((await q(`select count(*) from "${x}"`))[0].count); return out; };
  const same = (a, b, skip) => Object.keys(a).filter((k) => !skip.includes(k)).every((k) => a[k] === b[k]) && Object.keys(b).filter((k) => !skip.includes(k) && !(k in a)).length === 0;
  const status = () => prisma(["migrate", "status"], urlFor(SCRATCH));
  const pending = (o) => (/have not yet been applied:\s*([\s\S]*?)\n\s*\n/i.exec(o)?.[1] ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const drift = () => prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], urlFor(SCRATCH));
  const left = async () => q(`select relname, relkind from pg_class where relname ilike 'AiProviderConfig%' or relname ilike 'AiUsageDaily%' union all select typname, 'T' from pg_type where typname in ('AiProvider','AiPurpose','_AiProvider','_AiPurpose','AiProviderConfig','AiUsageDaily','_AiProviderConfig','_AiUsageDaily')`);

  const fresh = prisma(["migrate", "deploy"], urlFor(SCRATCH));
  t("a fresh database: the complete migration chain applies, this one included, with exit code 0", fresh.code === 0 && new RegExp(MIG).test(fresh.out) && /successfully applied/i.test(fresh.out), fresh.out.slice(-300));
  t("migrate status says up to date, and the database equals schema.prisma exactly (no drift)", /up to date/i.test(status().out) && drift().code === 0);
  t("both tables and both enum types exist", (await left()).length >= 8);
  // migration ordering: folders sort lexically in creation order, these four migrations keep their relative order (later migrations may follow them), and a fresh deploy applied them in exactly that order
  const dirs = readdirSync("prisma/migrations").filter((d) => /^\d{14}_/.test(d));
  t("migration ordering: the folders sort in name order, and these four keep this relative order (newer migrations may follow): 20261116090000_monitoring_history < 20261117090000_ai_configuration < 20261118090000_ai_global_switch < 20261119090000_ai_usage_limits", dirs.join() === [...dirs].sort().join() && ["20261116090000_monitoring_history", "20261117090000_ai_configuration", "20261118090000_ai_global_switch", "20261119090000_ai_usage_limits"].every((m, i, all) => dirs.includes(m) && (i === 0 || dirs.indexOf(all[i - 1]) < dirs.indexOf(m))), dirs.slice(-5).join());
  t("migration ordering: a fresh deploy recorded every migration in exactly name order (nothing applied out of sequence)", (await q(`select migration_name from _prisma_migrations order by started_at, migration_name`)).map((r) => r.migration_name).join() === [...dirs].sort().join());

  // upgrade over existing data: put the database back in its pre-migration state
  await sc.query(`insert into "College"(id,name,slug,"updatedAt") select gen_random_uuid(), 'Scratch College ' || g, 'scratch-' || g, now() from generate_series(1, 4) g`);
  await sc.query(`insert into "CollegeModule"("collegeId", module) select c.id, m from "College" c, unnest(enum_range(null::"ModuleKey")) m`);
  await sc.query(`insert into "RateLimitBucket"(key, "windowStart", count) select 'k' || g, g, 1 from generate_series(1, 30) g`);
  await sc.query(UNDO3); await sc.query(`drop table "AiUsageDaily"; drop table "AiProviderConfig"; drop type "AiPurpose"; drop type "AiProvider"; delete from "_prisma_migrations" where migration_name = '${MIG}'`);
  const before = await counts();
  t("pre-migration state with real rows in existing tables: migrate status lists exactly this migration (and the newer usage migration that depends on its table) as pending", pending(status().out).join() === [MIG, MIG3].join());
  const up = prisma(["migrate", "deploy"], urlFor(SCRATCH));
  const after = await counts();
  t("upgrade: migrate deploy applies only this migration and succeeds", up.code === 0 && (up.out.match(/20\d{12}_\w+/g) ?? []).every((m) => m === MIG || m === MIG3) && /successfully applied/i.test(up.out), up.out.slice(-250));
  t("upgrade: no existing table changed a row (only the migration ledger grew by one; the two new tables are empty)", same(before, after, ["_prisma_migrations", "AiProviderConfig", "AiUsageDaily", "AiLimit", "AiQuotaCounter"]) && after._prisma_migrations === before._prisma_migrations + 2 && after.AiProviderConfig === 0 && after.AiUsageDaily === 0);
  t("upgrade: four colleges, their 52 module rows and 30 rate-limit buckets are intact, and the result equals schema.prisma", after.College === 4 && after.CollegeModule === 52 && after.RateLimitBucket === 30 && drift().code === 0);

  // rollback with rows in the new tables
  await sc.query(`insert into "AiProviderConfig" (id, purpose, provider, model, "updatedAt") values (gen_random_uuid(), 'TEXT', 'GROQ', 'm', now()), (gen_random_uuid(), 'VISION', 'GROQ', 'm', now())`);
  await sc.query(`insert into "AiUsageDaily" (id, day, "collegeKey", purpose, provider, model, feature, calls, "updatedAt") select gen_random_uuid(), current_date - g, 'platform', 'TEXT', 'GROQ', 'm', 'f', g, now() from generate_series(1, 50) g`);
  const loaded = await counts();
  await sc.query("begin"); await sc.query(UNDO3); await sc.query(`drop table "AiUsageDaily"`); await sc.query(`drop table "AiProviderConfig"`); await sc.query(`drop type "AiPurpose"`); await sc.query(`drop type "AiProvider"`); await sc.query(`delete from "_prisma_migrations" where migration_name = '${MIG}'`); await sc.query("commit");
  const rolled = await counts();
  t("rollback (DROP TABLE x2, DROP TYPE x2, ledger row removed, in one transaction) removes both tables with their rows", !("AiProviderConfig" in rolled) && !("AiUsageDaily" in rolled) && loaded.AiProviderConfig === 2 && loaded.AiUsageDaily === 50);
  t("rollback: every other table has exactly the rows it had (nothing depended on the new objects)", same(loaded, rolled, ["_prisma_migrations", "AiProviderConfig", "AiUsageDaily", "AiLimit", "AiQuotaCounter"]) && rolled._prisma_migrations === loaded._prisma_migrations - 2 && !("AiLimit" in rolled) && !("AiQuotaCounter" in rolled));
  t("rollback leaves nothing behind: no table, index, sequence, constraint or enum type with these names", (await left()).length === 0, JSON.stringify(await left()));
  t("after the rollback migrate status shows exactly this migration and the newer usage migration pending again", pending(status().out).join() === [MIG, MIG3].join());
  const re = prisma(["migrate", "deploy"], urlFor(SCRATCH)); const again = prisma(["migrate", "deploy"], urlFor(SCRATCH)); const fin = await counts();
  t("re-apply after the rollback succeeds, the tables come back empty, and deploying again is a no-op with no drift", re.code === 0 && fin.AiProviderConfig === 0 && fin.AiUsageDaily === 0 && again.code === 0 && /No pending migrations/i.test(again.out) && drift().code === 0);

  // ---- second migration: the platform-wide kill switch (20261118090000_ai_global_switch)
  const MIG2 = "20261118090000_ai_global_switch";
  const st2 = readFileSync(`prisma/migrations/${MIG2}/migration.sql`, "utf8").split("\n").filter((l) => !/^\s*(--|$)/.test(l)).join("\n").split(";").map((x) => x.trim()).filter(Boolean);
  t("global switch migration is additive only: one CREATE TABLE (primary key and single-row CHECK) and row-level security, with no DROP, UPDATE, DELETE, ALTER COLUMN or reference to another table", st2.length === 2 && /^CREATE TABLE "AiGlobalSetting"/.test(st2[0]) && /^ALTER TABLE "AiGlobalSetting" ENABLE ROW LEVEL SECURITY$/.test(st2[1]) && !/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|ALTER COLUMN|ADD COLUMN|FOREIGN KEY|REFERENCES)\b/i.test(st2.join("\n")), st2.join(" ; ").slice(0, 200));
  const gcols = (await q(`select column_name c, udt_name u, is_nullable n from information_schema.columns where table_name = 'AiGlobalSetting' order by ordinal_position`)).map((x) => `${x.c}:${x.u}:${x.n}`).join(",");
  t("the switch table has the designed columns, row-level security on, no grants to public roles, no foreign keys", gcols === "id:text:NO,enabled:bool:NO,reason:text:YES,updatedAt:timestamp:NO,updatedBy:uuid:YES" && (await q(`select relrowsecurity r from pg_class where relname = 'AiGlobalSetting'`))[0].r === true && (await q(`select grantee from information_schema.role_table_grants where table_name = 'AiGlobalSetting' and grantee in ('anon','authenticated')`)).length === 0 && (await q(`select conname from pg_constraint where contype = 'f' and (conrelid = '"AiGlobalSetting"'::regclass or confrelid = '"AiGlobalSetting"'::regclass)`)).length === 0, gcols);
  await sc.query(`insert into "AiGlobalSetting" (id, enabled, "updatedAt") values ('global', false, now())`);
  let second = "", second2 = ""; try { await sc.query(`insert into "AiGlobalSetting" (id, enabled, "updatedAt") values ('other', true, now())`); } catch (e) { second = e.code; } try { await sc.query(`insert into "AiGlobalSetting" (id, enabled, "updatedAt") values ('global', true, now())`); } catch (e) { second2 = e.code; }
  t("the database allows exactly one switch row: another id is refused by the CHECK (23514) and a duplicate of 'global' by the primary key (23505)", second === "23514" && second2 === "23505", `${second} ${second2}`);
  const before2 = await counts();
  await sc.query(`drop table "AiGlobalSetting"; delete from "_prisma_migrations" where migration_name = '${MIG2}'`);
  t("pre-migration state: migrate status lists exactly the global switch migration as pending", pending(status().out).join() === MIG2);
  const up2 = prisma(["migrate", "deploy"], urlFor(SCRATCH)); const after2 = await counts();
  t("upgrade: only this migration applies; every other table is unchanged (only the ledger grew by one) and the new table is empty; the result equals schema.prisma", up2.code === 0 && (up2.out.match(/20\d{12}_\w+/g) ?? []).every((m) => m === MIG2) && same(before2, after2, ["_prisma_migrations", "AiGlobalSetting"]) && after2._prisma_migrations === before2._prisma_migrations && after2.AiGlobalSetting === 0 && drift().code === 0, up2.out.slice(-200));
  await sc.query(`insert into "AiGlobalSetting" (id, enabled, "updatedAt") values ('global', false, now())`);
  await sc.query("begin"); await sc.query(`drop table "AiGlobalSetting"`); await sc.query(`delete from "_prisma_migrations" where migration_name = '${MIG2}'`); await sc.query("commit");
  const left2 = await q(`select relname from pg_class where relname ilike 'AiGlobalSetting%'`);
  t("rollback (DROP TABLE and the ledger row, one transaction) leaves nothing behind (no table, index or constraint), and status shows exactly this migration pending", left2.length === 0 && pending(status().out).join() === MIG2, JSON.stringify(left2));
  const re2 = prisma(["migrate", "deploy"], urlFor(SCRATCH)); const again2 = prisma(["migrate", "deploy"], urlFor(SCRATCH));
  t("re-apply works, deploying again is a no-op, and there is no drift", re2.code === 0 && again2.code === 0 && /No pending migrations/i.test(again2.out) && drift().code === 0);
  // ---- third migration: usage tracking and limits (20261119090000_ai_usage_limits)
  const st3 = readFileSync(`prisma/migrations/${MIG3}/migration.sql`, "utf8").split("\n").filter((l) => !/^\s*(--|$)/.test(l)).join("\n").split(";").map((x) => x.trim()).filter(Boolean);
  const ok3 = (x) => /^CREATE TYPE "AiLimitKind" AS ENUM/.test(x) || /^ALTER TABLE "AiUsageDaily" ADD COLUMN\s+"blocked" INTEGER NOT NULL DEFAULT 0$/.test(x) || /^CREATE TABLE "(AiLimit|AiQuotaCounter)"/.test(x) || /^CREATE (UNIQUE )?INDEX "(AiLimit|AiQuotaCounter|AiUsageDaily)_[\w]+" ON "(AiLimit|AiQuotaCounter|AiUsageDaily)"/.test(x) || /^ALTER TABLE "(AiLimit|AiQuotaCounter)" ENABLE ROW LEVEL SECURITY$/.test(x);
  t("usage migration is additive only: one enum, two tables, one new column with a default, indexes and row-level security, and no DROP, TRUNCATE, DELETE, UPDATE, RENAME, ALTER COLUMN or foreign key", st3.length === 10 && st3.every(ok3) && !/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|ALTER COLUMN|FOREIGN KEY|REFERENCES)\b/i.test(st3.join("\n")), st3.filter((x) => !ok3(x)).join(" ; ") || `${st3.length} statements`);
  const c3 = (await q(`select table_name t, column_name c, udt_name u, is_nullable n from information_schema.columns where table_name in ('AiLimit','AiQuotaCounter') order by table_name, ordinal_position`)).map((x) => `${x.t}.${x.c}:${x.u}:${x.n}`).join(",");
  t("the new tables have the designed columns and row-level security on, and no grants to the public roles", c3 === "AiLimit.id:uuid:NO,AiLimit.kind:AiLimitKind:NO,AiLimit.key:text:NO,AiLimit.dailyCalls:int4:NO,AiLimit.updatedAt:timestamp:NO,AiLimit.updatedBy:uuid:YES,AiQuotaCounter.id:uuid:NO,AiQuotaCounter.day:date:NO,AiQuotaCounter.scope:text:NO,AiQuotaCounter.used:int4:NO,AiQuotaCounter.updatedAt:timestamp:NO" && (await q(`select count(*)::int n from pg_class where relname in ('AiLimit','AiQuotaCounter') and relrowsecurity`))[0].n === 2 && (await q(`select grantee from information_schema.role_table_grants where table_name in ('AiLimit','AiQuotaCounter') and grantee in ('anon','authenticated')`)).length === 0, c3);
  let dup = "", dup2 = ""; await sc.query(`insert into "AiQuotaCounter" (id, day, scope, used, "updatedAt") values (gen_random_uuid(), current_date, 'provider:GROQ', 1, now())`); await sc.query(`insert into "AiLimit" (id, kind, key, "dailyCalls", "updatedAt") values (gen_random_uuid(), 'PROVIDER', 'GROQ', 5, now())`);
  try { await sc.query(`insert into "AiQuotaCounter" (id, day, scope, used, "updatedAt") values (gen_random_uuid(), current_date, 'provider:GROQ', 1, now())`); } catch (e) { dup = e.code; } try { await sc.query(`insert into "AiLimit" (id, kind, key, "dailyCalls", "updatedAt") values (gen_random_uuid(), 'PROVIDER', 'GROQ', 9, now())`); } catch (e) { dup2 = e.code; }
  t("the database refuses a second counter for the same day and scope, and a second limit for the same kind and key (23505): the concurrency guarantee rests on this", dup === "23505" && dup2 === "23505", `${dup} ${dup2}`);
  await sc.query(`delete from "AiQuotaCounter"; delete from "AiLimit"`);
  // upgrade: usage rows exist before the migration; the new column must default to 0 on them and nothing else may change
  await sc.query(`insert into "AiUsageDaily" (id, day, "collegeKey", purpose, provider, model, feature, calls, "updatedAt") select gen_random_uuid(), current_date - g, 'platform', 'TEXT', 'GROQ', 'm', 'f', g, now() from generate_series(1, 30) g`);
  await sc.query(UNDO3);
  const before3 = await counts();
  t("pre-migration state: migrate status lists exactly the usage migration as pending", pending(status().out).join() === MIG3);
  const up3 = prisma(["migrate", "deploy"], urlFor(SCRATCH)); const after3 = await counts();
  t("upgrade over 30 existing usage rows: only this migration applies, no row is lost or changed (the ledger grows by one), the new tables are empty, and the result equals schema.prisma", up3.code === 0 && (up3.out.match(/20\d{12}_\w+/g) ?? []).every((m) => m === MIG3) && same(before3, after3, ["_prisma_migrations", "AiLimit", "AiQuotaCounter"]) && after3._prisma_migrations === before3._prisma_migrations + 1 && after3.AiUsageDaily === 30 && after3.AiLimit === 0 && after3.AiQuotaCounter === 0 && drift().code === 0, up3.out.slice(-200));
  t("the new column is 0 on every pre-existing row", (await q(`select count(*)::int n from "AiUsageDaily" where blocked = 0`))[0].n === 30 && (await q(`select coalesce(sum(calls), 0)::int s from "AiUsageDaily"`))[0].s === 465);
  await sc.query(`insert into "AiLimit" (id, kind, key, "dailyCalls", "updatedAt") values (gen_random_uuid(), 'COLLEGE_DEFAULT', '*', 5, now())`);
  await sc.query(`insert into "AiQuotaCounter" (id, day, scope, used, "updatedAt") values (gen_random_uuid(), current_date, 'purpose:TEXT', 3, now())`);
  const loaded3 = await counts();
  await sc.query("begin"); await sc.query(UNDO3); await sc.query("commit");
  const rolled3 = await counts();
  const rest3 = await q(`select relname from pg_class where relname in ('AiLimit','AiQuotaCounter','AiUsageDaily_day_idx','AiLimit_kind_key_key','AiQuotaCounter_day_idx','AiQuotaCounter_day_scope_key') union all select typname from pg_type where typname in ('AiLimitKind','_AiLimitKind') union all select column_name from information_schema.columns where table_name = 'AiUsageDaily' and column_name = 'blocked'`);
  t("rollback (the documented SQL, one transaction) removes the new tables, index, enum type and column, and nothing else: the 30 usage rows keep every other column", rest3.length === 0 && !("AiLimit" in rolled3) && !("AiQuotaCounter" in rolled3) && rolled3.AiUsageDaily === 30 && loaded3.AiLimit === 1 && loaded3.AiQuotaCounter === 1 && same(loaded3, rolled3, ["_prisma_migrations", "AiLimit", "AiQuotaCounter"]) && rolled3._prisma_migrations === loaded3._prisma_migrations - 1, JSON.stringify(rest3));
  t("after the rollback migrate status shows exactly this migration pending again", pending(status().out).join() === MIG3);
  const re3 = prisma(["migrate", "deploy"], urlFor(SCRATCH)); const again3 = prisma(["migrate", "deploy"], urlFor(SCRATCH));
  t("re-apply works, deploying again is a no-op, and there is no drift", re3.code === 0 && again3.code === 0 && /No pending migrations/i.test(again3.out) && drift().code === 0);
  t("every connection in this suite went to localhost", ["localhost", "127.0.0.1"].includes(base.hostname));
} finally {
  if (sc) await sc.end().catch(() => 0);
  await admin.query(`drop database if exists "${SCRATCH}" with (force)`).catch(() => 0);
  await admin.end().catch(() => 0);
}
console.log(`${n} assertions, ${fails} failed`);
process.exit(fails ? 1 : 0);
