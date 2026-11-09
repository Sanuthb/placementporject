# M2 Institution Management: what exists, what was added

Existing and retained, unchanged in behaviour: college profile, campuses, departments, programmes, branches, academic years, batches
(with coordinator), semesters, student academic mapping (`lib/academicMapping.ts`), invitations, institution settings, `collegeId` isolation.

## Added
| Area | What | Where |
|---|---|---|
| Faculty | `FACULTY` role (staff `User`, no second auth). Profile, departments, programme and batch allocation, mentor per student. Deny-by-default for faculty-only sessions. | `lib/faculty.ts`, `app/api/settings/faculty/*`, `app/api/faculty/*`, `components/faculty-panel.tsx` |
| University | `University` per college; `Program.universityId` (legacy `Program.university` text kept and kept in step). | `app/api/settings/universities/*`, `lib/academicIntegrity.ts` |
| Provisioning | Platform-admin-only: college + settings + modules + first TPO admin (+ optional departments / academic year), one transaction, audited. | `lib/provision.ts`, `app/api/platform/institutions/*`, `app/platform/page.tsx` |
| Platform boundary | `PlatformAdmin` table, no API writes to it; added with `npm run db:platform-admin`. Has no `User` row, so reaches no college route. | `lib/auth/platform.ts`, `lib/api/platformHandler.ts` |
| Integrity | Branch-of-programme checks now also scoped by college; programme department change blocked while students would be left mismatched; read-only violation report. | `app/api/settings/integrity` |

## Decisions
- Faculty access = mentees + students of allocated batches/programmes. Departments are affiliation and bound what can be allocated.
- Faculty-only sessions are refused by every route unless it lists `FACULTY` or sets `facultyOk` (fixes 18 routes that had no role list).
- A multi-role user keeps the union of their roles; FACULTY adds nothing beyond the faculty routes.
- Universities are per college (programmes are), unique by code and by case-insensitive name.
- One login belongs to one college (`User.id` = Supabase auth id), so the same email cannot administer two institutions.

## Platform administrator two-step sign-in (mandatory)
- Enforced in `getPlatformSession` (`lib/auth/platform.ts`) for every `/api/platform/*` route except the enrolment/challenge/status routes. It does not read any college setting.
- No authenticator enrolled → `403 MFA_SETUP_REQUIRED`. Enrolled but password-only session → `403 MFA_REQUIRED`. Supabase unreachable → `503` (fails closed). State is read fresh each request (no cache).
- Enrol / challenge go through `/api/platform/mfa/{enroll,verify}` so each step is audited in `PlatformAuditLog`; wrong codes limited to 10 per 10 minutes.
- Removal: `DELETE /api/platform/mfa` needs an already-verified session plus a fresh code. Afterwards platform access is refused until a new authenticator is enrolled.
- Recovery (lost phone): `PLATFORM_ADMIN_EMAIL=… PLATFORM_RECOVERY_CONFIRM=… npm run db:platform-mfa-recovery` (needs the service-role key; audited as `platform.mfa.recovery`, with the operator). Do it with the administrator present and identity confirmed out of band, because whoever signs in next with the password can enrol.
- The `/platform` page is a client shell with no data of its own; every byte of platform data comes from the API, which does the enforcing.

## Local, isolated end-to-end stack
`bash tests/e2e/stack/up.sh` starts Postgres, Supabase Auth (GoTrue), Storage and a mail sink in Docker, applies all migrations and seeds one college. `source tests/e2e/stack/env.sh` points the app and tests at it. `tests/e2e/run.mjs` refuses to run unless `SUPABASE_URL` and `DIRECT_URL` are local.
