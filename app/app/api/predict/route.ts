import { NextResponse } from "next/server";
import { predict } from "@/lib/mind-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { query } = (await req.json()) as { query: string };
  if (!query || !query.trim()) {
    return NextResponse.json({ error: "query vacío" }, { status: 400 });
  }
  const result = await predict(query.trim());
  return NextResponse.json(result);
}
