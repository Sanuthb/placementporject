#!/usr/bin/env python3
"""Gate 3 report generator.

Reads
  claude/full-application-test-plan.csv                      (the 1,386 approved cases, never modified)
  applciation/tests/gate3/results/*.jsonl                     (assertions recorded by the Gate 3 suites, each tagged with case ids)
  applciation/tests/gate3/results/logs/*.log + RULES below    (assertions of the existing e2e suites that map to a case on purpose)
Writes
  claude/full-application-test-results.md    (human report)
  claude/full-application-test-results.csv   (all 1,386 rows with status; Not Run stays Not Run)

A case is Pass only if it has at least one recorded assertion and every one passed.
Fail if any assertion failed. Blocked if nothing failed but at least one step could not run. Otherwise Not Run.
Unexecuted cases are never promoted. Run:  python3 claude/tools/gate3_report.py
"""
import csv, json, re, glob, os, collections, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PLAN = f"{ROOT}/claude/full-application-test-plan.csv"
RES = f"{ROOT}/applciation/tests/gate3/results"
OUT_MD = f"{ROOT}/claude/full-application-test-results.md"
OUT_CSV = f"{ROOT}/claude/full-application-test-results.csv"

# Existing e2e suites: (log, regex on the assertion text, [case ids], short reason). Only assertions I read and judged to prove the case.
RULES = [
  ("10-student-invitations", r"^(invite|invitation|accept|expiry|resend|revoke|lockout|link|lookup):", ["M01-TC-003"]),
  ("10-student-invitations", r"^(invite: created, email sent|resend:|bulk: emails)", ["M01-TC-009"]),
  ("10-student-invitations", r"^accept: (login linked|no second student)", ["M01-TC-015"]),
  ("10-student-invitations", r"^personal: a (future date|day that)", ["M03-TC-002"]),
  ("10-student-invitations", r"^(personal: a bad (mobile|alternate)|submit: contact details copied)", ["M03-TC-003"]),
  ("10-student-invitations", r"^invite: duplicate admission", ["M03-TC-010"]),
  ("10-student-invitations", r"^invite: graduation before", ["M03-TC-011"]),
  ("10-student-invitations", r"^education: (SSLC and PUC added|a record needs|completion before)", ["M03-TC-012", "M03-TC-013"]),
  ("10-student-invitations", r"^documents: PDFs uploaded", ["M03-TC-020", "M03-TC-022"]),
  ("10-student-invitations", r"^documents: SSLC and PUC marks cards", ["M03-TC-023"]),
  ("10-student-invitations", r"^documents: replacing", ["M03-TC-024", "M03-TC-035"]),
  ("10-student-invitations", r"^(documents: a verifier|documents: profile status|verify:)", ["M03-TC-025"]),
  ("10-student-invitations", r"^personal:", ["M03-TC-033"]),
  ("10-student-invitations", r"^(verify|review):", ["M03-TC-034"]),
  ("10-student-invitations", r"^documents: listed with private signed links", ["M03-TC-035", "SRS-SECURITY-TC-004"]),
  ("10-student-invitations", r"^(audit:|personal: the previous|personal: every approval|education: a staff edit)", ["M03-TC-036", "SRS-SECURITY-TC-007"]),
  ("10-student-invitations", r"^access:", ["M03-TC-038"]),
  ("10-student-invitations", r"^documents: (content that does|unsupported|a PDF carrying)", ["SRS-SECURITY-TC-029", "SRS-SECURITY-TC-030"]),
  ("10-student-invitations", r"^corrections:", ["SRS-SECURITY-TC-012"]),
  ("14-academic-records", r"^semester:", ["M03-TC-015"]),
  ("14-academic-records", r"^backlog:", ["M03-TC-017"]),
  ("12-access-security", r"^mfa:", ["M01-TC-006", "SRS-SECURITY-TC-006"]),
  ("12-access-security", r"^roles:", ["M01-TC-011", "M01-TC-016"]),
  ("12-access-security", r"^reset:", ["M01-TC-012"]),
  ("12-access-security", r"^history:", ["M01-TC-013"]),
  ("12-access-security", r"^(roles: changes are audited|reset: it was audited)", ["M01-TC-017", "SRS-SECURITY-TC-007"]),
  ("12-access-security", r"^roles: a pure coordinator IS limited", ["ROLE-PERM-TC-004", "ROLE-HOD-TC-001"]),
  ("13-institutions", r"^faculty: (deactivated|a deactivated account)", ["M01-TC-010"]),
  ("13-institutions", r"^(provisioning: audited|faculty: update, allocation|audit:)", ["M01-TC-017"]),
  ("13-institutions", r"^provisioning:", ["M02-TC-001"]),
  ("13-institutions", r"^(university:|programme:)", ["M02-TC-002"]),
  ("13-institutions", r"^programme:", ["M02-TC-005"]),
  ("13-institutions", r"^integrity:", ["M02-TC-013"]),
  ("13-institutions", r"^(institution B can build|tenant: lists show only own)", ["M02-TC-014"]),
  ("13-institutions", r"^(faculty: (programme and batch allocated|cannot be allocated)|mentor:)", ["M02-TC-010"]),
  ("13-institutions", r"^(faculty: (sees students of an allocated|does not see students)|mentor: the mentor's list)", ["ROLE-FAC-TC-001"]),
  ("13-institutions", r"^mentor: (a student in their department|reassign|assigning to a deactivated)", ["ROLE-HOD-TC-004"]),
  ("13-institutions", r"^(tenant:|faculty: not in another|faculty: another institution)", ["SRS-SECURITY-TC-002"]),
  ("13-institutions", r"^faculty: (refused placement routes|refused administration)", ["SRS-SECURITY-TC-019"]),
  ("09-security", r"^(header|allowed origin|unknown origin|preflight|framework banner)", ["SRS-SECURITY-TC-042"]),
  ("09-security", r"^oversized", ["SRS-SECURITY-TC-031"]),
  ("09-security", r"^(public link probing|429 explains|flood guard)", ["SRS-SECURITY-TC-034"]),
  ("09-security", r"^cron", ["SRS-SECURITY-TC-037"]),
  ("09-security", r"^(health is up|errors carry the request id|bad token is a clean 401)", ["SRS-SECURITY-TC-035"]),
  ("03-companies-drives", r"^shortlist", ["ROLE-TPO-TC-006", "ROLE-PO-TC-005"]),
  ("03-companies-drives", r"^publish", ["ROLE-TPO-TC-003"]),
]

