import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "bloqueios.json");

// cria pasta se não existir
async function ensureDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
}

// tenta extrair a lista de bloqueios de VÁRIOS formatos
function pickLista(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const p = payload.data ?? payload;
  const cands = [
    p.listaBloqueios, p.bloqueios, p.lista, p.items,
    p?.data?.listaBloqueios, p?.data?.bloqueios, p?.data?.lista, p?.data?.items,
  ];
  for (const c of cands) if (Array.isArray(c)) return c;

  return [];
}

/* ================= GET ================= */
export async function GET() {
  try {
    await ensureDir();
    const buf = await fs.readFile(DATA_FILE);
    const json = JSON.parse(buf.toString());

    const lista = pickLista(json);
    const savedAt = json?.savedAt ?? new Date().toISOString();

    // sempre normalize a resposta para { ok:true, data:{ lista:[...] } }
    return NextResponse.json({ ok: true, data: { savedAt, lista } });
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      // arquivo ainda não existe
      return NextResponse.json({ ok: true, data: { savedAt: null, lista: [] } });
    }
    return NextResponse.json({ ok: false, error: e?.message || "erro ao carregar" }, { status: 500 });
  }
}

/* ================= POST =================
Aceita:
- { lista:[...] }  (preferido)
- { listaBloqueios:[...] }
- [ ... ]          (array puro)
Salva normalizado como { savedAt, lista }.
*/
export async function POST(req: Request) {
  try {
    const body = await req.json();
    let lista: any[] = [];

    if (Array.isArray(body)) lista = body;
    else if (Array.isArray(body?.lista)) lista = body.lista;
    else if (Array.isArray(body?.listaBloqueios)) lista = body.listaBloqueios;
    else if (Array.isArray(body?.data)) lista = body.data;
    else lista = pickLista(body);

    const payload = {
      savedAt: new Date().toISOString(),
      lista,
    };

    await ensureDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");

    return NextResponse.json({ ok: true, data: payload });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "erro ao salvar" }, { status: 500 });
  }
}
