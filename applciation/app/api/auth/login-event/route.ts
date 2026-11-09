import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { forbidden, unauthorized } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { clientIp, limitBy } from "@/lib/rateLimit";
import { verifyTokenInfo } from "@/lib/auth/verifyToken";

/**
 * Called by the app right after a person signs in. Records one history row per sign-in session. The session id comes from the signed token,
 * so calling this again for the same session changes nothing. Works for staff, students and recruiters.
 */
export async function POST(req: NextRequest) {
  try {
    await limitBy(req, { name: "login-event", max: 60, windowSec: 600 });
    const token = (req.headers.get("authorization") ?? "").startsWith("Bearer ") ? req.headers.get("authorization")!.slice(7) : null;
    if (!token) throw unauthorized();
    const info = await verifyTokenInfo(token);
    if (!info.sessionId) return NextResponse.json({ data: { recorded: false } });

    const [staff, student, recruiter] = await Promise.all([
      db.user.findUnique({ where: { id: info.userId }, select: { collegeId: true, isActive: true } }),
      db.student.findUnique({ where: { userId: info.userId }, select: { collegeId: true, isActive: true } }),
      db.recruiter.findUnique({ where: { id: info.userId }, select: { collegeId: true, isActive: true } }),
    ]);
    const who = staff ? { kind: "staff", ...staff } : student ? { kind: "student", ...student } : recruiter ? { kind: "recruiter", ...recruiter } : null;
    if (!who || !who.isActive) throw forbidden("This is not an active account");

    const mfa = info.methods.includes("totp");
    const method = info.methods.find((m) => m !== "totp") ?? info.methods[0] ?? null;
    await db.loginEvent.upsert({
      where: { sessionId: info.sessionId },
      update: { ...(mfa ? { mfa: true } : {}) },
      create: { collegeId: who.collegeId, userId: info.userId, kind: who.kind, sessionId: info.sessionId, method, mfa, ip: clientIp(req), userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null },
    });
    return NextResponse.json({ data: { recorded: true } });
  } catch (e) {
    return toErrorResponse(e, req);
  }
}
