import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { contribute } from "@/lib/discussionService";

const body = z.object({ text: z.string().trim().min(3).max(4000), voice: z.boolean().default(false) });

/** Say something. Returns what the AI participants answer, or the evaluation once the last contribution is in or the time is up. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "discussion-turn", max: 60, windowSec: 3600 }, module: "STUDENT_PREP" }, async (req, me, { id }) => {
  const b = await parseBody(req, body);
  return contribute(me, id, b.text, b.voice);
});
