import { studentRoute } from "@/lib/api/studentHandler";
import { withdrawApplication } from "@/lib/ops/apply";

export const POST = studentRoute<{ id: string }>({ module: "DRIVES" }, (_req, me, { id }) => withdrawApplication({ collegeId: me.collegeId, userId: null }, id, me.studentId));
