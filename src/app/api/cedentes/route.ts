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

// Cabeçalhos de resposta para evitar cache no cliente/CDN
function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    // evita caching intermediário em CDNs que não respeitam Cache-Control
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
    let json: any = null;

    try {
      const buf = await fs.readFile(DATA_FILE);
      json = JSON.parse(buf.toString("utf-8"));
    } catch (e: any) {
      if (e?.code !== "ENOENT") throw e; // outro erro que não seja "arquivo não existe"
      json = null; // primeira execução sem arquivo
    }

    return new NextResponse(
      JSON.stringify({ ok: true, data: json }),
      { status: 200, headers: noCacheHeaders() }
    );
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: e?.message || "erro ao carregar" }),
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json(); // { listaCedentes, meta? }
    const payload = {
      savedAt: new Date().toISOString(),
      ...body,
    };

    await ensureDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");

    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: noCacheHeaders(),
    });
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: e?.message || "erro ao salvar" }),
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
