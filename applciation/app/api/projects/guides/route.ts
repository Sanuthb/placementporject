import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { PROJ_ADMIN } from "@/lib/projectService";

/** Faculty who can be named as a project's guide. */
export const GET = route(PROJ_ADMIN, (_req, s) => db.user.findMany({ where: { collegeId: s.collegeId, isActive: true, OR: [{ role: "FACULTY" }, { extraRoles: { has: "FACULTY" } }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }));
