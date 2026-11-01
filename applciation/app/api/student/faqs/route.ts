import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

/** FAQs and placement rules my college published. */
export const GET = studentRoute({}, (_req, me) =>
  db.faqItem.findMany({ where: { collegeId: me.collegeId, isPublished: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, kind: true, question: true, answer: true } }),
);
