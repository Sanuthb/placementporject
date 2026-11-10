import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma, ResourceType } from "@/generated/prisma/client";
import { badRequest, notFound } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DocumentRejected } from "@/lib/documents";
import { gatherEvidence } from "@/lib/intelligence/evidence";
import { recommend } from "@/lib/careerRecommendations";
import { effectiveness, reaches, sniffResource, studentCanSee, type StudentCtx } from "@/lib/resources";
import type { StudentSession } from "@/lib/auth/student";
import type { ModuleKey, Role } from "@/generated/prisma/client";

export const RES_BUCKET = "student-documents";
export const RES_STAFF: { roles: Role[]; module: ModuleKey } = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" };

export async function resourceOf(collegeId: string, id: string) {
  const r = await db.prepResource.findFirst({ where: { id, collegeId } });
  if (!r) throw notFound("Resource not found");
  return r;
}

export const signed = async (path: string, download?: string) => (await supabaseAdmin().storage.from(RES_BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined)).data?.signedUrl ?? null;
export const removeFile = async (path: string | null | undefined) => { if (path) await supabaseAdmin().storage.from(RES_BUCKET).remove([path]).catch(() => undefined); };

const TYPE_OF_KIND: Record<string, ResourceType> = { IMAGE: "IMAGE", VIDEO: "VIDEO", AUDIO: "AUDIO", DOCUMENT: "DOCUMENT" };

/** Checks a file by its bytes, stores it, and returns what to save on the resource. */
export async function storeResourceFile(collegeId: string, resourceId: string, file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  let info;
  try { info = sniffResource(bytes, file.name, file.type); } catch (e) { if (e instanceof DocumentRejected) throw badRequest(e.message); throw e; }
  const path = `${collegeId}/resources/${resourceId}/${randomUUID()}-${info.safeName}`;
  const up = await supabaseAdmin().storage.from(RES_BUCKET).upload(path, bytes, { contentType: info.mime });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return { filePath: path, fileName: file.name.slice(0, 200), mimeType: info.mime, sizeBytes: bytes.length, type: TYPE_OF_KIND[info.kind] };
}

/** Everything about the student the library needs to decide what reaches them. */
export async function studentContext(me: StudentSession): Promise<StudentCtx & { weakAreas: Set<string>; targetRole: string | null; skills: string[] }> {
  const [groups, papers, evidence, roadmap, skills] = await Promise.all([
    db.learningMember.findMany({ where: { studentId: me.studentId, programme: { status: "ACTIVE" } }, select: { programmeId: true } }),
    db.assessmentSchedule.findMany({ where: { collegeId: me.collegeId, OR: [{ targetDepartmentIds: { isEmpty: true } }, { targetDepartmentIds: { has: me.departmentId } }] }, select: { paperId: true, targetBatchIds: true } }),
    gatherEvidence(me.collegeId, me.studentId, { asStudent: true }),
    db.studentRoadmap.findUnique({ where: { studentId: me.studentId }, select: { targetRole: true } }),
    db.studentSection.findFirst({ where: { studentId: me.studentId, section: "SKILLS" }, select: { data: true } }),
  ]);
  const weak = recommend(evidence.dimensions, evidence.signals, "student").filter((r) => r.kind === "improve").map((r) => r.id.split(":")[1]).filter(Boolean);
  const raw = (skills?.data as { skills?: unknown } | null)?.skills;
  return {
    studentId: me.studentId, departmentId: me.departmentId, batchId: me.batchId, groupIds: new Set(groups.map((g) => g.programmeId)),
    weakAreas: new Set(weak), paperIds: new Set(papers.filter((p) => !p.targetBatchIds.length || p.targetBatchIds.includes(me.batchId)).map((p) => p.paperId)),
    targetRole: roadmap?.targetRole ?? null, skills: Array.isArray(raw) ? raw.map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name ?? "")).filter(Boolean) : [],
  };
}

