import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseQuery } from "@/lib/api/parse";
import { DIFFICULTIES, DOMAINS, KINDS, LANGUAGES, suggestTopics, type Domain, type Kind } from "@/lib/discussionEngine";
import { topicIdeas } from "@/lib/discussionAi";

const q = z.object({ kind: z.enum(KINDS.map(([k]) => k) as [Kind, ...Kind[]]).default("GD"), domain: z.enum(DOMAINS.map(([k]) => k) as [Domain, ...Domain[]]).optional(), difficulty: z.enum(DIFFICULTIES).default("MEDIUM"), language: z.enum(LANGUAGES).default("English"), ai: z.enum(["0", "1"]).default("0"), seed: z.coerce.number().int().default(0) });

/** Topics to choose from. The curated list always works; `ai=1` asks the AI for fresh ones, and falls back to the curated list if it cannot. */
export const GET = studentRoute({ limit: { name: "discussion-topics", max: 30, windowSec: 3600 }, module: "STUDENT_PREP" }, async (req) => {
  const p = parseQuery(req, q);
  if (p.ai === "1") { try { return { source: "AI", topics: await topicIdeas(p.kind, p.domain ?? null, p.difficulty, p.language) }; } catch { /* fall back to the curated list */ } }
  return { source: "CURATED", topics: suggestTopics(p.kind, p.domain ?? null, 5, p.seed) };
});
