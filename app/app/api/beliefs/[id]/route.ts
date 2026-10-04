import { NextResponse } from "next/server";
import { correctBelief, deleteBelief } from "@/lib/mind-server";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { correction, by } = (await req.json()) as { correction: string; by?: string };
  if (!correction || !correction.trim()) {
    return NextResponse.json({ error: "correction vacía" }, { status: 400 });
  }
  const belief = await correctBelief(id, correction.trim(), by || "usuario");
  if (!belief) return NextResponse.json({ error: "belief no encontrado" }, { status: 404 });
  return NextResponse.json(belief);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteBelief(id);
  if (!ok) return NextResponse.json({ error: "belief no encontrado" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
