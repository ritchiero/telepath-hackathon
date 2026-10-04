import { NextResponse } from "next/server";
import { getPredictions } from "@/lib/mind-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPredictions());
}
