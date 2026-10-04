import { NextResponse } from "next/server";
import { resetMind } from "@/lib/mind-server";

export const dynamic = "force-dynamic";

// Resetea la mente al seed inicial. Solo para ensayos y pre-demo.
export async function POST() {
  const r = await resetMind();
  return NextResponse.json({ reset: true, ...r });
}
