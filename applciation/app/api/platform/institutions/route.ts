import type { Prisma } from "@/generated/prisma/client";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { provisionInput, provisionInstitution } from "@/lib/provision";
import { escapeLike, institutionListQuery as listQuery, pageInfo } from "@/lib/platformList";

/** Sort keys are a fixed allow-list mapped to Prisma orderBy objects; no client text ever becomes part of a sort or a query. */
const SORTS = { name: (d: "asc" | "desc") => ({ name: d }), createdAt: (d: "asc" | "desc") => ({ createdAt: d }), slug: (d: "asc" | "desc") => ({ slug: d }), staff: (d: "asc" | "desc") => ({ users: { _count: d } }), students: (d: "asc" | "desc") => ({ students: { _count: d } }) } as const;
/**
 * Platform administrators only. Counts only; no college's records are returned. Search looks at the name, the address (slug) and the
 * email of an institution's administrators (used to find the institution, never returned). Sorting always ends on id, so equal values
 * keep one order from page to page.
 */
export const GET = platformRoute({}, async (req) => {
  const { q, status, sort, order, page, pageSize } = parseQuery(req, listQuery);
  const like = q ? escapeLike(q) : "";
  const where: Prisma.CollegeWhereInput = {
    ...(status === "all" ? {} : { isActive: status === "active" }),
    ...(q ? { OR: [{ name: { contains: like, mode: "insensitive" } }, { slug: { contains: like, mode: "insensitive" } }, { users: { some: { role: "TPO_ADMIN", email: { contains: like, mode: "insensitive" } } } }] } : {}),
  };
  const [total, items] = await Promise.all([
    db.college.count({ where }),
    db.college.findMany({
      where, orderBy: [SORTS[sort](order), { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, name: true, slug: true, isActive: true, createdAt: true, _count: { select: { users: true, students: true, departments: true } } },
    }),
  ]);
  return { items, page, pageSize, total, totalPages: pageInfo(total, pageSize), sort, order };
});

export const POST = platformRoute({ limit: { name: "provision", max: 20, windowSec: 3600 } }, async (req, admin) =>
  provisionInstitution(admin, await parseBody(req, provisionInput)));