/** Resources a student may open, each with why they have it (assigned or library) and their own progress. */
export async function studentResources(me: StudentSession, ctx?: Awaited<ReturnType<typeof studentContext>>) {
  const c = ctx ?? (await studentContext(me));
  const rows = await db.prepResource.findMany({
    where: { collegeId: me.collegeId, status: "APPROVED", visibility: { not: "STAFF_ONLY" }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    include: { assignments: true, progress: { where: { studentId: me.studentId } } }, orderBy: { updatedAt: "desc" }, take: 1000,
  });
  return rows.flatMap((r) => {
    const mine = r.assignments.filter((a) => reaches(a, c));
    if (!studentCanSee(r, mine.length > 0)) return [];
    const p = r.progress[0];
    const due = mine.flatMap((a) => (a.dueAt ? [a.dueAt] : [])).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return [{
      id: r.id, title: r.title, description: r.description, type: r.type, category: r.category, subject: r.subject, topic: r.topic, skills: r.skills, jobRoles: r.jobRoles, companyName: r.companyName, difficulty: r.difficulty, language: r.language, durationMin: r.durationMin, version: r.version, expiresAt: r.expiresAt,
      assigned: mine.length > 0, assignedNote: mine.find((a) => a.note)?.note ?? null, dueAt: due, isFile: !!r.filePath, fileName: r.fileName,
      opened: !!p?.openedAt, completed: !!p?.completedAt, newVersion: !!p?.completedAt && (p.completedVersion ?? 0) < r.version, myRating: p?.rating ?? null,
    }];
  });
}

/** How a resource is doing across the students it reaches. Scores compare completers with the others in the matching assessment category, when enough of both exist. */
export async function resourceEffectiveness(collegeId: string, resourceId: string, category: string) {
  const [assignments, progress] = await Promise.all([db.resourceAssignment.findMany({ where: { resourceId } }), db.resourceProgress.findMany({ where: { resourceId } })]);
  const reach = await assignedStudentIds(collegeId, assignments);
  const rows = progress.map((p) => ({ studentId: p.studentId, opened: !!p.openedAt, completed: !!p.completedAt, rating: p.rating }));
  const area = ({ APTITUDE: "APTITUDE", CODING: "TECHNICAL", INTERVIEW: "COMMUNICATION", SOFT_SKILLS: "COMMUNICATION" } as Record<string, string>)[category];
  let scores: { completed: number[]; others: number[] } | undefined;
  if (area && reach.size) {
    const att = await db.assessmentAttempt.findMany({ where: { studentId: { in: [...reach] }, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, schedule: { collegeId, isPractice: false, paper: { category: area as never } } }, select: { studentId: true, score: true, maxScore: true } });
    const best = new Map<string, number>();
    for (const a of att) { const pct = Number(a.maxScore) > 0 ? (Number(a.score ?? 0) / Number(a.maxScore)) * 100 : 0; best.set(a.studentId, Math.max(best.get(a.studentId) ?? 0, Math.round(pct))) }
    const done = new Set(rows.filter((r) => r.completed).map((r) => r.studentId));
    scores = { completed: [...best].filter(([id]) => done.has(id)).map(([, v]) => v), others: [...best].filter(([id]) => !done.has(id)).map(([, v]) => v) };
  }
  return effectiveness({ assigned: reach.size, rows, scores });
}

/** Distinct students an assignment list reaches (used for counts and notifications). */
export async function assignedStudentIds(collegeId: string, as: { targetType: string; targetId: string | null; targetKey: string | null }[]) {
  const ids = new Set<string>();
  const base = { collegeId, isActive: true, isArchived: false } as const;
  for (const a of as) {
    if (a.targetType === "STUDENT" && a.targetId) ids.add(a.targetId);
    else if (a.targetType === "DEPARTMENT" && a.targetId) (await db.student.findMany({ where: { ...base, departmentId: a.targetId }, select: { id: true }, take: 5000 })).forEach((s) => ids.add(s.id));
    else if (a.targetType === "BATCH" && a.targetId) (await db.student.findMany({ where: { ...base, batchId: a.targetId }, select: { id: true }, take: 5000 })).forEach((s) => ids.add(s.id));
    else if (a.targetType === "GROUP" && a.targetId) (await db.learningMember.findMany({ where: { programmeId: a.targetId }, select: { studentId: true } })).forEach((m) => ids.add(m.studentId));
  }
  return ids; // skill-gap and mock-test targets are decided per student, so they are not counted here
}

export type ResourceUpdate = Prisma.PrepResourceUpdateInput;
