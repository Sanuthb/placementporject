# Local environment protection (Phase 4.4.1)

Goal: development, tests and database scripts reach **only the isolated Docker stack** (`tests/e2e/stack`: Postgres on `localhost:54330`, Auth on `localhost:54321`, mail sink on `54325/54326`), never a hosted Supabase project, unless a person deliberately says otherwise.

## What protects what
| Layer | What it does |
|---|---|
| `.env.local` (git-ignored with `.env*`) | Points the app, Prisma and the scripts at the Docker stack. Next.js reads it **after the real environment and before `.env`**, so it overrides the hosted values in `.env` without editing them. It holds throwaway local keys only (signed with a secret that only the local Auth container knows) and sets `REQUIRE_LOCAL_DB=true`. |
| `npm run guard:local` | Prints each guarded variable (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`), **where it comes from** (environment, `.env.local` or `.env`) and the **host and port it resolves to**, with a verdict. Exit 2 if any is not local. Never prints a credential. `npm run guard:local:check` also connects to the local database and Auth and reports database name, port and applied migrations. `--json` and `--dir <path>` are available. |
| Guarded npm scripts | `db:seed`, `db:platform-admin`, `db:platform-mfa-recovery`, `db:migrate`, `db:harden`, `db:deploy` and `check:exposure` run `guard:local` first. `build`, `db:generate` and `postinstall` are **not** guarded: they never connect, so hosted builds are unaffected. |
| `prisma.config.ts` | Loads `.env.local` then `.env`, and refuses `migrate`, `db` and `studio` commands against a non-local URL **even when `npx prisma ...` is typed directly**. `prisma generate` and `validate` still work. |
| The scripts themselves | `prisma/seed.ts`, `scripts/create-platform-admin.ts`, `scripts/platform-mfa-recovery.ts` and `scripts/check-exposure.mjs` load env files in the same order and refuse a non-local target before connecting or sending any request. |
| Runtime switch `REQUIRE_LOCAL_DB=true` | `lib/db.ts` refuses to open the database client if any guarded variable is not local. Not bypassable by the override below. A hosted deployment simply does not set it. |
| Test recorder | `tests/gate3/rec.mjs` refuses to run unless both `SUPABASE_URL` and `DIRECT_URL` are local. |

"Local" means the host is exactly `localhost`, `127.0.0.1` or `::1`. Look-alikes (`localhost.example.com`, `127.0.0.1.nip.io`, `0.0.0.0`, private IPs, `host.docker.internal`), unparseable values and passwords containing `@` or `:` are all handled **fail-closed**: anything not exactly local counts as remote.

## Using it
1. Start the stack: `bash tests/e2e/stack/up.sh` (Docker Desktop must be running).
2. Verify: `npm run guard:local:check` (expect four LOCAL rows and "local database: ok").
3. **Restart `next dev`.** A running dev server keeps the database client it created at start; a changed `.env.local` only takes effect for a new process.
4. Test suites still do `source tests/e2e/stack/env.sh`; the real environment wins over both files, so nothing changes for them.

## A deliberate, approved operation against something that is not local
Set `ALLOW_REMOTE_DB=I_UNDERSTAND_THIS_IS_NOT_LOCAL` for that one command (the exact text; `true` or `1` do not work). The guard then prints a loud warning instead of refusing. It does **not** override `REQUIRE_LOCAL_DB`. Hosted migrations are a separate, explicitly approved step.

## Tests
`tests/unit/localguard.test.mts` (45 assertions): host parsing and look-alikes, override rules, env-file precedence, the guard CLI, Prisma refusing before any connection, each script refusing, `prisma generate` still working, the runtime switch, and the package scripts. All "remote" hosts in it are fake `.invalid` names, so a failing guard still could not reach anything real.
