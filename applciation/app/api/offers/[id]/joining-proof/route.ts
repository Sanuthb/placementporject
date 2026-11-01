import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** A short-lived link to the joining proof the student attached. */
export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  const o = await db.offer.findFirst({ where: { id, collegeId: s.collegeId }, select: { joiningProofPath: true, joiningProofName: true } });
  if (!o?.joiningProofPath) throw notFound("No joining proof attached");
  const url = (await supabaseAdmin().storage.from("student-documents").createSignedUrl(o.joiningProofPath, 300)).data?.signedUrl;
  if (!url) throw notFound("The file could not be opened");
  return { url, name: o.joiningProofName };
});
