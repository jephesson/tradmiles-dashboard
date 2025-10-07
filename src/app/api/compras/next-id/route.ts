// src/app/api/compras/next-id/route.ts
import { NextRequest, NextResponse } from "next/server";
import { nextShortId } from "@/lib/comprasRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  _ctx: { params: Promise<Record<string, never>> } // mantém assinatura compatível com Next 15
) {
  try {
    const next = await nextShortId();
    return NextResponse.json({ ok: true, nextId: next, data: { nextId: next } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao calcular próximo ID";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
