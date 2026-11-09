import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { unauthorized } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { verifyTokenInfo } from "@/lib/auth/verifyToken";

/** My own recent sign-ins, for any kind of login, so a person can spot one they do not recognise. */
export async function GET(req: NextRequest) {
  try {
    const h = req.headers.get("authorization") ?? "";
    if (!h.startsWith("Bearer ")) throw unauthorized();
    const { userId } = await verifyTokenInfo(h.slice(7));
    const rows = await db.loginEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, createdAt: true, method: true, mfa: true, ip: true, userAgent: true } });
    return NextResponse.json({ data: { items: rows } });
  } catch (e) {
    return toErrorResponse(e, req);
  }
}
