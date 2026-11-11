import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { usageByCollege, usageSummary } from "@/lib/ai/usage";
import { consumption } from "@/lib/ai/limits";

const q = z.object({ days: z.coerce.number().int().min(1).max(90).default(7), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();

/** AI usage for the platform administrator: totals, breakdowns, trend, per-institution usage (paginated) and today's consumption against limits. Counts and times only: no content, no person. */
export const GET = platformRoute({}, async (req) => {
  const { days, page } = parseQuery(req, q);
  const [summary, colleges, today] = await Promise.all([usageSummary(days), usageByCollege(days, page), consumption()]);
  return { ...summary, colleges, today };
});
