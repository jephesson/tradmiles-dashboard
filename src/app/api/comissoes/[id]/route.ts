// src/app/api/comissoes/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // mantém consistente com os outros arquivos
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

type Status = "pago" | "aguardando";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const raw = await req.json().catch(() => ({}));
    const status = (raw?.status as Status) || undefined;

    if (!status || (status !== "pago" && status !== "aguardando")) {
      return NextResponse.json(
        { ok: false, error: "status inválido (use 'pago' ou 'aguardando')" },
        { status: 400, headers: noCache() }
      );
    }

    const data = await prisma.comissao.update({
      where: { id },
      data: { status, atualizadoEm: new Date() },
    });

    return NextResponse.json({ ok: true, data }, { headers: noCache() });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { ok: false, error: "comissão não encontrada" },
        { status: 404, headers: noCache() }
      );
    }
    const msg = err instanceof Error ? err.message : "erro ao atualizar";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: noCache() }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.comissao.delete({ where: { id } });
    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { ok: false, error: "comissão não encontrada" },
        { status: 404, headers: noCache() }
      );
    }
    const msg = err instanceof Error ? err.message : "erro ao excluir";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: noCache() }
    );
  }
}
