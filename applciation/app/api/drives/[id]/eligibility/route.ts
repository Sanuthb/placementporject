import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { evaluateEligibility } from "@/lib/eligibility";
import { getDrive } from "@/lib/drives";

const query = z.object({ status: z.enum(["eligible", "ineligible", "all"]).default("eligible"), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });

/** Count and list of students who may apply, with the reason for anyone who may not. */
export const GET = route<{ id: string }>({ module: "DRIVES" }, async (req, s, { id }) => {
  const q = parseQuery(req, query);
  const drive = await getDrive(s.collegeId, id);
  const all = await evaluateEligibility(drive, s.role === "DEPARTMENT_COORDINATOR" ? { departmentId: s.departmentId ?? "none" } : {});
  const eligible = all.filter((r) => r.eligible);
  const rows = q.status === "all" ? all : q.status === "eligible" ? eligible : all.filter((r) => !r.eligible);
  return { counts: { eligible: eligible.length, ineligible: all.length - eligible.length, viaException: all.filter((r) => r.viaException).length }, page: q.page, items: rows.slice((q.page - 1) * q.limit, q.page * q.limit) };
});
