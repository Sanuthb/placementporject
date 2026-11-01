import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { approveSection } from "@/lib/verification";

const body = z.object({ sectionIds: z.array(z.uuid()).min(1).max(200), comment: z.string().trim().max(500).optional() });

/** Approves the explicit list of sections the reviewer has checked. Each is its own transaction, so one stale row does not block the rest. */
export const POST = route({ module: "ONBOARDING" }, async (req, s) => {
  const { sectionIds, comment } = await parseBody(req, body);
  const approved: string[] = [];
  const skipped: { sectionId: string; reason: string }[] = [];
  for (const id of new Set(sectionIds)) {
    try {
      await db.$transaction((tx) => approveSection(tx, s, id, comment));
      approved.push(id);
    } catch (e) {
      if (e instanceof ApiError) skipped.push({ sectionId: id, reason: e.message });
      else throw e;
    }
  }
  await audit(s, { action: "verification.bulkApprove", entity: "StudentSection", after: { approved: approved.length, skipped: skipped.length } });
  return { approved: approved.length, skipped };
});
