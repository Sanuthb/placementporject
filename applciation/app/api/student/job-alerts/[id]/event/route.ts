import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { recordAlertEvent, visibleAlertsFor } from "@/lib/jobAlerts";

const body = z.object({ kind: z.enum(["VIEW", "CLICK", "INTERESTED"]) });

/** Records that I viewed or clicked an alert (feeds the officer's view/click stats). Only alerts I can see. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "alert-event", max: 600, windowSec: 3600 }, module: "DRIVES" }, async (req, me, { id }) => {
  const { kind } = await parseBody(req, body);
  const visible = await visibleAlertsFor({ id: me.studentId, ...me });
  if (!visible.some((a) => a.id === id)) throw notFound("Job alert not found");
  await recordAlertEvent(id, me.studentId, kind);
  return { recorded: true };
});
