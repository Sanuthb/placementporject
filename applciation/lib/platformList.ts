import { z } from "zod";

/** Query contract of GET /api/platform/institutions. Sort keys are a fixed allow-list: no client text ever becomes part of a sort or a query. */
export const SORT_KEYS = ["name", "createdAt", "slug", "staff", "students"] as const;
export const institutionListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  sort: z.enum(SORT_KEYS).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
/** Prisma's `contains` passes % and _ through as LIKE wildcards. Escape them (and the escape character) so search text is always literal. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
export const pageInfo = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));
