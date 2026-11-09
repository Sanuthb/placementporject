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
