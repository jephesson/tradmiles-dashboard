import { NextResponse } from "next/server";

/** ===============================
 * Chave no localStorage (ou DB)
 * =============================== */
const KEY = "TM_FINALIZACOES";

/** ===============================
 * Tipos
 * =============================== */
type FinalizacaoRec = {
  id: string;
  data: string; // ISO yyyy-mm-dd
  compraId?: string | null;
  contaId?: string | null;
  ownerFuncionarioId?: string | null;
  lucroFinalizacao?: number;
  observacao?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** ===============================
 * Funções utilitárias
 * =============================== */
function loadAll(): FinalizacaoRec[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(list: FinalizacaoRec[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

function genId() {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  return `FIN-${iso}-${rnd}`;
}

/** ===============================
 * GET /api/finalizacoes
 * =============================== */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const limit = Number(searchParams.get("limit") || "2000");

  let list = loadAll();
  if (id) {
    const found = list.find((x) => x.id === id);
    if (!found) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json(found);
  }

  // filtros simples por data (se quiser)
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (start) list = list.filter((x) => x.data >= start);
  if (end) list = list.filter((x) => x.data <= end);

  // ordena mais recentes primeiro
  list.sort((a, b) => b.data.localeCompare(a.data));

  return NextResponse.json({
    items: list.slice(0, limit),
    total: list.length,
  });
}

/** ===============================
 * POST /api/finalizacoes
 * =============================== */
export async function POST(req: Request) {
  const body = await req.json();
  const list = loadAll();

  const now = new Date().toISOString();
  const rec: FinalizacaoRec = {
    id: genId(),
    data: body.data || now.slice(0, 10),
    compraId: body.compraId ?? null,
    contaId: body.contaId ?? null,
    ownerFuncionarioId: body.ownerFuncionarioId ?? null,
    lucroFinalizacao: Number(body.lucroFinalizacao || 0),
    observacao: body.observacao || "",
    createdAt: now,
    updatedAt: now,
  };

  list.push(rec);
  saveAll(list);

  return NextResponse.json(rec);
}

/** ===============================
 * PATCH /api/finalizacoes?id=XXX
 * =============================== */
export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID ausente" }, { status: 400 });

  const body = await req.json();
  const list = loadAll();
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1)
    return NextResponse.json({ error: "Finalização não encontrada" }, { status: 404 });

  const updated = {
    ...list[idx],
    ...body,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = updated;
  saveAll(list);

  return NextResponse.json(updated);
}

/** ===============================
 * DELETE /api/finalizacoes?id=XXX
 * =============================== */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID ausente" }, { status: 400 });

  let list = loadAll();
  const before = list.length;
  list = list.filter((x) => x.id !== id);
  if (list.length === before)
    return NextResponse.json({ error: "Finalização não encontrada" }, { status: 404 });

  saveAll(list);
  return NextResponse.json({ ok: true });
}
