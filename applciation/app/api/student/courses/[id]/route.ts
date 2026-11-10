import { studentRoute } from "@/lib/api/studentHandler";
import { courseDetail } from "@/lib/lmsStudent";

/** The course: an outline before I join, the lessons and my progress after. Quiz answers are never included. */
export const GET = studentRoute<{ id: string }>({ module: "LEARNING" }, (_req, me, { id }) => courseDetail(me, id));
