// src/app/api/cedentes/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// Força execução dinâmica e sem cache no App Router
export const dynamic = "force-dynamic";
export const revalidate = 0;
// (Opcional) garante runtime Node
export const runtime = "nodejs";

// Em produção serverless (ex.: Vercel) o único disco gravável é /tmp.
// Em dev/local, gravamos na pasta ./data do projeto.
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "cedentes.json");

// Tipos auxiliares para JSON seguro (sem any)
type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [k: string]: Json };

type CedentesPayload = {
  savedAt: string;
} & Record<string, Json>;

function isRecord(v: unknown): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Cabeçalhos de resposta para evitar cache no cliente/CDN
function noCacheHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

// garante que a pasta exista
async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
}

export async function GET() {
  try {
    await ensureDir();
    let json: CedentesPayload | null = null;

    try {
      const buf = await fs.readFile(DATA_FILE);
      const parsed = JSON.parse(buf.toString("utf-8"));
      json = isRecord(parsed)
        ? ({ savedAt: String(parsed.savedAt ?? ""), ...parsed } as CedentesPayload)
        : null;
    } catch (e: unknown) {
      // Se não existir o arquivo, apenas retorna null
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "ENOENT"
      ) {
        json = null;
      } else {
        throw e;
      }
    }

    return NextResponse.json({ ok: true, data: json }, { status: 200, headers: noCacheHeaders() });
  } catch (e: unknown) {
    const message =
      typeof e === "object" && e !== null && "message" in e
        ? String((e as { message?: unknown }).message)
        : "erro ao carregar";

    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: noCacheHeaders() });
  }
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const body = isRecord(raw) ? raw : {};

    const payload: CedentesPayload = {
      savedAt: new Date().toISOString(),
      ...body,
    };

    await ensureDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");

    return NextResponse.json({ ok: true }, { status: 200, headers: noCacheHeaders() });
  } catch (e: unknown) {
    const message =
      typeof e === "object" && e !== null && "message" in e
        ? String((e as { message?: unknown }).message)
        : "erro ao salvar";

    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: noCacheHeaders() });
  }
}
