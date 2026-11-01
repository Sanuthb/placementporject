import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const GET = studentRoute({ module: "DRIVES" }, async (_req, me) => {
  const offers = await db.offer.findMany({ where: { studentId: me.studentId, isHistorical: false }, include: { company: { select: { id: true, name: true, tier: true } } }, orderBy: { offeredAt: "desc" } });
  const bucket = supabaseAdmin().storage.from("offer-letters");
  return Promise.all(offers.map(async (o) => ({
    id: o.id, role: o.role, packageLpa: o.packageLpa, isPpo: o.isPpo, status: o.status, offeredAt: o.offeredAt, respondedAt: o.respondedAt, expiresAt: o.expiresAt,
    joiningStatus: o.joiningStatus, joiningDate: o.joiningDate, studentJoiningDate: o.studentJoiningDate, joiningProofName: o.joiningProofName, company: o.company, letterUrl: o.letterPath ? (await bucket.createSignedUrl(o.letterPath, 600)).data?.signedUrl ?? null : null,
  })));
});
