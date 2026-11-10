import { z } from "zod";
import type { NextRequest } from "next/server";
import { parseQuery } from "@/lib/api/parse";
import { respond } from "@/lib/reportDoc";
import type { ReportDoc } from "@/lib/reportDoc";

export const formatQuery = z.object({ format: z.enum(["pdf", "docx", "json"]).default("pdf") });
/** Sends a report in the format the request asks for (?format=pdf|docx|json). */
export async function send(req: NextRequest, doc: ReportDoc) {
  const q = parseQuery(req, formatQuery);
  return respond(doc, q.format);
}
