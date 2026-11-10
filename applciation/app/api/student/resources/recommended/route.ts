import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseQuery } from "@/lib/api/parse";
import { studentContext, studentResources } from "@/lib/resourceService";
import { recommendResources } from "@/lib/resources";

const query = z.object({ hours: z.coerce.number().min(0.5).max(40).optional(), language: z.string().max(40).optional() });

/**
 * A short list (at most 5) matched to my weak assessment areas, target role and skills, in my language, skipping what I finished and fitting the hours I say
 * I have. Rules, not a guess: each one says why it was picked.
 */
export const GET = studentRoute({ module: "STUDENT_PREP" }, async (req, me) => {
  const q = parseQuery(req, query);
  const ctx = await studentContext(me);
  const mine = await studentResources(me, ctx);
  const out = recommendResources(mine.map((r) => ({ id: r.id, title: r.title, category: r.category, subject: r.subject, topic: r.topic, skills: r.skills, jobRoles: r.jobRoles, difficulty: r.difficulty, language: r.language, durationMin: r.durationMin })),
    { weakAreas: [...ctx.weakAreas], targetRole: ctx.targetRole, skills: ctx.skills, language: q.language ?? "English", hours: q.hours }, new Set(mine.filter((r) => r.completed && !r.newVersion).map((r) => r.id)));
  return out.map((o) => ({ ...mine.find((r) => r.id === o.id)!, why: o.why, minutes: o.minutes }));
});
