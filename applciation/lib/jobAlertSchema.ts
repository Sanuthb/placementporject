import { z } from "zod";
import { JobType } from "@/generated/prisma/client";

export const alertFields = {
  title: z.string().trim().min(3).max(200),
  companyName: z.string().trim().min(2).max(200),
  jobType: z.enum(JobType),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(10_000).optional(),
  applyUrl: z.url(),
  deadline: z.coerce.date().optional(),
  targetDepartmentIds: z.array(z.uuid()).max(100),
  targetBatchIds: z.array(z.uuid()).max(100),
  targetSkills: z.array(z.string().trim().min(1).max(50)).max(30),
};
