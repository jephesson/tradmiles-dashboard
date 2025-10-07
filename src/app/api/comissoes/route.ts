// app/api/comissoes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const status = searchParams.get("status") || "";

  const where: any = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { cedenteNome: { contains: q, mode: "insensitive" } },
      { compraId:    { contains: q, mode: "insensitive" } },
    ];
  }

  const data = await prisma.comissao.findMany({
    where,
    orderBy: { criadoEm: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { compraId, cedenteId, cedenteNome, valor, status } = body || {};
  if (!compraId || !cedenteId) {
    return NextResponse.json(
      { ok: false, error: "compraId e cedenteId são obrigatórios" },
      { status: 400 }
    );
  }

  const data = await prisma.comissao.upsert({
    where: { compraId_cedenteId: { compraId, cedenteId } },
    update: {
      cedenteNome: cedenteNome ?? "",
      valor: Number(valor || 0),
      status: status || "aguardando",
      atualizadoEm: new Date(),
    },
    create: {
      compraId,
      cedenteId,
      cedenteNome: cedenteNome ?? "",
      valor: Number(valor || 0),
      status: status || "aguardando",
    },
  });

  return NextResponse.json({ ok: true, data });
}
