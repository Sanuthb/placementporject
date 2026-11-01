import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const body = z.object({ results: z.array(z.object({ studentId: z.uuid(), attended: z.boolean().default(true), rank: z.number().int().min(1).optional(), score: z.number().optional() })).min(1).max(1000) });

/** Marks attendance and, for contests and hackathons, rank and score. Only people who registered can be marked. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EVENTS" }, async (req, s, { id }) => {
  const { results } = await parseBody(req, body);
  const e = await db.event.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!e) throw notFound("Event not found");
  if (e.status !== "PUBLISHED" && e.status !== "COMPLETED") throw new ApiError(409, "CONFLICT", "Results can be recorded once the event is published");
  return db.$transaction(async (tx) => {
    let updated = 0; const skipped: string[] = [];
    for (const r of results) {
      const c = await tx.eventRegistration.updateMany({ where: { eventId: id, studentId: r.studentId, status: { in: ["REGISTERED", "ATTENDED"] } }, data: { status: r.attended ? "ATTENDED" : "REGISTERED", rank: r.rank ?? null, score: r.score ?? null } });
      if (c.count) updated++; else skipped.push(r.studentId);
    }
    await audit(s, { action: "event.results", entity: "Event", entityId: id, after: { updated, skipped: skipped.length } }, tx);
    return { updated, skipped };
  });
});
