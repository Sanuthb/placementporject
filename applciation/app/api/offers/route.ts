import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { gate } from "@/lib/approvals";
import { createOffer } from "@/lib/ops/offers";
import { JoiningStatus, OfferStatus } from "@/generated/prisma/client";

const query = z.object({
  status: z.enum(OfferStatus).optional(), joiningStatus: z.enum(JoiningStatus).optional(),
  driveId: z.uuid().optional(), companyId: z.uuid().optional(), studentId: z.uuid().optional(), isPpo: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional(),
});
const create = z.object({ applicationId: z.uuid(), packageLpa: z.number().positive().max(1000), role: z.string().trim().min(2).max(150).optional(), isPpo: z.boolean().optional(), expiresAt: z.coerce.date().optional() });

export const GET = route({ module: "DRIVES" }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.offer.findMany({
    where: { collegeId: s.collegeId, status: q.status, joiningStatus: q.joiningStatus, driveId: q.driveId, companyId: q.companyId, studentId: q.studentId, isPpo: q.isPpo, student: { ...departmentScope(s) } },
    select: { id: true, role: true, packageLpa: true, isPpo: true, status: true, offeredAt: true, respondedAt: true, expiresAt: true, joiningStatus: true, joiningDate: true, studentJoiningDate: true, joiningProofName: true, letterName: true, student: { select: { id: true, name: true, enrollmentNo: true } }, company: { select: { id: true, name: true, tier: true } }, driveId: true },
    orderBy: [{ offeredAt: "desc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s) => {
  const input = await parseBody(req, create);
  const app = await db.application.findFirst({ where: { id: input.applicationId, collegeId: s.collegeId }, select: { student: { select: { name: true, enrollmentNo: true } }, drive: { select: { role: true, company: { select: { name: true } } } } } });
  if (!app) throw notFound("Application not found");
  return gate(s, "OFFER_CREATE", `Offer to ${app.student.name} (${app.student.enrollmentNo}): ${input.role ?? app.drive.role} at ${app.drive.company.name}, ${input.packageLpa} LPA`, { input: { ...input, expiresAt: input.expiresAt?.toISOString() } }, () => createOffer(s, input));
});
