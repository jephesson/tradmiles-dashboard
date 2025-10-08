// app/api/bloqueios/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Força execução dinâmica (App Router) e sem cache */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/** Em serverless (Vercel) escreva em /tmp; em dev, na pasta do projeto */
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "bloqueios.json");

/* ---------- Tipos utilitários ---------- */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

type Payload = {
  savedAt: string;
  lista: Json[]; // os itens podem ser objetos ou valores simples
};

function isRecord(v: unknown): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Cabeçalhos para desabilitar cache em browser/CDN */
function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
}

/** Extrai "lista" de diferentes formatos aceitos (legados ou alternativos) */
function pickLista(payload: unknown): Json[] {
  if (Array.isArray(payload)) return payload as Json[];

  const p = isRecord(payload) ? payload : null;
  if (!p) return [];

  const candidates: unknown[] = [
    p.lista,
    p.listaBloqueios,
    p.bloqueios,
    p.items,
    isRecord(p.data) ? p.data.lista : undefined,
    isRecord(p.data) ? p.data.listaBloqueios : undefined,
    isRecord(p.data) ? p.data.bloqueios : undefined,
    isRecord(p.data) ? p.data.items : undefined,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c as Json[];
  }
  return [];
}

/* ================ GET ================ */
export async function GET() {
  try {
    await ensureDir();

    let parsed: unknown = null;
    try {
      const buf = await fs.readFile(DATA_FILE);
      parsed = JSON.parse(buf.toString("utf-8"));
    } catch (e) {
      // arquivo ainda não existe
      if (!(typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "ENOENT")) {
        throw e;
      }
    }

    // Se já estiver salvo no formato normalizado { savedAt, lista }, mantenha.
    if (isRecord(parsed) && "savedAt" in parsed && "lista" in parsed && Array.isArray((parsed as any).lista)) {
      const out: Payload = {
        savedAt: String((parsed as Record<string, Json>).savedAt ?? new Date().toISOString()),
        lista: (parsed as { lista: Json[] }).lista,
      };
      return new NextResponse(JSON.stringify({ ok: true, data: out }), {
        status: 200,
        headers: noCacheHeaders(),
      });
    }

    // Caso contrário, tente extrair pelos formatos alternativos
    const lista = pickLista(parsed);
    const savedAt = isRecord(parsed) && typeof parsed.savedAt === "string" ? parsed.savedAt : null;

    return new NextResponse(JSON.stringify({ ok: true, data: { savedAt, lista } }), {
      status: 200,
      headers: noCacheHeaders(),
    });
  } catch (e) {
    const msg =
      typeof e === "object" && e && "message" in e ? String((e as { message?: unknown }).message) : "erro ao carregar";
    return new NextResponse(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: noCacheHeaders(),
    });
  }
}

/* ================ POST ================
Aceita:
- { lista:[...] }           (preferido)
- { listaBloqueios:[...] }
- { bloqueios:[...] }
- { items:[...] }
- [ ... ]                   (array puro)
Salva normalizado como { savedAt, lista }.
======================================= */
export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();

    let lista: Json[] = [];
    if (Array.isArray(body)) {
      lista = body as Json[];
    } else if (isRecord(body)) {
      // use ternários para nunca gerar boolean
      const direct =
        Array.isArray(body.lista) ? (body.lista as Json[]) :
        Array.isArray(body.listaBloqueios) ? (body.listaBloqueios as Json[]) :
        Array.isArray(body.bloqueios) ? (body.bloqueios as Json[]) :
        Array.isArray(body.items) ? (body.items as Json[]) :
        undefined;

      lista = direct ?? pickLista(body);
    }

    const payload: Payload = {
      savedAt: new Date().toISOString(),
      lista,
    };

    await ensureDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");

    return new NextResponse(JSON.stringify({ ok: true, data: payload }), {
      status: 200,
      headers: noCacheHeaders(),
    });
  } catch (e) {
    const msg =
      typeof e === "object" && e && "message" in e ? String((e as { message?: unknown }).message) : "erro ao salvar";
    return new NextResponse(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: noCacheHeaders(),
    });
  }
}
