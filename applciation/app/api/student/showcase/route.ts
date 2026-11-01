import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { newToken } from "@/lib/showcase";

const put = z.object({
  enabled: z.boolean(), headline: z.string().trim().max(160).optional(), showCgpa: z.boolean().optional(), showContact: z.boolean().optional(), expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});
const view = (p: { token: string; isEnabled: boolean; headline: string | null; showCgpa: boolean; showContact: boolean; expiresAt: Date | null; views: number }) => ({
  enabled: p.isEnabled, link: p.isEnabled ? `/api/showcase/${p.token}` : null, headline: p.headline, showCgpa: p.showCgpa, showContact: p.showContact, expiresAt: p.expiresAt, views: p.views,
});

export const GET = studentRoute({ module: "TALENT_SHOWCASE" }, async (_req, me) => {
  const p = await db.showcaseProfile.findUnique({ where: { studentId: me.studentId } });
  return p ? view(p) : { enabled: false, link: null };
});

/** Turn my public profile on or off and choose what it shows. Nothing is shared until I enable it. */
export const PUT = studentRoute({ limit: { name: "showcase", max: 60, windowSec: 3600 }, module: "TALENT_SHOWCASE" }, async (req, me) => {
  const b = await parseBody(req, put);
  const expiresAt = b.expiresInDays === undefined ? undefined : b.expiresInDays === null ? null : new Date(Date.now() + b.expiresInDays * 86_400_000);
  const p = await db.showcaseProfile.upsert({
    where: { studentId: me.studentId },
    update: { isEnabled: b.enabled, headline: b.headline, showCgpa: b.showCgpa, showContact: b.showContact, expiresAt },
    create: { collegeId: me.collegeId, studentId: me.studentId, token: newToken(), isEnabled: b.enabled, headline: b.headline, showCgpa: b.showCgpa ?? false, showContact: b.showContact ?? false, expiresAt: expiresAt ?? null },
  });
  await audit({ collegeId: me.collegeId, userId: null }, { action: b.enabled ? "showcase.enable" : "showcase.disable", entity: "Student", entityId: me.studentId });
  return view(p);
});
