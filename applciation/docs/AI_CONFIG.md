# AI provider configuration, administration, usage and limits (Gate 4.4)

Status: **Gate 4.4 is complete** (4.4.1 local-only environment protection, 4.4.2 foundation, 4.4.3 call-path integration, 4.4.4 administration page and audit, 4.4.5 usage, limits and health, 4.4.6 verification). With nothing stored and no limits set, the environment variables and built-in defaults give exactly the behaviour the app had before. The text-based interview experience is unchanged; voice and agent redesigns remain on hold. SMS and WhatsApp remain on hold.

**Contents:** purposes and defaults, precedence, failure rules, encryption, rotation, schema and migration order, call-path integration, administration (4.4.4), usage and limits (4.4.5), health, operations, tests.

## Purposes and defaults
Three configurable purposes, each with its own provider, model, optional key and on/off switch:

| Purpose | Used for (today) | Provider and model default (exactly today's) | Existing environment variables |
|---|---|---|---|
| `TEXT` | all Groq text features | Groq `llama-3.3-70b-versatile` | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_API_BASE` |
| `VISION` | document reading | Groq `qwen/qwen3.8-27b` | `GROQ_API_KEY`, `GROQ_VISION_MODEL`, `GROQ_API_BASE` |
| `INTERVIEW` | mock interviews and the discussion simulator | Anthropic `claude-opus-5-5` | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` |

## Precedence (`lib/ai/config.ts`)
0. The **global kill switch** (`AiGlobalSetting`): off means every purpose is off, whatever follows. No row means on.
1. An **active row** in `AiProviderConfig` for the purpose: its provider and model; its stored key if it has one, otherwise the environment key **of that row's provider** (a purpose moved to Anthropic never borrows the Groq key, and the other way round).
2. **Environment variables** (table above).
3. The **built-in defaults**.

`enabled = false` on a row is the per-purpose **kill switch**: the purpose is off and does **not** fall through to the environment. Either switch makes `resolveForCall` refuse with `AI_DISABLED` (503), with a message that says which one; both are enforced before any request is built, so a switched-off purpose sends nothing to any provider and never uses a stored or environment key. Deleting the row returns the purpose to the environment and the defaults. A row with no key, and no environment key for its provider, is simply "not configured", which is how a missing key behaves today.

## Failure rules (never a silent change of provider or model)
| Situation | Result |
|---|---|
| Database cannot be read, a configuration was read earlier | The **last known configuration** is used (same provider, model, key), marked `stale`; the database is looked at again after 5 s and the problem is logged (purpose and reason, no key). |
| Database cannot be read, nothing known (cold start) | The call **fails**: 503 `AI_CONFIG_UNAVAILABLE`. It does not fall back to the environment, which could be a different provider or model from the one an administrator chose. Calls then fail fast for 2 s instead of hammering the database. |
| `AiProviderConfig` does not exist (migration not applied, as on a database not yet migrated) | "Nothing configured": the environment and defaults apply exactly as before. |
| Stored key cannot be decrypted (altered, wrong or retired master key, provider/purpose changed in the database) | The call **fails**: 503 `AI_KEY_UNREADABLE`. No fallback to a different key. |
| Purpose or platform switched off | 503 `AI_DISABLED`. If the global switch cannot be read after it was read as OFF, the last known OFF state is kept, so an outage cannot switch AI back on. |
| Purpose configured for a provider its call path cannot serve | 503 `AI_PROVIDER_UNSUPPORTED`; nothing is sent anywhere. **There is no automatic provider failover.** |
A read is cached for 30 s (one database read at a time per purpose however many calls arrive together), so another server instance sees a change within 30 s; a save made through the store invalidates this instance's cache at once.

## Encryption (`lib/ai/crypto.ts`)
- **AES-256-GCM**, a fresh random 96-bit IV for every encryption, 128-bit tag. Stored as text: `aigcm1.<masterKeyVersion>.<iv>.<tag>.<ciphertext>` (base64url).
- **Authenticated binding:** the row's id, purpose and provider are authenticated with the ciphertext. A ciphertext copied to another row, or a row whose provider or purpose was edited in the database (an attempt to send a key to another provider), fails authentication and is refused. Any change to IV, tag, ciphertext or the version label fails too.
- **Master keys** live only in the environment: `AI_MASTER_KEY_V<n>` (32 random bytes as base64, base64url or 64 hex characters) and `AI_MASTER_KEY_ACTIVE=<n>`, the version used to **encrypt**. Every older version stays available for **decrypting** until rotation finishes. Weak keys (one repeated byte), duplicate keys across versions and an active version with no key are rejected, and at startup `lib/env.ts` reports them as configuration errors that name the variable and never its value.
- **Version metadata:** the master-key version is inside every envelope and in `AiProviderConfig.keyVersion` (indexed), so progress is counted without decrypting anything. Operators can compare environments by a one-way **fingerprint** (12 hex characters) of each master key.
- **Secrecy:** a key is never returned, logged, put in an error message or an audit record. Inside the app it travels as a `Secret`, which prints, stringifies, serializes and inspects as `[hidden]`; only an explicit `.reveal()`, meant for the code that calls the provider, yields the value. The only thing shown about a stored key is its last four characters (and only for keys of 16+ characters). Keys must be 8–512 printable characters with no spaces.
- Generate a master key with `npm run ai:master-key -- <version>`; it connects to nothing and is the one place a master key is printed. Put it in the server environment, never in a committed file, chat or ticket.

## Master-key rotation (`lib/ai/rotate.ts`, `npm run ai:rotate-keys`)
1. Add the new key as `AI_MASTER_KEY_V<n+1>` (keep the old one) and deploy.
2. Set `AI_MASTER_KEY_ACTIVE=<n+1>`. New and changed keys now use it; old keys still decrypt.
3. `npm run ai:rotate-keys -- --dry-run` (decrypts and re-encrypts in memory, changes nothing), then `npm run ai:rotate-keys`. Options: `--to <version>`, `--batch <n>`. Exit 0 on success, 1 if any row failed or was changed by someone else mid-run (run it again), 2 if the target key is unavailable. The command is local-only unless `ALLOW_REMOTE_DB` is set deliberately (docs/LOCAL_ENV.md).
4. When the per-version counts show nothing left on the old version, the old master key may be removed.

Safety: nothing is written until the target key is confirmed; each row is re-encrypted, decrypted again and compared before it is saved; the save is a compare-and-set against the exact ciphertext read, so a key an administrator saved meanwhile is never overwritten (reported as a conflict); a bad row is reported by id, purpose and error code and skipped while the rest are rotated; it is idempotent and resumable (rows already on the target are skipped); plaintext exists only in zero-filled buffers; the report contains no key or ciphertext.

## Schema (migrations `20261117090000_ai_configuration`, `20261118090000_ai_global_switch` and `20261119090000_ai_usage_limits`, all additive)
Two enums (`AiProvider`: GROQ, ANTHROPIC; `AiPurpose`: TEXT, VISION, INTERVIEW) and two tables with no foreign keys and row-level security on (nothing granted to public roles, so the ciphertext cannot be read through the public API):
- `AiProviderConfig`: `id`, `purpose` (unique), `provider`, `model`, `enabled`, `keyCiphertext`, `keyVersion` (indexed), `keyLast4`, `keyUpdatedAt`, `keyUpdatedBy`, `createdAt`, `updatedAt`, `updatedBy`.
- `AiUsageDaily`: `day`, `collegeKey` (a college id or `platform`; not a foreign key), `purpose`, `provider`, `model`, `feature`, counts (`calls`, `failures`, `timeouts`, `rateLimited`) and `totalMs`, unique on the whole dimension tuple so concurrent counting can use an upsert (4.4.5). It contains no prompt, answer, transcript or personal data and has no column that could.

`AiGlobalSetting` (4.4.3): `id` (primary key, always `global`, enforced by a CHECK constraint), `enabled`, `reason` (free text, at most 300 characters), `updatedAt`, `updatedBy`; row-level security on, no grants to public roles, no foreign keys.

Usage and limits (4.4.5, `20261119090000_ai_usage_limits`): an enum `AiLimitKind` (`COLLEGE_DEFAULT`, `COLLEGE`, `PROVIDER`, `PURPOSE`); table `AiLimit` (`kind`, `key`, `dailyCalls`, `updatedAt`, `updatedBy`; unique on kind and key); table `AiQuotaCounter` (`day`, `scope` such as `college:<id>`, `provider:GROQ` or `purpose:TEXT`, `used`; unique on day and scope, which is what makes the concurrent counting safe); and one new column `AiUsageDaily.blocked` (default 0, so existing rows are unchanged) plus an index on `AiUsageDaily.day`. Row-level security is on for both new tables and nothing is granted to public roles.

**Migration order:** names sort `20261116090000_monitoring_history` < `20261117090000_ai_configuration` < `20261118090000_ai_global_switch` < `20261119090000_ai_usage_limits`, and Prisma applies migrations in name order (tested: a fresh deploy recorded them in exactly that order). The chain is dated ahead of the clock (the 4.x migrations carry 2026-11-13 onward while the machine clock reads 2026-11-11), so **any new migration must be named after `20261119090000`**: `prisma migrate dev` stamps the current date, which would sort *before* migrations that are already applied and be reported as drift. Create such a migration with an explicit later name.

**Rollback of the global switch:** `DROP TABLE "AiGlobalSetting";` and delete its row from `_prisma_migrations`. **Rollback** of the configuration tables (nothing references these objects): `DROP TABLE "AiUsageDaily"; DROP TABLE "AiProviderConfig"; DROP TYPE "AiPurpose"; DROP TYPE "AiProvider";` and delete the migration's row from `_prisma_migrations`. Verified: other tables unchanged, nothing left behind (enum types included), re-apply works.
**Rollback of the usage and limits migration** (undo this one first if you also undo the configuration migration): `DROP TABLE "AiQuotaCounter"; DROP TABLE "AiLimit"; DROP TYPE "AiLimitKind"; DROP INDEX "AiUsageDaily_day_idx"; ALTER TABLE "AiUsageDaily" DROP COLUMN "blocked";` and delete its row from `_prisma_migrations`. Verified on a scratch database with 30 existing usage rows: they keep every other column, nothing is left behind, re-apply works and there is no drift.
Deployment: apply with `npm run db:deploy` (guarded; local only until a hosted migration is explicitly approved), then `npm run db:harden`.

## Call path integration (Phase 4.4.3)
| Purpose | Call path | Features | Provider |
|---|---|---|---|
| `TEXT` | `groqCall`, `groqJsonMessages`, `groqJson` in `lib/intelligence/groq.ts` | Student 360 narrative, JD extraction, LMS tutor, open-answer marking, resume summary and bullets, writing-test marking, resource metadata | Groq (JSON-mode chat) |
| `VISION` | `groqCall("VISION")` | document reading (`readWithAi`) | Groq |
| `INTERVIEW` | `anthropicCreate` in `lib/mockInterview.ts` | mock interview (question, hint, improved answer, feedback) and the discussion simulator (topics, opening point, replies, evaluation) | Anthropic Messages API |

- **Unchanged:** request formats, response parsing, per-feature timeouts (Groq 25 s to 90 s, 50 s default; the Anthropic SDK's own), the Anthropic SDK's own retries, and every error status, code and message (including the `AI_NOT_CONFIGURED` texts and the college-level `aiDocumentReading` setting). The interview experience and its prompts are untouched.
- **Provider is fixed per purpose in this version** (table above): an administrator can change a purpose's model and key, but a configuration asking Groq to run the interview, or Anthropic to run text or vision, is refused (`AI_PROVIDER_UNSUPPORTED`) because no adapter exists for it. The 4.4.4 API must only offer the supported provider for each purpose.
- **Environment variables are read at call time** (not at start-up), so a rotated or removed environment key takes effect immediately.
- **Availability checks** (`groqAvailable`, `aiAvailable`; used to hide writing tests, show "AI available" on the Student 360 page and in document reading, and to make open-answer marking wait for staff) are now asynchronous and are false when either switch is off, no key is available or the provider is unsupported. A configuration that cannot be read counts as "not available".
- **The recorded model is the model that served the call.** Document reading and the Student 360 report resolve once, pass that resolution to the call, and store its model name in `DocumentExtraction.model` and `StudentIntelligenceReport.model` (and the audit entry).
- **One deliberate error-handling change:** the Anthropic wrapper now maps a refused key (401 or 403) to 503 `AI_NOT_CONFIGURED` ("The AI key was refused. Check the AI settings"), the same as the Groq path, instead of a vague 502.
- **Provider error bodies and prompts are never logged.** Previously the Groq path logged the first 300 characters of the provider's error response, the interview wrapper logged the SDK error message (which embeds the response body), the Student 360 narrative logged a schema error string, and the automatic-refresh handler logged a raw error message; any of these can echo a prompt or a student's answers. Logs now carry only the purpose, model, HTTP status, error class and request id; schema failures log field paths and codes; the refresh handler logs an error class and code (`safeFailure`). Tested with mock providers that echo the prompt in their error bodies.
- **Caches:** the configuration is cached per instance for 30 s, so another server instance sees an administrator's change within that time (a change made through the store takes effect immediately in the same process).
- **Added in 4.4.5:** every provider call now passes through `withAiCall` (`lib/ai/gate.ts`), which checks the daily limits before anything is sent and records the outcome afterwards (see Usage and limits). The AI health check now follows the resolver (see Health).
- **Known limitation:** Anthropic calls are not in the monitoring page's in-memory per-instance tally (they are in the durable usage statistics).

## Administration (Phase 4.4.4)
Platform administrators only (`platformRoute`: a verified second factor is required, so an institution administrator, a student, a password-only platform admin and an admin without an authenticator are all refused). Page: `/platform/ai` (linked from the platform and monitoring pages). API:

| Method and path | What it does |
|---|---|
| `GET /api/platform/ai` | Overview: the global switch, master-key status (versions only, never a key), and per purpose the stored configuration, the effective configuration (what a call would use now), problems and warnings. |
| `PUT /api/platform/ai/global` | The global kill switch (with an optional reason). Needs no master key. |
| `PUT /api/platform/ai/purposes/{TEXT\|VISION\|INTERVIEW}` | Model, enabled and, optionally, a new key (`apiKey`) or its removal (`apiKey: null`). The provider is fixed per purpose; asking for another is refused (422). `expectedUpdatedAt` makes a stale edit fail with 409 `CONFLICT` instead of overwriting someone else's change. Storing a key needs a master key on the server. |
| `DELETE /api/platform/ai/purposes/{purpose}` | Reset to the server environment (removes the stored row, including its key). |
| `POST /api/platform/ai/purposes/{purpose}/test` | Checks a key (the typed one, else the stored or environment one) by **listing the provider's models**: no completion, no tokens, no prompt, nothing billed. Reports works / refused / rate limited / unavailable / timed out and whether the chosen model is listed. |

Writes are rate limited per administrator (60 per 10 minutes) and tests (12 per 10 minutes). Every change and its audit rows are written in **one transaction**, so there is never a change without its audit record or the reverse. Audit actions: `ai.model.change`, `ai.key.replace`, `ai.key.remove`, `ai.purpose.enable`, `ai.purpose.disable`, `ai.config.save`, `ai.config.reset`, `ai.global.enable`, `ai.global.disable`, `ai.provider.test`, `ai.limit.set`, `ai.limit.remove`. Details hold the provider, model, switches, the key's last four characters and master-key version: never a key or ciphertext. Keys are write-only: the page and API never show one again, the field is a password field, and the key is cleared from the page after saving.

## Usage and limits (Phase 4.4.5)
**What is recorded** (`AiUsageDaily`, via `lib/ai/usage.ts`): one row per day, institution, purpose, provider, model and feature, holding counts (`calls`, `failures`, `timeouts`, `rateLimited` by the provider, `blocked` by a daily limit) and total time. **Never** a prompt, answer, student, user, document or key: the table has no column that could hold one, and model and feature values that are not plain names are replaced before they are stored. Institution attribution comes from the request (`lib/ai/context.ts`: the staff, student and recruiter API wrappers run each handler with the signed-in person's institution id; a call outside any request, or with a value that is not a valid id, counts as `platform`). Recording is best effort: bounded to one second, never throws, so a statistics problem cannot fail an AI call. Features: `jd_parse`, `resume_summary`, `resume_bullets`, `lms_tutor`, `open_marking`, `writing_review`, `intelligence_narrative`, `resource_metadata`, `document_read`, `interview_question`, `interview_hint`, `interview_improve`, `interview_feedback`, `discussion_topics`, `discussion_open`, `discussion_reply`, `discussion_evaluation`.

**Reading** (`GET /api/platform/ai/usage?days=1..90&page=n`): totals, breakdowns by purpose, provider, model and feature, a daily trend, usage per institution (paginated, at most 50 per page, institution ids resolved to names, `Platform` for non-institution work, `Unknown institution` for an id no longer in the college table), and today's consumption against limits. Every query is bounded (at most 90 days, at most 50 groups per breakdown); a period outside 1 to 90 or an unknown parameter is a 400.

**Limits** (`GET/PUT /api/platform/ai/limits`, `lib/ai/limits.ts`): **there are no built-in limits.** The platform ships with none and invents none: until an administrator sets one, every call is allowed (and still counted). A limit is a whole number of calls per **UTC day**, 0 to 10,000,000, of one kind:
- `COLLEGE_DEFAULT` (key `*`): the allowance for every institution that has no limit of its own;
- `COLLEGE` (key: the institution id): that institution's own allowance, which replaces the default for it;
- `PROVIDER` (`GROQ` or `ANTHROPIC`) and `PURPOSE` (`TEXT`, `VISION`, `INTERVIEW`): platform-wide allowances.
A limit of 0 stops every call in its scope; removing a limit (`dailyCalls: null`) removes it. Suggested starting points when you decide to use limits, to be tuned from the usage numbers rather than guessed: watch a typical week of usage per institution first, then set the institution default a little above the busiest normal day, and use a provider limit as a cost ceiling. The existing per-user rate limits on the individual routes (for example 40 JD readings an hour per user) are separate and unchanged.

**Enforcement:** a call reserves its place before anything is sent. The reservation is one conditional upsert per scope (`INSERT ... ON CONFLICT (day, scope) DO UPDATE SET used = used + 1 WHERE used < limit`) inside one transaction, so two simultaneous calls can never both take the last slot (tested: 80 simultaneous calls against a limit of 25 allow exactly 25), and if any scope is full the whole reservation rolls back and nothing is charged. Scopes are locked in a fixed order so concurrent reservations cannot deadlock. A refused call never reaches the provider and answers **429 `AI_LIMIT_REACHED`** ("The daily AI limit has been reached. Try again tomorrow, or ask your administrator to raise the limit"): the message names no institution, provider or number, so one institution learns nothing about another's usage. Attempts are counted, so a call that later fails still used its place. Limits are cached for 15 seconds per instance (the instance that changes a limit sees it at once). **If the limit tables cannot be read or written, the call is allowed** (and the problem logged without values): an accounting problem must not take AI down, and the global kill switch is the tool for stopping AI.

**Retention:** usage rows are kept 90 days and quota counters 3 days. `pruneAiUsage()` deletes in batches of 1,000 and runs after the monitoring housekeeping in the hourly round-reminders job; it never fails the job.

## Health (Phase 4.4.5)
The platform monitoring page's **AI provider** component now follows the same resolver as the calls (`lib/aiHealth.ts`): a key stored through the administration page counts, not only the environment key. It runs one free model-list check per provider in use (Groq and Anthropic), reports the switches, an unreadable stored key (`AI_KEY_UNREADABLE`, naming the purpose but never the value), a stale configuration (database unreadable, last known configuration in use), today's calls, failures and calls refused by a limit, and any limit at 80% or more of its allowance. A global switch that is off is reported as "AI is switched off by a platform administrator" (not as a provider fault). Statuses keep their meaning: unavailable when the provider cannot be reached or refuses the key; degraded for rate limiting, slowness, mostly failing real calls, or a configuration problem; healthy otherwise. The check never makes a paid request.

## Operations
- **Day to day:** open `/platform/ai`; change a model or key per purpose; use **Test key** before saving; use the global switch in an incident (it overrides everything and survives a database outage as OFF).
- **Setting up the master key:** `npm run ai:master-key -- 1`, put `AI_MASTER_KEY_V1` and `AI_MASTER_KEY_ACTIVE=1` in the server environment (never in a file that is committed), then restart. Without it the page works for models and switches but keys cannot be stored (the page says so).
- **Rotation:** see above.
- **Provider incident:** switch the affected purpose off (or all AI), tell staff; there is no automatic failover by design, so nothing changes provider without an administrator choosing it.
- **Hosted environments:** this phase was built and tested only against the isolated local Docker stack. Applying the migrations to a hosted database, setting the master key there and enabling limits are separate, deliberate steps that have not been taken.

## Tests
- `tests/unit/aiconfig.test.mts` (unit, no database or network): master keys, AES-256-GCM, tampering and row binding, the `Secret` wrapper, in-memory rotation, the resolver's precedence and failure matrix, the global switch, the supported-provider rule, `ApiError` compatibility, startup validation, and a check that no test key was ever printed.
- `tests/integration/aiconfig.db.test.mts` (`npm run test:ai-config:db`): schema, encryption at rest, concurrency, SQL tampering, a real outage through a TCP proxy, a missing table, real rotation (including concurrent rotations and rotation racing administrator saves) and the rotation command.
- `tests/integration/aicalls.db.test.mts` (`npm run test:ai-calls:db`): the real Groq and Anthropic call paths and features against **mocked providers** (two local HTTP servers) and the local database: environment-only behaviour and request formats, legacy not-configured errors, database configuration, per-purpose and global switches (no request reaches any provider), no failover, unreadable keys, a real database outage, a missing table, error mapping, timeouts, and log hygiene (provider error bodies and prompts never appear in output).
- `tests/integration/ai-config-migration.mjs` (`npm run test:ai-config:migration`): all three migrations and their ordering on a scratch database: additive SQL, fresh deploy, upgrade over data, no drift, rollback that leaves nothing behind, re-apply.
- `tests/integration/aiusage.db.test.mts` (`npm run test:ai-usage:db`): counting and limits against the real database: no built-in limits, 80 simultaneous calls against a limit of 25, institution limits and the default, nothing charged when any scope is full, zero limits, validation, audit in the same transaction, failure of the counter table never blocks a call, day rollover, outcomes through the gate, institution attribution, safe names only, summaries, pagination, retention and consumption.
- `tests/gate3/g4-04-ai-admin.mjs` (SA-TC-006, 058, 059, 062) and `tests/gate3/g4-05-ai-usage.mjs` (SA-TC-060, 061, 062, 058): the administration, usage and limits APIs over real HTTP against a production build with mocked providers: access control, exact counts, limit enforcement through a real AI-backed route, strict validation, audit, health, and a secret sweep over every response, audit row, usage row and server output.
- `tests/web/platform-ai.spec.ts` (Playwright, Chrome, local): the page for configuration, masking, validation, switches, error and mobile states, and for usage and limits (numbers, breakdowns, warnings, empty, error, limit editing, mobile).

No real provider is ever contacted.
