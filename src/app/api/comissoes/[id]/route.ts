// app/api/comissoes/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const body = await req.json();
  const { status } = body || {};
  const data = await prisma.comissao.update({
    where: { id },
    data: { status, atualizadoEm: new Date() },
  });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  await prisma.comissao.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
