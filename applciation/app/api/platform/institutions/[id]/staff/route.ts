import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { listStaff, parseUuid, staffQuery } from "@/lib/platformAccess";

/** The institution's staff accounts (name, e-mail, roles, department, status) so roles can be assigned. Staff only: no student, recruiter or placement data. */
export const GET = platformRoute<{ id: string }>({}, async (req, _a, { id }) => listStaff(parseUuid(id, "Institution"), parseQuery(req, staffQuery)));
