import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api/errors";
import type { Prisma, ResumeVersion } from "@/generated/prisma/client";
import { internshipRecordsMany } from "@/lib/internshipService";
import { portfolioForMany } from "@/lib/projectService";
import { buildMaster, composeDoc, drift, profileKeys, type Edits, type Inputs, type Kind, type MasterProfile, type Options, type ResumeDoc, type Sections } from "@/lib/resumeEngine";
import { renderDocx, renderPdf, type Template, TEMPLATES } from "@/lib/resumeRender";

/** Assessment categories that belong on a resume. Personality, interests and behavioural style are private and never appear. */
const RESUME_CATEGORIES = ["APTITUDE", "TECHNICAL", "COMMUNICATION", "DIGITAL_LITERACY"] as const;
export const MAX_VERSIONS = 15;

const CHUNK = 250;

/**
 * The inputs for the master profile of many students, read with a few queries per batch instead of per student. The matching engine uses this for a whole
 * cohort; `loadMaster` is the same thing for one student, so the resume and the matching always read the same facts.
 */
export async function loadInputsMany(collegeId: string, studentIds: string[]): Promise<Map<string, Inputs>> {
  const result = new Map<string, Inputs>();
  const college = await db.college.findUniqueOrThrow({ where: { id: collegeId }, select: { name: true } });
  for (let at = 0; at < studentIds.length; at += CHUNK) {
    const ids = studentIds.slice(at, at + CHUNK);
    const [students, sections, projects, interns, courses, attempts] = await Promise.all([
      db.student.findMany({ where: { id: { in: ids }, collegeId }, select: { id: true, name: true, email: true, phone: true, enrollmentNo: true, department: { select: { name: true } }, batch: { select: { name: true } }, program: { select: { name: true } } } }),
      db.studentSection.findMany({ where: { studentId: { in: ids } }, select: { studentId: true, section: true, status: true, data: true } }),
      portfolioForMany(ids, { onlyShown: true }),
      internshipRecordsMany(ids),
      db.courseEnrolment.findMany({ where: { studentId: { in: ids }, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { id: true, studentId: true, completedAt: true, course: { select: { title: true, skills: true } }, certificate: { select: { serial: true } } } }),
      db.assessmentAttempt.findMany({ where: { studentId: { in: ids }, status: { not: "IN_PROGRESS" }, schedule: { collegeId, isPractice: false, paper: { category: { in: [...RESUME_CATEGORIES] } } } }, select: { studentId: true, score: true, maxScore: true, schedule: { select: { paper: { select: { id: true, title: true, category: true } } } } } }),
    ]);
    const group = <T extends { studentId: string }>(xs: T[]) => { const m = new Map<string, T[]>(); for (const x of xs) m.set(x.studentId, [...(m.get(x.studentId) ?? []), x]); return m; };
    const secs = group(sections), crs = group(courses), att = group(attempts);
    for (const st of students) {
      const sm: Sections = {};
      for (const x of secs.get(st.id) ?? []) sm[x.section] = { status: x.status, data: (x.data ?? {}) as Record<string, unknown> };
      const best = new Map<string, { key: string; title: string; percent: number; category: string }>();
      for (const a of att.get(st.id) ?? []) {
        const pct = Number(a.maxScore) > 0 ? (Number(a.score ?? 0) / Number(a.maxScore)) * 100 : 0, p = a.schedule.paper;
        if (!best.has(p.id) || best.get(p.id)!.percent < pct) best.set(p.id, { key: p.id, title: p.title, percent: pct, category: p.category });
      }
      result.set(st.id, {
        student: { name: st.name, email: st.email, phone: st.phone, department: st.department.name, batch: st.batch.name, enrollmentNo: st.enrollmentNo, programme: st.program?.name ?? null, college: college.name },
        sections: sm,
        collegeProjects: (projects.get(st.id) ?? []).map((p) => ({ key: p.teamId, title: p.title, problem: p.problem, summary: p.summary, skills: p.skills, role: p.myRole, teammates: p.teammates, repo: p.repoUrl, resultPercent: p.myResultPercent })),
        collegeInternships: (interns.get(st.id) ?? []).map((i) => ({ key: i.id, company: i.company ?? "", role: i.role, from: i.from, to: i.to, certificateVerified: i.certificateVerified, preplacementOffer: i.preplacementOffer })),
        courses: (crs.get(st.id) ?? []).slice(0, 30).map((c) => ({ key: c.id, title: c.course.title, skills: c.course.skills, completedOn: (c.completedAt ?? new Date()).toISOString(), serial: c.certificate?.serial ?? null })),
        assessments: [...best.values()],
      });
    }
  }
  return result;
}

/** The student's master career profile: every record the college holds, as one structure. */
export async function loadMaster(collegeId: string, studentId: string): Promise<MasterProfile> {
  const i = (await loadInputsMany(collegeId, [studentId])).get(studentId);
  if (!i) throw notFound("Student not found");
  return buildMaster(i);
}

export const optionsOf = (v: Pick<ResumeVersion, "kind" | "targetCompany" | "targetRole" | "targetText" | "edits" | "verifiedOnly" | "markEvidence" | "template">): Options => ({
  kind: v.kind as Kind, target: { company: v.targetCompany ?? undefined, role: v.targetRole ?? undefined, text: v.targetText ?? undefined }, edits: (v.edits ?? {}) as Edits, claims: v.verifiedOnly ? "VERIFIED_ONLY" : "ALL", markEvidence: v.markEvidence && v.template !== "ATS",
});

/** The version's document: the frozen one once approved, otherwise built from the profile as it is now. */
export async function docOf(v: ResumeVersion, master?: MasterProfile): Promise<ResumeDoc> {
  if (v.status !== "DRAFT" && v.doc) return v.doc as unknown as ResumeDoc;
  return composeDoc(master ?? (await loadMaster(v.collegeId, v.studentId)), optionsOf(v));
}

export async function versionOf(studentId: string, id: string) {
  const v = await db.resumeVersion.findFirst({ where: { id, studentId } });
  if (!v) throw notFound("Resume not found");
  return v;
}

export async function createVersion(collegeId: string, studentId: string, d: { kind: Kind; template: string; title?: string; targetCompany?: string | null; targetRole?: string | null; targetText?: string | null; verifiedOnly?: boolean; edits?: Prisma.InputJsonValue; markEvidence?: boolean }) {
  if (!TEMPLATES.includes(d.template as Template)) throw badRequest("Choose a template");
  if ((await db.resumeVersion.count({ where: { studentId, status: { not: "ARCHIVED" } } })) >= MAX_VERSIONS) throw badRequest(`You can keep ${MAX_VERSIONS} resumes. Archive or delete one first`);
  for (let tries = 0; tries < 3; tries++) {
    const last = await db.resumeVersion.aggregate({ where: { studentId }, _max: { number: true } });
    try {
      return await db.resumeVersion.create({ data: { collegeId, studentId, number: (last._max.number ?? 0) + 1, title: d.title?.trim() || defaultTitle(d.kind, d.targetCompany), kind: d.kind, template: d.template, targetCompany: d.targetCompany || null, targetRole: d.targetRole || null, targetText: d.targetText || null, verifiedOnly: d.verifiedOnly ?? false, markEvidence: d.markEvidence ?? true, edits: d.edits ?? {} } });
    } catch (e) { if ((e as { code?: string }).code !== "P2002") throw e; }
  }
  throw badRequest("Could not number the new resume. Try again");
}
const defaultTitle = (k: Kind, company?: string | null) => (company ? `For ${company}` : { MASTER: "Master resume", TECHNICAL: "Technical resume", MANAGEMENT: "Management resume", INTERNSHIP: "Internship resume", FRESHER: "Fresher resume", PROJECT_BASED: "Project-based resume", COMPANY_SPECIFIC: "Company-specific resume" }[k]);

/** Freezes a draft: its document and the profile items it was made from are kept, so later changes to the profile never rewrite what was approved. */
export async function approveVersion(v: ResumeVersion) {
  const master = await loadMaster(v.collegeId, v.studentId);
  const doc = composeDoc(master, optionsOf(v));
  if (!doc.sections.length) throw badRequest("This resume would be empty. Add something to your profile first");
  const first = !(await db.resumeVersion.count({ where: { studentId: v.studentId, status: "APPROVED" } }));
  const claimed = await db.resumeVersion.updateMany({ where: { id: v.id, status: "DRAFT" }, data: { status: "APPROVED", approvedAt: new Date(), doc: doc as unknown as Prisma.InputJsonValue, profileKeys: profileKeys(master).map((x) => x.key), isPrimary: first } });
  if (claimed.count === 0) throw badRequest("This resume was already approved");
  return db.resumeVersion.findUniqueOrThrow({ where: { id: v.id } });
}

export async function makePrimary(v: ResumeVersion) {
  if (v.status !== "APPROVED") throw badRequest("Only an approved resume can be your main one");
  await db.$transaction([db.resumeVersion.updateMany({ where: { studentId: v.studentId, isPrimary: true }, data: { isPrimary: false } }), db.resumeVersion.update({ where: { id: v.id }, data: { isPrimary: true } })]);
}

/** What is new in the profile since this approved version was made. */
export const driftOf = (v: ResumeVersion, master: MasterProfile) => (v.status === "APPROVED" ? drift(v.profileKeys, master) : { added: [], removed: 0 });

export async function exportVersion(v: ResumeVersion, format: "pdf" | "docx", opts: { college: string; brandColor?: string | null; master?: MasterProfile }) {
  const doc = await docOf(v, opts.master);
  const mark = v.markEvidence && v.template !== "ATS";
  const file = `resume-${v.title.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40) || "resume"}-v${v.number}`;
  return format === "pdf"
    ? { body: await renderPdf(doc, (TEMPLATES.includes(v.template as Template) ? v.template : "ATS") as Template, { college: opts.college, brandColor: opts.brandColor, markEvidence: mark }), type: "application/pdf", name: `${file}.pdf` }
    : { body: await renderDocx(doc, { markEvidence: mark }), type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: `${file}.docx` };
}
