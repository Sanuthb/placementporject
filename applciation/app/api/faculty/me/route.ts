import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { facultySelect, shapeFaculty } from "@/lib/faculty";

/** A faculty member's own profile and allocations. Reads the session user only; there is no id in the URL to tamper with. */
export const GET = route({ roles: ["FACULTY"] }, async (_req, s) =>
  shapeFaculty(await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: facultySelect })));
