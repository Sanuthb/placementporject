import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { composeDoc, docText } from "@/lib/resumeEngine";
import { suggestBullets, suggestSummary } from "@/lib/resumeAi";
import { loadMaster, optionsOf, versionOf } from "@/lib/resumeService";

/**
 * AI help for a draft: a summary (mode "summary") or a rewrite of one project or internship (mode "bullets" with its key). It sees only what is already in your profile,
 * and anything it adds that is not (a number, a tool, a name) comes back in `added` so you can remove it. Nothing is saved: you choose what to keep.
 */
export const POST = studentRoute<{ id: string }>({ module: "ONBOARDING", limit: { name: "resume-ai", max: 30, windowSec: 3600 } }, async (req, me, { id }) => {
  const v = await versionOf(me.studentId, id);
  if (v.status !== "DRAFT") throw badRequest("Suggestions are for drafts");
  const b = await parseBody(req, z.object({ mode: z.enum(["summary", "bullets"]), itemKey: z.string().max(120).optional() }));
  const master = await loadMaster(me.collegeId, me.studentId);
  const target = [v.targetRole, v.targetCompany && `at ${v.targetCompany}`, v.targetText].filter(Boolean).join(" ");
  if (b.mode === "summary") {
    const doc = composeDoc(master, { ...optionsOf(v), edits: { ...(v.edits as object), summary: undefined, hide: (v.edits as { hide?: string[] }).hide } });
    const facts = docText({ ...doc, sections: doc.sections.filter((s) => s.id !== "summary") });
    return suggestSummary(`${master.identity.programme ?? master.identity.department}, ${master.identity.batch}\n${facts}`, target);
  }
  const p = master.projects.find((x) => x.key === b.itemKey), i = master.internships.find((x) => x.key === b.itemKey);
  if (!p && !i) throw badRequest("Choose a project or an internship to rewrite");
  const text = p ? p.description : i!.description;
  if (text.trim().length < 15) throw badRequest("Write a short description of it in your profile first, so there is something to improve");
  return suggestBullets({ heading: p?.title ?? i!.role, text, tools: p?.skills ?? [] }, target);
});
