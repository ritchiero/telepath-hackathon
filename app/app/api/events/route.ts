import { NextResponse } from "next/server";
import { getEvents } from "@/lib/mind-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getEvents());
}
