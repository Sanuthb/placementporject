import { z } from "zod";

export const contactSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.email().optional(), phone: z.string().trim().max(30).optional(), designation: z.string().trim().max(100).optional() });
