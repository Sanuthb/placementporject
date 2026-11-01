import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { ResourceCategory } from "@/generated/prisma/client";

const query = z.object({ category: z.enum(ResourceCategory).optional() });

export const GET = studentRoute({ module: "STUDENT_PREP" }, (req, me) =>
  db.prepResource.findMany({ where: { collegeId: me.collegeId, isActive: true, category: parseQuery(req, query).category }, select: { id: true, title: true, category: true, url: true, description: true }, orderBy: [{ category: "asc" }, { title: "asc" }], take: 500 }),
);
