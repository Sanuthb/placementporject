import { z } from "zod";

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const day = (end: boolean) => (v: unknown) => (typeof v === "string" && dateOnly.test(v) ? new Date(v + (end ? "T23:59:59.999Z" : "T00:00:00.000Z")) : v);
export const SERVICES = ["application", "database", "storage", "ai", "email", "auth", "other"] as const;
/** Query contract of GET /api/platform/monitoring/errors: fixed allow-lists and bounded paging. */
export const errorsQuery = z.object({
  service: z.enum(SERVICES).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.preprocess(day(false), z.coerce.date()).optional(),
  to: z.preprocess(day(true), z.coerce.date()).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must not be after the end date", path: ["from"] });
/** GET /api/platform/monitoring: only `refresh` is accepted. */
export const summaryQuery = z.object({ refresh: z.enum(["0", "1", "true", "false"]).optional() }).strict();
