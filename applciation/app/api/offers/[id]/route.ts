import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const GET = route<{ id: string }>({ module: "DRIVES" }, async (_req, s, { id }) => {
  const offer = await db.offer.findFirst({ where: { id, collegeId: s.collegeId, student: { ...departmentScope(s) } }, include: { student: { select: { id: true, name: true, enrollmentNo: true } }, company: { select: { id: true, name: true, tier: true } } } });
  if (!offer) throw notFound("Offer not found");
  const { letterPath, ...o } = offer;
  const letterUrl = letterPath ? (await supabaseAdmin().storage.from("offer-letters").createSignedUrl(letterPath, 600)).data?.signedUrl ?? null : null;
  return { ...o, letterUrl };
});
