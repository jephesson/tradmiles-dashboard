a// src/app/api/compras/next-id/route.ts
import { NextResponse } from "next/server";
import { nextShortId } from "@/lib/comprasRepo";

export async function GET() {
  try {
    const next = await nextShortId();
    // mantém ambos os formatos para compatibilidade
    return NextResponse.json({ ok: true, nextId: next, data: { nextId: next } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao calcular próximo ID" },
      { status: 500 }
    );
  }
}
