import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { atsWarnings, docText, keywordsOf, mentions, profileKeys, type Edits } from "@/lib/resumeEngine";
import { TEMPLATES } from "@/lib/resumeRender";
import { docOf, driftOf, loadMaster, versionOf } from "@/lib/resumeService";
import type { Prisma } from "@/generated/prisma/client";

type P = { id: string };

/** One resume: its document (frozen once approved, otherwise built from my profile as it is now), hints for online applications, how it matches the job, and what is new in my profile. */
export const GET = studentRoute<P>({ module: "ONBOARDING" }, async (_req, me, { id }) => {
  const v = await versionOf(me.studentId, id);
  const master = await loadMaster(me.collegeId, me.studentId);
  const doc = await docOf(v, master);
  const jd = [v.targetText ?? "", v.targetRole ?? ""].join(" ").trim();
  const kw = jd ? keywordsOf(jd, 25) : [];
  const text = docText(doc);
  return {
    id: v.id, number: v.number, title: v.title, kind: v.kind, template: v.template, targetCompany: v.targetCompany, targetRole: v.targetRole, targetText: v.targetText, edits: v.edits, verifiedOnly: v.verifiedOnly, markEvidence: v.markEvidence, status: v.status, isPrimary: v.isPrimary, approvedAt: v.approvedAt, document: doc, warnings: atsWarnings(doc, v.template), changes: driftOf(v, master),
    match: kw.length ? { matched: kw.filter((k) => mentions(text, k)), missing: kw.filter((k) => !mentions(text, k)) } : null,
    items: v.status === "DRAFT" ? { projects: master.projects.map((p) => ({ key: p.key, label: p.title })), internships: master.internships.map((x) => ({ key: x.key, label: x.role || x.company })), achievements: master.achievements.map((a) => ({ key: a.key, label: a.title })), skills: master.skills.map((s) => ({ key: `skill:${s.name.toLowerCase()}`, label: s.name, level: s.level })), assessments: master.assessments.map((a) => ({ key: a.key, label: a.label })), all: profileKeys(master).length } : null,
  };
});

const edits = z.object({ summary: z.string().trim().max(800).optional(), headline: z.string().trim().max(120).optional(), hide: z.array(z.string().max(120)).max(200).optional(), text: z.record(z.string().max(120), z.string().max(1200)).optional() });
const patch = z.object({ title: z.string().trim().min(1).max(80).optional(), template: z.enum(TEMPLATES).optional(), targetCompany: z.string().trim().max(100).nullish(), targetRole: z.string().trim().max(100).nullish(), targetText: z.string().trim().max(6000).nullish(), verifiedOnly: z.boolean().optional(), markEvidence: z.boolean().optional(), edits: edits.optional() });

/** Change a draft: its title, template, target, whether it uses only checked material, and my own edits (summary, hidden items, reworded descriptions). An approved resume cannot change: duplicate it instead. */
export const PATCH = studentRoute<P>({ module: "ONBOARDING", limit: { name: "resume-write", max: 400, windowSec: 3600 } }, async (req, me, { id }) => {
  const v = await versionOf(me.studentId, id);
  if (v.status !== "DRAFT") throw badRequest("This resume is approved and cannot change. Make a copy to edit it");
  const b = await parseBody(req, patch);
  const { edits: e, ...rest } = b;
  await db.resumeVersion.update({ where: { id }, data: { ...rest, ...(e ? { edits: { ...(v.edits as Edits), ...e } as Prisma.InputJsonValue } : {}) } });
  return { ok: true };
});

/** Delete a draft. An approved resume is archived instead, so the record of what was sent stays. */
export const DELETE = studentRoute<P>({ module: "ONBOARDING" }, async (_req, me, { id }) => {
  const v = await versionOf(me.studentId, id);
  if (v.status !== "DRAFT") throw badRequest("An approved resume cannot be deleted. Archive it instead");
  await db.resumeVersion.delete({ where: { id } });
  return { ok: true };
});
