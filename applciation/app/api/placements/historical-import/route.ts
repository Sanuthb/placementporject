import { readForm } from "@/lib/api/parse";
import { route } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { importHistorical } from "@/lib/historical";

/**
 * Multipart field "file" (.xlsx or .csv) with columns: enrollment_no, name, email, department_code, batch_name,
 * company_name, company_tier (optional), role, package_lpa, offer_year, joined (optional yes/no).
 * Add ?dryRun=true to validate without writing anything.
 */
export const POST = route({ limit: { name: "import", max: 20, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const file = (await readForm(req, 5 * 1024 * 1024)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the spreadsheet as multipart field "file"');
  if (file.size > 5 * 1024 * 1024) throw badRequest("File is larger than 5 MB");
  return importHistorical(s, Buffer.from(await file.arrayBuffer()), file.name, req.nextUrl.searchParams.get("dryRun") === "true");
});
