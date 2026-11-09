import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { limitBy } from "@/lib/rateLimit";
import { expireStale } from "@/lib/invitations/service";
import { hashToken, looksLikeToken, maskEmail } from "@/lib/invitations/token";

const body = z.object({ token: z.string().max(200) });
const INVALID = () => new ApiError(410, "INVITATION_INVALID", "This invitation link is not valid. Ask your placement cell to send a new one");

/** Public. Shows a student what the link is for before they accept. A bad, used or revoked token all look the same. */
export async function POST(req: NextRequest) {
  try {
    await limitBy(req, { name: "invite-lookup", max: 60, windowSec: 900 });
    const { token } = await parseBody(req, body);
    if (!looksLikeToken(token)) throw INVALID();
    await expireStale();
    const inv = await db.studentInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        college: { select: { name: true, logoUrl: true, brandColor: true } },
        student: { select: { name: true, enrollmentNo: true, userId: true, department: { select: { name: true } }, program: { select: { name: true } }, branch: { select: { name: true } }, batch: { select: { name: true, endYear: true } }, campus: { select: { name: true } } } },
      },
    });
    if (!inv || inv.status === "REVOKED" || inv.status === "ACCEPTED" || inv.student.userId) throw INVALID();
    if (inv.status === "EXPIRED" || inv.expiresAt < new Date()) throw new ApiError(410, "INVITATION_EXPIRED", "This invitation has expired. Ask your placement cell to send a new one");
    const st = inv.student;
    return NextResponse.json({
      data: {
        institution: inv.college, name: st.name, emailHint: maskEmail(inv.invitedEmail), expiresAt: inv.expiresAt,
        assigned: { admissionNumber: inv.admissionNumber, campus: st.campus?.name ?? null, department: st.department.name, programme: st.program?.name ?? null, branch: st.branch?.name ?? null, batch: st.batch.name, admissionYear: inv.admissionYear, graduationYear: inv.graduationYear ?? st.batch.endYear },
      },
    });
  } catch (e) {
    return toErrorResponse(e, req);
  }
}
