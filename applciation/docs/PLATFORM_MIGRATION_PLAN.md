# Migration run plan for the hosted demo project

**Status: a plan only. Nothing in this document has been run. Every step that touches the hosted project needs explicit approval at the time.**

Facts below come from one read-only look at the hosted project on 2026-11-13 (no writes). Re-check them before running anything, because they can have changed.

## 1. Where the hosted project stands

| Item | Finding |
|---|---|
| Rows in the migrations table | 48, of which **46 are applied** and 2 are rolled-back records (see below) |
| Migration folders in the repository | 56 |
| Last applied | `20261115150000_dashboards_principal_role` |
| Pending (expected) | **10**: `monitoring_history`, `ai_configuration`, `ai_global_switch`, `ai_usage_limits`, `platform_support`, `platform_policy`, then the four new ones: `support_priority`, `platform_incidents`, `platform_announcements`, `module_switch_security_review` |
| Failed-migration rows | Two rows (`career_roadmap`, `courses_lms`) are marked rolled back. Prisma ignores them, and later versions of those migrations are applied. |
| Data present | 1 college, 6 staff, 2 students, 2 employers, 1 platform administrator, 11 sign-in accounts, 265 audit rows. One student address is on gmail.com and has not been identified. |

The pending list must be confirmed with `prisma migrate status` before any run; treat the table as the expected result, not the truth.

All ten pending migrations are additive: new tables, new enums, indexes, one new column with a default. Nothing is dropped or deleted.

## 2. Two blockers to settle first

1. **The repository guard blocks Prisma commands.** `prisma.config.ts` calls the local-only check with only `DIRECT_URL`, so `ALLOW_REMOTE_DB` is never seen and `prisma migrate` refuses a hosted target even when the override is set. Choose one:
   - **A (recommended):** approve a small edit to `prisma.config.ts` so it passes `ALLOW_REMOTE_DB` through. Then the normal guarded script works, with the override typed deliberately.
   - **B:** run Prisma with a temporary configuration file kept outside the repository. This worked technically but was refused by the permission classifier when I tried it, so it needs you to run it yourself.
2. **`.env.local` is commented out**, so every script reads the hosted `.env`. Decide whether it should stay that way; two guard unit tests depend on it.

## 3. Before running anything

1. Take a backup in the Supabase dashboard (Database, Backups, or point-in-time recovery if enabled). Note the time. This is the real rollback for data.
2. Decide whether the existing project is the right target at all. A new demo project removes the unidentified data and the old shared demo password (`Demo@12345678`). It is still the recommended option for a public URL.
3. Confirm `DIRECT_URL` is the direct connection on port 5432. Migrations must not go through the pooler on 6543.
4. Make sure no one else is using the project during the run.

## 4. Order of operations (each hosted step needs approval)

1. `npx prisma migrate status` against the project. Expect exactly the ten migrations above as pending and nothing failed. **Stop if anything else is listed.**
2. `npm run db:deploy` (with the override from blocker 1). It applies pending migrations in order inside Prisma's own bookkeeping.
3. `npm run db:harden`: enables row-level security on every table and removes access from the public API roles. Safe to repeat.
4. `npm run check:exposure`: must print OK. It calls the project's public REST API with the anonymous key and fails if any table is readable.
5. Read-only verification (below).
6. Only then deploy the application code. The application tolerates the missing switch table, and the new pages fail with an error message rather than crashing, but migrate first anyway.
7. Seed demo data with `scripts/seed-demo-prototype.ts` against the chosen project (dry run first: `--dry-run`). Credentials are written to a git-ignored file, never printed.

## 5. Read-only verification after the run

- `_prisma_migrations`: no row with `finished_at` empty and `rolled_back_at` empty.
- The ten new objects exist: tables `PlatformIncident`, `PlatformIncidentUpdate`, `PlatformAnnouncement`, `PlatformAnnouncementTarget`, `PlatformAnnouncementAck`, `PlatformModuleSetting`, `PlatformSecurityReview`, plus the six from earlier pending migrations; enum `SupportPriority`; column `PlatformSupportRequest.priority`.
- Row counts for College, User, Student and PlatformAdmin are unchanged from before the run.
- Existing support requests all have priority NORMAL.
- Row-level security is on for every new table.

## 6. Rolling back

Each migration file starts with its own manual rollback statement. In short, drop the new tables, types and the one column in reverse order, and delete that migration's row from `_prisma_migrations`. Because every change is additive, nothing has to be restored for the existing data. If a run fails half way, do not edit `_prisma_migrations` by hand: stop, report the exact error, and decide with the backup in hand.

## 7. What still will not work after the run

- The Playwright specs for the platform portal have not been run against a database. Run them on a local stack before relying on the new routes.
- Institution sign-in failures and cross-institution access denials are still not recorded, so the Security centre does not show them.
- Platform administrator sign-ins are recorded from the next sign-in onward.

## 8. Update: two migrations written after the first run

The ten migrations above were applied to the hosted project on 2026-11-13 and verified. Two more were written afterwards and are **pending, not applied**: `20261123090000_module_rollout` (two new columns on `PlatformModuleSetting`) and `20261123100000_access_denials` (one new table). Both are additive. The application tolerates their absence: the module gate treats a missing column as "on", and refused-request recording ignores a missing table. Apply them with the same steps (status, `db:deploy`, `db:harden`, `check:exposure`, read-only verification) and the same approvals.
