import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { parseSection, recomputeStage, scopedStudent } from "@/lib/verification";

const body = z.object({ comment: z.string().trim().min(3, "A comment is required").max(1000) });

export const POST = route<{ id: string; section: string }>({ module: "ONBOARDING" }, async (req, s, p) => {
  await scopedStudent(s, p.id);
  const section = parseSection(p.section);
  const { comment } = await parseBody(req, body);
  const row = await db.studentSection.findUnique({ where: { studentId_section: { studentId: p.id, section } }, select: { id: true } });
  if (!row) throw notFound("Section has not been submitted");
  return db.$transaction(async (tx) => {
    const claim = await tx.studentSection.updateMany({ where: { id: row.id, status: "SUBMITTED" }, data: { status: "CHANGES_REQUESTED", reviewComment: comment, reviewedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This section is not awaiting review");
    await tx.verificationEvent.create({ data: { collegeId: s.collegeId, studentId: p.id, section, action: "CHANGES_REQUESTED", actorId: s.userId, comment } });
    await recomputeStage(tx, s.collegeId, p.id);
    await notifyStudent(s.collegeId, p.id, { type: "section.changesRequested", title: `Changes requested on your ${section.toLowerCase().replace("_", " ")}`, body: comment }, tx);
    await audit(s, { action: "section.requestChanges", entity: "StudentSection", entityId: row.id, after: { section, studentId: p.id }, reason: comment }, tx);
    return { sectionId: row.id, section, status: "CHANGES_REQUESTED" };
  });
});
