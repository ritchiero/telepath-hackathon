import { NextResponse } from "next/server";
import { getBeliefs, contribute } from "@/lib/mind-server";
import type { ContributeItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getBeliefs());
}

export async function POST(req: Request) {
  const { items, agent } = (await req.json()) as { items: ContributeItem[]; agent: string };
  if (!Array.isArray(items) || items.length === 0 || !agent) {
    return NextResponse.json({ error: "items y agent requeridos" }, { status: 400 });
  }
  const result = await contribute(items, agent);
  return NextResponse.json({ ...result, beliefs: await getBeliefs() });
}
