// app/api/vendas/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaymentStatus = "pago" | "pendente";
type CIA = "latam" | "smiles";

type CancelInfo = {
  at: string;
  taxaCia: number;
  taxaEmpresa: number;
  refund: number;
  recreditPoints?: boolean;
  note?: string | null;
};

type VendaRecord = {
  id: string;
  createdAt: string;

  data: string;
  pontos: number;
  cia: CIA;
  qtdPassageiros: number;

  funcionarioId: string | null;
  funcionarioNome: string | null;
  userName: string | null;
  userEmail: string | null;

  clienteId: string | null;
  clienteNome: string | null;
  clienteOrigem: string | null;

  contaEscolhida?: {
    id: string;
    nome: string;
    usar: number;
    disponivel: number;
    leftover: number;
    compraId: string | null;
    regra?: string;
  } | null;
  sugestaoCombinacao?: Array<{ id: string; nome: string; usar: number; disp: number }>;

  milheiros: number;
  valorMilheiro: number;
  valorPontos: number;
  taxaEmbarque: number;
  totalCobrar: number;

  metaMilheiro: number | null;
  comissaoBase: number;
  comissaoBonusMeta: number;
  comissaoTotal: number;

  cartaoFuncionarioId: string | null;
  cartaoFuncionarioNome: string | null;

  pagamentoStatus: PaymentStatus;

  localizador: string | null;
  origemIATA: string | null;
  sobrenome: string | null;

  cancelInfo?: CancelInfo | null;
};

/* ================== Persistência ================== */
// Em produção (Vercel) só /tmp é gravável; local: ./data
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const VENDAS_FILE = path.join(DATA_DIR, "vendas.json");
const CEDENTES_FILE = path.join(DATA_DIR, "cedentes.json");

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (e: any) {
    if (e?.code === "ENOENT") return fallback;
    // Se o arquivo existir mas estiver corrompido, não derruba a API
    try {
      return fallback;
    } catch {
      return fallback;
    }
  }
}

async function writeJson(file: string, data: any) {
  await ensureDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

function up(s: any) {
  return String(s || "").toUpperCase();
}

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function pickCedenteFields(c: any) {
  return {
    identificador: c.identificador,
    nome: c.nome ?? c.nome_completo ?? null,
    nome_completo: c.nome_completo ?? c.nome ?? null,
    latam: Number(c.latam || 0),
    smiles: Number(c.smiles || 0),
    livelo: Number(c.livelo || 0),
    esfera: Number(c.esfera || 0),
  };
}

/** Lê o arquivo de cedentes aceitando vários formatos e devolve um writer que preserva o formato */
async function loadCedentesFile(): Promise<{
  list: any[];
  write: (arr: any[]) => Promise<void>;
}> {
  const parsed = await readJson<any>(CEDENTES_FILE, null as any);

  let list: any[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.listaCedentes)) {
    list = parsed.listaCedentes;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    parsed.data &&
    Array.isArray(parsed.data.listaCedentes)
  ) {
    list = parsed.data.listaCedentes;
  }

  const write = async (arr: any[]) => {
    if (Array.isArray(parsed)) {
      await writeJson(CEDENTES_FILE, arr);
      return;
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed?.listaCedentes)) {
      const next = { ...parsed, listaCedentes: arr };
      await writeJson(CEDENTES_FILE, next);
      return;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.data &&
      Array.isArray(parsed.data.listaCedentes)
    ) {
      const next = { ...parsed, data: { ...parsed.data, listaCedentes: arr } };
      await writeJson(CEDENTES_FILE, next);
      return;
    }
    await writeJson(CEDENTES_FILE, arr);
  };

  return { list, write };
}