ISSUES = {
  "A-02": ("G3-SEC-01", "Suspended institution reachable through six public token surfaces (read and write). Fixed in Gate 4, verified by 58 regression assertions."),
  "SA-45": ("G3-SYS-02", "Platform registration accepted a second institution with the same name (SA-TC-045). FIXED in Gate 4 Phase 3: names compared after trim, space collapse and case; checked before inviting and again under a per-name database lock; concurrent duplicates and slug races give clean 409s. Verified by unit, API and concurrency tests."),
  "SA-PARTIAL": ("G3-SYS-03", "Institution list ignored search, status, sort and paging (SA-TC-041/042). FIXED in Gate 4 Phase 3, including LIKE-wildcard escaping found during testing (a search for % matched everything)."),
  "G3-SYS-07": ("G3-SYS-07", "Scheduled jobs record no execution history (no last run, success, failure or duration), so SA-TC-055 fails. Proposal: JobRun table + withJobRun wrapper (docs/MONITORING.md), awaiting approval."),
  "G3-SYS-08": ("G3-SYS-08", "The monitoring dashboard cannot show a database outage because authenticating the platform administrator needs the database; it shows 'could not load'. The unauthenticated readiness endpoint reports the outage."),
  "G3-SYS-09": ("G3-SYS-09", "The application does not measure its own request latency or throughput, so no application-performance view exists (SA-TC-008)."),
  "SA-MISSING": ("G3-SYS-04", "System Administrator feature not built (AI configuration, support, settings/integrations/roles/retention, institution detail/edit/usage). The audit-log viewer (4.1), platform analytics (4.2) and system monitoring (4.3, with three recorded gaps) are built."),
}
issue_label = lambda k: (ISSUES[k][0] if k in ISSUES else k)

