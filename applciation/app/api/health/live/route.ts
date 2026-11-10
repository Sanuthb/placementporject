import { NextResponse } from "next/server";
import { liveness } from "@/lib/health";

/** Liveness for orchestrators: the process answers. Touches no dependency and says nothing else. */
export function GET() { return NextResponse.json(liveness()); }
