import { db } from "@/lib/db";
import type { Event } from "@/generated/prisma/client";

type Student = { collegeId: string; departmentId: string; batchId: string };

/** Targets are matched in code (empty target lists mean everyone); see lib/announcements.ts for why. */
export const eventVisibleTo = (e: Pick<Event, "targetDepartmentIds" | "targetBatchIds">, st: Student) =>
  (!e.targetDepartmentIds.length || e.targetDepartmentIds.includes(st.departmentId)) && (!e.targetBatchIds.length || e.targetBatchIds.includes(st.batchId));

export const lockEvent = (tx: Pick<typeof db, "$queryRaw">, id: string) => tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${id}::uuid FOR UPDATE`;
