import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Liveness and database check for load balancers and uptime monitors. Reveals nothing about configuration. */
export async function GET() {
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", latencyMs: Date.now() - t0 });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
