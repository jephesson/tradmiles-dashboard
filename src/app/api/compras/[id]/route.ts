// src/app/api/compras/[id]/route.ts
import { NextResponse } from "next/server";
import {
  findCompraById,
  deleteCompraById,
  // adicione esta função no seu comprasRepo (exemplo abaixo)
  updateCompraById,
} from "@/lib/comprasRepo";

type StatusPontos = "aguardando" | "liberados";

/** GET /api/compras/:id */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const item = await findCompraById(params.id);
    if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(item);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao buscar" }, { status: 500 });
  }
}

/** PATCH /api/compras/:id
 *  Atualização parcial. Exemplos de body:
 *   { "statusPontos": "liberados" }
 *   { "dataCompra": "2025-09-23", "cedenteId": "ABC" }
 *   { "itens": [...], "totaisId": {...} }
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    // Sanitização: só deixa passar campos conhecidos
    const allowedKeys = new Set([
      "statusPontos", // "aguardando" | "liberados"
      "dataCompra",
      "cedenteId",
      "modo",
      "ciaCompra",
      "destCia",
      "origem",
      "valores",
      "calculos",
      "itens",
      "totaisId",
      "savedAt",
    ]);

    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      if (allowedKeys.has(k)) patch[k] = v;
    }

    // Validação simples de status
    if ("statusPontos" in patch) {
      const s = String(patch.statusPontos) as StatusPontos;
      if (s !== "aguardando" && s !== "liberados") {
        return NextResponse.json({ error: "statusPontos inválido" }, { status: 400 });
      }
    }

    const updated = await updateCompraById(params.id, patch);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, id: params.id, data: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao atualizar" }, { status: 500 });
  }
}

/** DELETE /api/compras/:id */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteCompraById(params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao excluir" }, { status: 500 });
  }
}
