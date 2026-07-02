import { NextResponse } from "next/server";

// Lightweight health-checkable route for docker-compose (T26a) — no downstream calls,
// just confirms the Next.js server itself is up and serving requests.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
