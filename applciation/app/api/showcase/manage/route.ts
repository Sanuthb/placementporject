import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";

/** Showcase profiles students have switched on (staff cannot see the links, only that they exist and how often they are opened). */
export const GET = route({ module: "TALENT_SHOWCASE" }, (_req, s) =>
  db.showcaseProfile.findMany({ where: { collegeId: s.collegeId, isEnabled: true, student: { ...departmentScope(s) } }, select: { id: true, headline: true, views: true, expiresAt: true, student: { select: { id: true, name: true, enrollmentNo: true } } }, orderBy: { views: "desc" }, take: 500 }),
);