/* ================== Handlers ================== */
export async function GET() {
  const vendas = await readJson<VendaRecord[]>(VENDAS_FILE, []);
  return NextResponse.json({ ok: true, lista: vendas }, { headers: noCache() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body?.cia || !body?.pontos) {
      return NextResponse.json(
        { ok: false, error: "Campos obrigatórios ausentes (cia, pontos)." },
        { status: 400, headers: noCache() }
      );
    }

    const { list: cedentesFromDisk, write: writeCedentesPreservingShape } =
      await loadCedentesFile();

    const seedArr: any[] = Array.isArray(body.cedentes)
      ? body.cedentes
      : Array.isArray(body.cedentesSnapshot)
      ? body.cedentesSnapshot
      : [];

    let cedentes =
      Array.isArray(cedentesFromDisk) && cedentesFromDisk.length
        ? [...cedentesFromDisk]
        : seedArr.length
        ? seedArr.map(pickCedenteFields)
        : [];

    // Se não existe arquivo e veio um snapshot no POST, inicializa o arquivo
    if (cedentesFromDisk.length === 0 && seedArr.length) {
      await writeJson(CEDENTES_FILE, cedentes);
    }

    const id = "V" + Date.now();
    const record: VendaRecord = {
      id,
      createdAt: new Date().toISOString(),

      data: body.data || "",
      pontos: Number(body.pontos || 0),
      cia: body.cia === "latam" ? "latam" : "smiles",
      qtdPassageiros: Number(body.qtdPassageiros || 0),

      funcionarioId: body.funcionarioId ?? null,
      funcionarioNome: body.funcionarioNome ?? null,
      userName: body.userName ?? null,
      userEmail: body.userEmail ?? null,

      clienteId: body.clienteId ?? null,
      clienteNome: body.clienteNome ?? null,
      clienteOrigem: body.clienteOrigem ?? null,

      contaEscolhida: body.contaEscolhida ?? null,
      sugestaoCombinacao: Array.isArray(body.sugestaoCombinacao) ? body.sugestaoCombinacao : [],

      milheiros: Number(body.milheiros || 0),
      valorMilheiro: Number(body.valorMilheiro || 0),
      valorPontos: Number(body.valorPontos || 0),
      taxaEmbarque: Number(body.taxaEmbarque || 0),
      totalCobrar: Number(body.totalCobrar || 0),

      metaMilheiro: typeof body.metaMilheiro === "number" ? body.metaMilheiro : null,
      comissaoBase: Number(body.comissaoBase || 0),
      comissaoBonusMeta: Number(body.comissaoBonusMeta || 0),
      comissaoTotal: Number(body.comissaoTotal || 0),

      cartaoFuncionarioId: body.cartaoFuncionarioId ?? null,
      cartaoFuncionarioNome: body.cartaoFuncionarioNome ?? null,

      pagamentoStatus: (body.pagamentoStatus as PaymentStatus) || "pendente",

      localizador: body.localizador ?? null,
      origemIATA: body.origemIATA ?? null,
      sobrenome: body.sobrenome ?? null,

      cancelInfo: null,
    };

    const vendas = await readJson<VendaRecord[]>(VENDAS_FILE, []);
    vendas.unshift(record);
    await writeJson(VENDAS_FILE, vendas);

    // desconta pontos
    const saldoField = record.cia === "latam" ? "latam" : "smiles";
    const descontar = (cedenteId: string, qtd: number) => {
      if (!Array.isArray(cedentes)) return;
      const idx = cedentes.findIndex((c: any) => up(c.identificador) === up(cedenteId));
      if (idx < 0) return;
      const antes = Number(cedentes[idx][saldoField] || 0);
      const depois = Math.max(0, antes - Number(qtd || 0));
      cedentes[idx][saldoField] = depois;
    };

    if (record.contaEscolhida?.id) {
      descontar(record.contaEscolhida.id, record.pontos);
    } else if (Array.isArray(record.sugestaoCombinacao) && record.sugestaoCombinacao.length) {
      for (const parte of record.sugestaoCombinacao) {
        descontar(parte.id, Number(parte.usar || 0));
      }
    }

    await writeCedentesPreservingShape(cedentes);

    return NextResponse.json({ ok: true, id, nextCedentes: cedentes }, { headers: noCache() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro inesperado" },
      { status: 500, headers: noCache() }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const vendas = await readJson<VendaRecord[]>(VENDAS_FILE, []);

    const idx = vendas.findIndex((v) => v.id === body?.id);
    if (idx < 0) {
      return NextResponse.json(
        { ok: false, error: "Venda não encontrada." },
        { status: 404, headers: noCache() }
      );
    }
    const cur = vendas[idx];

    // 1) Atualização simples do pagamentoStatus
    if (body.pagamentoStatus && (body.pagamentoStatus === "pago" || body.pagamentoStatus === "pendente")) {
      vendas[idx] = { ...cur, pagamentoStatus: body.pagamentoStatus as PaymentStatus };
      await writeJson(VENDAS_FILE, vendas);
      return NextResponse.json({ ok: true, record: vendas[idx] }, { headers: noCache() });
    }

    // 2) Cancelamento (com taxas/estorno e possível devolução de pontos)
    if (body.cancel) {
      const taxaCia = Number(body.cancel.taxaCia || 0);
      const taxaEmpresa = Number(body.cancel.taxaEmpresa || 0);
      const recredit = !!body.cancel.recreditPoints;
      const note = typeof body.cancel.note === "string" ? body.cancel.note : null;

      const refund = Math.max(0, Number(cur.totalCobrar || 0) - (taxaCia + taxaEmpresa));

      const updated: VendaRecord = {
        ...cur,
        cancelInfo: {
          at: new Date().toISOString(),
          taxaCia,
          taxaEmpresa,
          refund,
          recreditPoints: recredit,
          note,
        },
      };

      // devolve pontos (opcional)
      if (recredit) {
        const { list: cedentes, write } = await loadCedentesFile();
        const saldoField = cur.cia === "latam" ? "latam" : "smiles";
        const creditar = (cedenteId: string, qtd: number) => {
          const i = cedentes.findIndex((c: any) => up(c.identificador) === up(cedenteId));
          if (i < 0) return;
          const antes = Number(cedentes[i][saldoField] || 0);
          cedentes[i][saldoField] = Math.max(0, antes + Number(qtd || 0));
        };

        if (cur.contaEscolhida?.id) {
          creditar(cur.contaEscolhida.id, cur.pontos);
        } else if (Array.isArray(cur.sugestaoCombinacao) && cur.sugestaoCombinacao.length) {
          for (const parte of cur.sugestaoCombinacao) {
            creditar(parte.id, Number(parte.usar || 0));
          }
        }
        await write(cedentes);
      }

      vendas[idx] = updated;
      await writeJson(VENDAS_FILE, vendas);
      return NextResponse.json({ ok: true, record: updated }, { headers: noCache() });
    }

    return NextResponse.json(
      { ok: false, error: "Nada para atualizar (use pagamentoStatus ou cancel)." },
      { status: 400, headers: noCache() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro inesperado" },
      { status: 500, headers: noCache() }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id");
    let restorePoints = true;

    // também aceita body
    try {
      const body = await req.json();
      if (body?.id) id = body.id;
      if (typeof body?.restorePoints === "boolean") restorePoints = body.restorePoints;
    } catch {}

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID é obrigatório." },
        { status: 400, headers: noCache() }
      );
    }

    const vendas = await readJson<VendaRecord[]>(VENDAS_FILE, []);
    const idx = vendas.findIndex((v) => v.id === id);
    if (idx < 0) {
      return NextResponse.json(
        { ok: false, error: "Venda não encontrada." },
        { status: 404, headers: noCache() }
      );
    }

    const removed = vendas[idx];

    // devolve pontos ao apagar (por erro) — padrão: sim
    if (restorePoints) {
      const { list: cedentes, write } = await loadCedentesFile();
      const saldoField = removed.cia === "latam" ? "latam" : "smiles";

      const creditar = (cedenteId: string, qtd: number) => {
        const i = cedentes.findIndex((c: any) => up(c.identificador) === up(cedenteId));
        if (i < 0) return;
        const antes = Number(cedentes[i][saldoField] || 0);
        cedentes[i][saldoField] = Math.max(0, antes + Number(qtd || 0));
      };

      if (removed.contaEscolhida?.id) {
        creditar(removed.contaEscolhida.id, removed.pontos);
      } else if (Array.isArray(removed.sugestaoCombinacao) && removed.sugestaoCombinacao.length) {
        for (const parte of removed.sugestaoCombinacao) {
          creditar(parte.id, Number(parte.usar || 0));
        }
      }
      await write(cedentes);
    }

    vendas.splice(idx, 1);
    await writeJson(VENDAS_FILE, vendas);
    return NextResponse.json({ ok: true, removedId: id }, { headers: noCache() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro inesperado" },
      { status: 500, headers: noCache() }
    );
  }
}
