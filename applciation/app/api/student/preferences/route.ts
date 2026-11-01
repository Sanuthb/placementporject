import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";

const body = z.object({ emailAnnouncements: z.boolean().optional(), emailReminders: z.boolean().optional() });
const pick = { emailAnnouncements: true, emailReminders: true } as const;

/** Which optional emails I receive. Account, offer and block emails are always sent. */
export const GET = studentRoute({}, (_req, me) => db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: pick }));
export const PUT = studentRoute({}, async (req, me) => db.student.update({ where: { id: me.studentId }, data: await parseBody(req, body), select: pick }));
