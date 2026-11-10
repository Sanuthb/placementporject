import { NextResponse } from "next/server";
import { readiness } from "@/lib/health";

/** Readiness for load balancers: can this instance serve (database answers within 2 s). One query at most every 5 s, cached; no detail is returned to an unauthenticated caller. */
export async function GET() {
  const ok = await readiness();
  return NextResponse.json({ status: ok ? "ready" : "unavailable" }, { status: ok ? 200 : 503 });
}
