import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { sheetResponse } from "@/lib/xlsx";

const query = z.object({ format: z.enum(["json", "xlsx"]).default("json") });

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EVENTS" }, async (req, s, { id }) => {
  const e = await db.event.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true, title: true } });
  if (!e) throw notFound("Event not found");
  const rows = await db.eventRegistration.findMany({ where: { eventId: id }, select: { status: true, rank: true, score: true, registeredAt: true, student: { select: { id: true, name: true, enrollmentNo: true, email: true } } }, orderBy: [{ rank: "asc" }, { registeredAt: "asc" }] });
  if (parseQuery(req, query).format === "json") return rows;
  return sheetResponse(`event-${id.slice(0, 8)}.xlsx`, ["enrollment_no", "name", "email", "status", "rank", "score"], rows.map((r) => [r.student.enrollmentNo, r.student.name, r.student.email, r.status, r.rank, r.score === null ? null : Number(r.score)]));
});
