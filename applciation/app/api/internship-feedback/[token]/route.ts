import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { limitBy } from "@/lib/rateLimit";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { hashToken } from "@/lib/internshipService";
import { attendanceSummary } from "@/lib/internships";

async function load(token: string) {
  const l = await db.internshipMentorLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { internship: { include: { student: { select: { name: true } }, logs: { where: { status: "APPROVED" }, select: { hours: true } }, attendance: true, tasks: { select: { title: true, status: true, isFinalReport: true } } } } } });
  if (!l || l.usedAt || l.expiresAt < new Date() || l.internship.status === "TERMINATED") throw notFound("This link is not valid any more");
  return l;
}
const json = (data: unknown) => NextResponse.json({ data }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });

/** Public (no login): what the company's mentor needs to evaluate the intern. The student's name and work only, no contact details. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    await limitBy(req, { name: "internship-feedback", max: 60, windowSec: 60 });
    const l = await load((await ctx.params).token);
    const i = l.internship;
    const att = attendanceSummary({ start: i.startDate, end: i.endDate, workDays: i.workDays, today: new Date(), marks: i.attendance.map((a) => ({ date: a.date.toISOString().slice(0, 10), status: a.status, verified: a.verified })) });
    return json({ mentor: l.name, student: i.student.name, role: i.role, company: i.companyName, startDate: i.startDate, endDate: i.endDate, approvedHours: i.logs.reduce((a, x) => a + x.hours, 0), attendancePercent: att.percent, tasks: i.tasks });
  } catch (e) { return toErrorResponse(e, req); }
}

const submit = z.object({ score: z.number().int().min(0).max(100), remarks: z.string().trim().max(2000).optional(), feedback: z.string().trim().max(3000).optional(), recommendPpo: z.boolean().optional() });

/** Public: the mentor submits a score out of 100 with remarks and feedback. The link works once. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    await limitBy(req, { name: "internship-feedback-post", max: 20, windowSec: 600 });
    const l = await load((await ctx.params).token);
    const b = await parseBody(req, submit);
    const claimed = await db.internshipMentorLink.updateMany({ where: { id: l.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) throw notFound("This link is not valid any more");
    await db.$transaction(async (tx) => {
      await tx.internshipEvaluation.create({ data: { internshipId: l.internshipId, evaluatorType: "COMPANY", evaluatorName: l.name, score: b.score, remarks: b.remarks, createdById: l.createdById } });
      if (b.feedback) await tx.internshipFeedback.create({ data: { internshipId: l.internshipId, authorType: "INDUSTRY", authorName: l.name, text: b.feedback } });
      if (b.recommendPpo && l.internship.ppoStatus === "NONE") await tx.internship.update({ where: { id: l.internshipId }, data: { ppoStatus: "EXPECTED", ppoNote: `${l.name} recommended a pre-placement offer` } });
    });
    await notifyStaff(l.collegeId, { type: "internship.evaluation", title: `${l.name} evaluated ${l.internship.student.name}${b.recommendPpo ? " and recommended a pre-placement offer" : ""}`, link: `/staff/internships/${l.internshipId}` });
    return json({ ok: true });
  } catch (e) { return toErrorResponse(e, req); }
}
