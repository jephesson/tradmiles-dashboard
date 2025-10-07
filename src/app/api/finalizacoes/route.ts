// src/app/api/finalizacoes/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ============ Persistência (filesystem) ============ */
// Em produção (Vercel) só /tmp é gravável; local: ./data
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "finalizacoes.json");

type FinalizacaoRec = {
  id: string;
  data: string; // yyyy-mm-dd
  compraId?: string | null;
  contaId?: string | null;
  ownerFuncionarioId?: string | null;
  lucroFinalizacao?: number;
  observacao?: string;
  createdAt?: string;
  updatedAt?: string;
};

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

async function ensureDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
}

async function loadAll(): Promise<FinalizacaoRec[]> {
  try {
    const buf = await fs.readFile(DATA_FILE, "utf-8");
    const arr = JSON.parse(buf);
    return Array.isArray(arr) ? arr : [];
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

async function saveAll(list: FinalizacaoRec[]) {
  await ensureDir();
  await fs.writeFile(DATA_FILE, JSON.stringify(list, null, 2), "utf-8");
}

function genId() {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  return `FIN-${iso}-${rnd}`;
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ============ GET /api/finalizacoes ============ */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const limit = Number(searchParams.get("limit") || "2000");

    let list = await loadAll();

    if (id) {
      const found = list.find((x) => x.id === id);
      if (!found) {
        return NextResponse.json({ error: "Não encontrada" }, { status: 404, headers: noCache() });
      }
      return NextResponse.json(found, { headers: noCache() });
    }

    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (start) list = list.filter((x) => x.data >= start);
    if (end) list = list.filter((x) => x.data <= end);

    list.sort((a, b) => {
      // data desc, depois createdAt desc
      const d = b.data.localeCompare(a.data);
      if (d !== 0) return d;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    return NextResponse.json(
      { items: list.slice(0, Math.max(1, limit)), total: list.length },
      { headers: noCache() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao carregar" },
      { status: 500, headers: noCache() }
    );
  }
}

/* ============ POST /api/finalizacoes ============ */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const list = await loadAll();

    const nowIso = new Date().toISOString();
    const rec: FinalizacaoRec = {
      id: genId(),
      data: String(body?.data || nowIso.slice(0, 10)),
      compraId: body?.compraId ?? null,
      contaId: body?.contaId ?? null,
      ownerFuncionarioId: body?.ownerFuncionarioId ?? null,
      lucroFinalizacao: toNum(body?.lucroFinalizacao),
      observacao: String(body?.observacao || ""),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    list.push(rec);
    await saveAll(list);

    return NextResponse.json(rec, { status: 201, headers: noCache() });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao salvar" },
      { status: 500, headers: noCache() }
    );
  }
}

/* ============ PATCH /api/finalizacoes?id=XXX ============ */
export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID ausente" }, { status: 400, headers: noCache() });

    const body = await req.json();
    const list = await loadAll();
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1)
      return NextResponse.json({ error: "Finalização não encontrada" }, { status: 404, headers: noCache() });

    const curr = list[idx];
    const updated: FinalizacaoRec = {
      ...curr,
      data: body?.data ? String(body.data) : curr.data,
      compraId: body?.compraId ?? curr.compraId,
      contaId: body?.contaId ?? curr.contaId,
      ownerFuncionarioId: body?.ownerFuncionarioId ?? curr.ownerFuncionarioId,
      lucroFinalizacao:
        typeof body?.lucroFinalizacao !== "undefined" ? toNum(body.lucroFinalizacao) : curr.lucroFinalizacao,
      observacao: typeof body?.observacao === "string" ? body.observacao : curr.observacao,
      updatedAt: new Date().toISOString(),
    };

    list[idx] = updated;
    await saveAll(list);

    return NextResponse.json(updated, { headers: noCache() });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao atualizar" },
      { status: 500, headers: noCache() }
    );
  }
}

/* ============ DELETE /api/finalizacoes?id=XXX ============ */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID ausente" }, { status: 400, headers: noCache() });

    const list = await loadAll();
    const next = list.filter((x) => x.id !== id);
    if (next.length === list.length) {
      return NextResponse.json({ error: "Finalização não encontrada" }, { status: 404, headers: noCache() });
    }

    await saveAll(next);
    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao excluir" },
      { status: 500, headers: noCache() }
    );
  }
}
