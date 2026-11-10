import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseQuery } from "@/lib/api/parse";
import { studentResources } from "@/lib/resourceService";

const query = z.object({ scope: z.enum(["assigned", "library", "all"]).default("all"), type: z.string().max(40).optional(), category: z.string().max(40).optional(), q: z.string().trim().max(100).optional(), language: z.string().max(40).optional(), difficulty: z.string().max(10).optional() });

/** Study material I can open: what was assigned to me and what is open to every student. Approved, unexpired, not staff-only. */
export const GET = studentRoute({ module: "STUDENT_PREP" }, async (req, me) => {
  const q = parseQuery(req, query);
  const needle = q.q?.toLowerCase();
  return (await studentResources(me)).filter((r) =>
    (q.scope === "all" || (q.scope === "assigned" ? r.assigned : !r.assigned)) && (!q.type || r.type === q.type) && (!q.category || r.category === q.category) && (!q.language || r.language === q.language) && (!q.difficulty || r.difficulty === q.difficulty)
    && (!needle || [r.title, r.subject, r.topic, r.description, ...r.skills].some((t) => t?.toLowerCase().includes(needle))));
});