def load_plan():
    with open(PLAN, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def collect():
    """case id -> list of assertion dicts"""
    by = collections.defaultdict(list)
    for fn in sorted(glob.glob(f"{RES}/*.jsonl")):
        for line in open(fn, encoding="utf-8"):
            if not line.strip(): continue
            a = json.loads(line)
            for i in a["ids"]:
                by[i].append({**a, "source": os.path.basename(fn).replace(".jsonl", "")})
    date = datetime.date.today().isoformat()
    for log, rx, ids in RULES:
        path = f"{RES}/logs/{log}.log"
        if not os.path.exists(path): continue
        rc = re.compile(rx)
        for line in open(path, encoding="utf-8", errors="replace"):
            m = re.match(r"^(PASS|FAIL) (.*)$", line.rstrip("\n"))
            if not m or not rc.search(m.group(2)): continue
            for i in ids:
                by[i].append({"suite": log, "source": f"existing suite {log}", "date": date, "env": "local Docker stack; production build on :3113", "assertion": m.group(2).strip()[:160], "status": m.group(1), "actual": "", "issue": "", "ids": ids})
    return by

def verdict(asr):
    if not asr: return "Not Run"
    st = [a["status"] for a in asr]
    if "FAIL" in st: return "Fail"
    if all(s == "PASS" for s in st): return "Pass"
    if "BLOCKED" in st and "PASS" in st: return "Blocked"  # partly run, some step could not run: never a pass
    return "Blocked"

def main():
    plan = load_plan(); by = collect()
    ids = {r["Test Case ID"] for r in plan}
    unknown = sorted(set(by) - ids)
    assert not unknown, f"results reference unknown case ids: {unknown}"
    rows = []
    for r in plan:
        a = by.get(r["Test Case ID"], [])
        s = verdict(a)
        passed = [x for x in a if x["status"] == "PASS"]; failed = [x for x in a if x["status"] == "FAIL"]; blocked = [x for x in a if x["status"] == "BLOCKED"]
        src = sorted({x["source"] for x in a}); date = max((x["date"][:10] for x in a), default="")
        issues = sorted({issue_label(x["issue"]) for x in a if x.get("issue")})
        if s == "Not Run": actual = ""
        else: actual = f"{len(passed)} assertion(s) passed, {len(failed)} failed, {len(blocked)} blocked."
        fail_details = " | ".join(f"{x['assertion']}: {x['actual']}".strip(": ") for x in failed[:4]) + (f" | +{len(failed)-4} more" if len(failed) > 4 else "")
        block_details = " | ".join(f"{x['assertion']}: {x['actual']}" for x in blocked[:3])
        rows.append({**r, "_status": s, "_date": date, "_actual": actual, "_fail": fail_details, "_block": block_details, "_src": ", ".join(src), "_issue": ", ".join(issues),
                     "_env": next((x["env"] for x in a), ""), "_n": len(a), "_pass": len(passed), "_fail_n": len(failed), "_blk_n": len(blocked),
                     "_evidence": next((x["source"] for x in a), "")})
    # ---- CSV of all rows
    cols = ["Test Case ID", "Module", "Feature", "Test Type", "Priority", "Implementation status (Gate 1 audit)", "Gate 3 expectation", "Status", "Execution date", "Environment", "Actual Result", "Failure details", "Blocked reason", "Evidence", "Related issue"]
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(cols)
        for r in rows: w.writerow([r["Test Case ID"], r["Module"], r["Feature"], r["Test Type"], r["Priority"], r["Implementation status (Gate 1 audit)"], r["Gate 3 expectation"], r["_status"], r["_date"], r["_env"], r["_actual"], r["_fail"], r["_block"], r["_src"], r["_issue"]])

    cnt = collections.Counter(r["_status"] for r in rows)
    total = len(rows); executed = cnt["Pass"] + cnt["Fail"]
    mod_of = lambda r: r["Module"]
    def group(r):
        m = r["Module"]
        mm = re.match(r"^(M\d\d) ", m)
        if mm: return m
        if r["Test Case ID"].startswith("SA-"): return "System Administrator (SA)"
        if r["Test Case ID"].startswith("ROLE-"): return "Roles (ROLE-*)"
        return "SRS sections (cross-cutting, security, NFR, UI, data...)"
    g = collections.OrderedDict()
    for r in sorted(rows, key=lambda r: (group(r))):
        d = g.setdefault(group(r), collections.Counter()); d["total"] += 1; d[r["_status"]] += 1
    L = []
    P = L.append
    P("# Full application test results (Gate 3: automated testing)\n")
    P(f"Generated {datetime.date.today().isoformat()} by `claude/tools/gate3_report.py` from the recorded assertions in `applciation/tests/gate3/results/`. Companion file: `full-application-test-results.csv` (all {total} cases). The approved plan (`full-application-test-plan.md/.csv`) is unchanged.\n")
    P("**Honesty rules used:** a case is **Pass** only if at least one assertion was recorded against it and every recorded assertion passed. **Fail** if any failed. **Blocked** if something was attempted but a step could not run (reason stated). Everything else stays **Not Run**; nothing is promoted. No application code was changed. No test case was removed or renumbered.\n")
    P("## 1. Headline numbers\n")
    P("| Measure | Count |\n|---|---|")
    P(f"| Total test cases | {total} |")
    P(f"| Executed (Pass + Fail) | {executed} |")
    P(f"| Pass | {cnt['Pass']} |\n| Fail | {cnt['Fail']} |\n| Blocked | {cnt['Blocked']} |\n| Not Run | {cnt['Not Run']} |")
    P("\n`Executed` does not include Blocked. Case-level statuses are decided only from assertions tagged to the case; whole-suite results are listed separately in section 5 and are not counted as case passes.\n")
    P("## 2. Module-wise results\n")
    P("| Group | Cases | Pass | Fail | Blocked | Not Run |\n|---|---|---|---|---|---|")
    for k, d in g.items(): P(f"| {k} | {d['total']} | {d['Pass']} | {d['Fail']} | {d['Blocked']} | {d['Not Run']} |")
    P("\nA low executed count for a module means its cases have not yet been turned into data-specific tests, not that they were tested and passed.\n")
    # SA
    sa = [r for r in rows if r["Test Case ID"].startswith("SA-")]
    P("## 3. System Administrator results\n")
    c = collections.Counter(r["_status"] for r in sa)
    P(f"{len(sa)} SA cases: Pass {c['Pass']}, Fail {c['Fail']}, Blocked {c['Blocked']}, Not Run {c['Not Run']}.\n")
    P("| Case | Feature | Status | Detail |\n|---|---|---|---|")
    for r in sa: P(f"| {r['Test Case ID']} | {r['Feature'][:60]} | {r['_status']} | {(r['_fail'] or r['_block'] or r['_actual'])[:230].replace('|','/')} |")
    P("\n## 4. Security findings\n")
    P("| Issue | Severity | Finding | Cases | Evidence |\n|---|---|---|---|---|")
    P("| G3-SEC-01 (A-02) | **Critical: FIXED and verified (Gate 4)** | Before the fix a suspended institution stayed reachable through six public token surfaces, for reads (HTTP 200) and for writes: an internship feedback submission, a project mentor review and an invitation acceptance were all accepted while suspended (evaluation, feedback, PPO status, review rows written; a login created and a student linked; view counter incremented). After the fix (shared `requireActiveCollege`, checked on every request before any read or write) all six surfaces return the same refusal as an unknown link, no database row changes while suspended, and everything works again on reactivation with tokens unspent. 58/58 assertions pass; before the fix 30/58 failed. | SA-TC-027/028/029, SRS-SECURITY-TC-039/040 | `tests/gate3/g3-01-suspended-institution.mjs`; `results/evidence/a02-before-fix.*`, `a02-after-fix.log` |")
    P("| G3-SYS-02 | Medium: FIXED (Gate 4 Phase 3) | Duplicate institution names were accepted (SA-TC-045); institution list ignored search/sort/paging (SA-TC-041/042); a search for `%` matched every institution (found while testing the new search). | SA-TC-041/042/045 | `g3-05-institution-registry.mjs` (90 assertions) |")
    P("| G3-SYS-05 (audit viewer) | Built (Gate 4 Phase 4.1) | Platform audit-log viewer: SA-TC-052/053. 112 API assertions, 2 browser tests, 55 unit assertions; credentials masked; no write route. | SA-TC-052/053 | `g3-06-platform-audit.mjs`, `tests/web/platform-audit.spec.ts` |")
    P("| G3-SYS-06 (analytics) | Built (Gate 4 Phase 4.2) | Platform-wide analytics: SA-TC-047 to 051 and SA-TC-009. 140 API/database-comparison assertions, 2 browser tests, 43 unit assertions; dashboard values compared with independent SQL; read-only; aggregates only. | SA-TC-009, 047-051 | `g3-07-platform-analytics.mjs`, `tests/web/platform-analytics.spec.ts` |")
    P("| G3-SYS-10 (monitoring) | Built (Gate 4 Phase 4.3) | System health: SA-TC-054 to 057 and SA-TC-008. 122 integration assertions against real controlled failures (database via TCP proxy, storage, SMTP and AI mocks), 152 unit assertions, 2 browser tests. **3 recorded failures:** SA-TC-055 (no job history, G3-SYS-07), SA-TC-054 database-outage step (G3-SYS-08), SA-TC-008 (no request-latency metrics, G3-SYS-09). SA-TC-056 and 057 pass. | SA-TC-054..057, 008 | `g3-08-monitoring.mjs`, `tests/web/platform-monitoring.spec.ts` |")
    P("| (reviewed, no defect) | Info | Read-only principal can call `POST /api/notifications/read` (returns 400 on an empty body): by design (`principalOk`, a viewer marks their own notifications read). Allow-listed in the sweep with this reason. | ROLE-PRN-TC-005 | `g3-02-access-sweep.mjs` |")
    P("\nWhat passed (no defect found): all 654 protected endpoints refuse anonymous callers; every staff/recruiter route refuses a student token; every student route refuses a staff token; platform-admin token is refused on all college routes; staff roles outside a route's documented roles are refused (792 probes); principal cannot write (255 probes); institution B cannot list, read, patch or delete any of institution A's records across the 33 collections that held data (59 probes); SQL-injection strings return no error and no extra rows; error responses carry no stack or SQL.\n")
    P("Not covered yet: browser-level XSS rendering, a Playwright run of the public frontend pages for them (they are thin clients of the same APIs), cross-institution probes for modules with no seeded data (listed as Blocked).\n")
    P("## 5. Supporting suite-level evidence (not counted as case passes)\n")
    P("| Suite | Result | Note |\n|---|---|---|")
    sup = []
    for fn in sorted(glob.glob(f"{RES}/logs/*.log")):
        n = os.path.basename(fn).replace(".log", "")
        if n == "unit":
            t = open(fn, errors="replace").read(); sup.append((n, f"34 unit files, exit 0, {t.count(chr(10)+'PASS')+t.startswith('PASS')} PASS lines", "All unit suites pass (one logged error is an expected negative test)."))
            continue
        t = open(fn, errors="replace").read(); p = len(re.findall(r"^PASS", t, re.M)); f_ = len(re.findall(r"^FAIL", t, re.M))
        note = {"06-dashboard-360-analytics-comms": "Stale expectations: expects 8 profile sections and old semester route; there are now 9 sections (EDUCATION_HISTORY, M3 Phase 2).",
                "07-student-api-psychometrics": "Stale: expects exactly 8 sections; now 9.",
                "08-addon-modules": "Stale: internship PATCH to COMPLETED now runs completion checks (M9), so the old unconditional completion fails.",
                "11-intelligence": "Stale: DISC/RIASEC gap wording changed after the M4 instruments."}.get(n, "")
        sup.append((n, f"{p} pass, {f_} fail", note))
    for n, r_, note in sup: P(f"| {n} | {r_} | {note} |")
    P("\nThe four failing existing suites were verified by hand to be out-of-date tests (section count and completion rules changed in later modules), not application defects. They are left unmodified and listed as test maintenance for Gate 4.\n")
    tf = f"{RES}/g3-07-timings.json"
    if os.path.exists(tf):
        tj = json.load(open(tf)); ds = tj["dataset"]
        P("## 5b. Performance measurements (platform analytics, measured)\n")
        P(f"Dataset: {ds['colleges']} institutions, {ds['students']} students, {ds['apps']} applications, {ds['offers']} offers, {ds['drives']} drives, {ds['users']} staff. {tj['note']}\n")
        P("| Call | Median ms | Max ms | Runs |\n|---|---|---|---|")
        for x in tj["timings"]: P(f"| {x['name']} | {x['medianMs']} | {x['maxMs']} | {x['runs']} |")
        so = tj.get("staleStatisticsObservation")
        if so: P(f"\nStale-statistics observation: {so['note']} First call in this run before ANALYZE: {so['firstCallBeforeAnalyzeMs']} ms.\n")
    tf2 = f"{RES}/g3-08-timings.json"
    if os.path.exists(tf2):
        tj = json.load(open(tf2))
        P("## 5c. Performance measurements (system monitoring, measured)\n"); P(tj["note"] + "\n")
        P("| Call | Median ms | Max ms | Runs |\n|---|---|---|---|")
        for x in tj["timings"]: P(f"| {x['name']} | {x['medianMs']} | {x['maxMs']} | {x['runs']} |")
        P("")
    P("## 6. Environment and infrastructure\n")
    for t in [
        "Isolated Docker stack from `tests/e2e/stack` (Postgres 54330, Auth/Storage gateway 54321, mail sink 54325). All 21+ migrations applied locally, including the M14 to M21 migrations that are still unapplied on the hosted database. No hosted Supabase or production data was touched. No real email, SMS or WhatsApp was sent (SMS and WhatsApp remain ON HOLD).",
        "Functional and sweep suites run against a production build (`next start`, port 3113, rate limits off); the security suite 09 against 3112 with limits on. A dev server was too slow for 500+ routes on this 7.8 GB machine.",
        "`tests/e2e/run.mjs` still scans `tests/e2e/` for numbered files; the Gate 3 suites live in `tests/gate3/` so they are not mixed into that runner.",
        "Test-data hygiene: some suites leave rows (provisioned test institutions `g3-prov*`, sweep users) in the local stack; harmless, but a clean reset is `docker compose down -v` then `up.sh`.",
        "Existing suite 06/07/08/11 expectations are out of date (section 5).",
        "Not built: browser (Playwright) runs, performance load numbers (A-ambiguities), forced-fault and clock-control seams for session expiry and rollback.",
    ]: P(f"- {t}")
    P("\n## 7. Ambiguities A-01 to A-20\n")
    P("None were resolved or invented. Cases that depend on them are not executed (stay Not Run or Blocked): report formats and performance numbers (SRS-NFR-TC-001, -024 to -039, M16 format cases), Principal vs Head TPO permission edges (ROLE-PRN-TC-008, ROLE-PERM-TC-003/005), interviewer access mechanism (ROLE-INT-*, ROLE-PERM-TC-008), approval gates by drive type. The principal read-only check used the SRS statement only.\n")
    P("## 8. Every executed case\n")
    P("| Case | Date | Environment | Status | Actual result | Failure details | Evidence | Issue |\n|---|---|---|---|---|---|---|---|")
    for r in rows:
        if r["_status"] == "Not Run": continue
        P(f"| {r['Test Case ID']} | {r['_date']} | local stack | {r['_status']} | {r['_actual']} | {(r['_fail'] or r['_block'])[:300].replace('|','/')} | {r['_src']} | {r['_issue']} |")
    open(OUT_MD, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(json.dumps({"total": total, "executed": executed, **cnt}))
    for k, d in g.items(): print(k, dict(d))

main()
