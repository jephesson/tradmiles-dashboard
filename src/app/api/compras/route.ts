// src/app/api/compras/route.ts
import { NextResponse } from "next/server";
import {
  listComprasRaw,
  findCompraById,
  upsertCompra,
  updateCompraById,
  deleteCompraById,
} from "@/lib/comprasRepo";

/** ---------------- Helpers ---------------- */
type CIA = "latam" | "smiles";
type Origem = "livelo" | "esfera";
type Status = "aguardando" | "liberados";

function toMoney(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** ---------------- Totais (compat) ---------------- */
/** Lê tanto totalCIA quanto pontosCIA (nome usado na tela nova) */
function totalsCompatFromTotais(totais: any | undefined) {
  const totalPtsRaw = Number((totais?.totalCIA ?? totais?.pontosCIA) || 0);
  const totalPts = Math.round(totalPtsRaw);
  const custoTotal = toMoney(totais?.custoTotal || 0);
  const custoMilheiro =
    Number(totais?.custoMilheiroTotal) && Number(totais?.custoMilheiroTotal) > 0
      ? Number(totais?.custoMilheiroTotal)
      : totalPts > 0
      ? custoTotal / (totalPts / 1000)
      : 0;
  const lucroTotal = toMoney(totais?.lucroTotal || 0);
  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** quando vier no formato antigo (com resumo dentro de itens) */
function totalsFromItemsResumo(itens: any[]) {
  const totalPts = itens.reduce((s, i) => s + (i?.resumo?.totalPts || 0), 0);
  const custoTotal = itens.reduce((s, i) => s + (i?.resumo?.custoTotal || 0), 0);
  const pesoAcum = itens.reduce(
    (acc, i) => {
      const milheiros = (i?.resumo?.totalPts || 0) / 1000;
      if (milheiros > 0) {
        acc.peso += milheiros;
        acc.acum += (i?.resumo?.custoTotal || 0) / milheiros;
      }
      return acc;
    },
    { peso: 0, acum: 0 }
  );
  const custoMilheiro = pesoAcum.peso > 0 ? pesoAcum.acum / pesoAcum.peso : 0;
  const lucroTotal = itens.reduce((s, i) => s + (i?.resumo?.lucroTotal || 0), 0);
  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** novo formato: soma por kind aplicando bônus e custos corretos */
function totalsFromItemsData(itens: any[]) {
  let totalPts = 0;
  let custoTotal = 0;

  for (const it of itens || []) {
    const kind = it?.kind;
    const d = it?.data || {};

    if (kind === "transferencia") {
      const base =
        (d?.modo === "pontos+dinheiro" ? Number(d?.pontosTotais) : Number(d?.pontosUsados)) || 0;
      const bonus = Number(d?.bonusPct) || 0;
      const chegam = Math.round(base * (1 + bonus / 100));
      totalPts += Math.max(0, chegam);
      custoTotal += toMoney(d?.valorPago || 0);
      continue;
    }

    if (kind === "compra") {
      const programa = String(d?.programa || "");
      const ptsBase = Number(d?.pontos) || 0;
      const bonus = Number(d?.bonusPct) || 0;
      if (programa === "latam" || programa === "smiles") {
        totalPts += Math.round(ptsBase * (1 + bonus / 100));
      }
      custoTotal += toMoney(d?.valor || 0);
      continue;
    }

    if (kind === "clube") {
      const programa = String(d?.programa || "");
      const pts = Number(d?.pontos) || 0;
      if (programa === "latam" || programa === "smiles") {
        totalPts += Math.max(0, pts);
      }
      custoTotal += toMoney(d?.valor || 0);
      continue;
    }

    // Fallbacks genéricos
    const ptsCandidates = [
      d?.chegam,
      d?.chegamPts,
      d?.totalCIA,
      d?.pontosCIA,
      d?.total_destino,
      d?.total,
      d?.quantidade,
      d?.pontosTotais,
      d?.pontosUsados,
      d?.pontos,
    ];
    const custoCandidates = [
      d?.custoTotal,
      d?.valor,
      d?.valorPago,
      d?.precoTotal,
      d?.preco,
      d?.custo,
    ];

    const pts = Number(ptsCandidates.find((v) => Number(v) > 0) || 0);
    const custo = toMoney(custoCandidates.find((v) => Number(v) > 0) || 0);

    const ptsAlt = Number(it?.totais?.totalCIA || it?.totais?.pontosCIA || it?.totais?.cia || 0);
    const custoAlt = toMoney(it?.totais?.custoTotal || 0);

    totalPts += pts > 0 ? pts : ptsAlt;
    custoTotal += custo > 0 ? custo : custoAlt;

    if (!(pts > 0 || ptsAlt > 0) && it?.resumo?.totalPts) totalPts += Number(it.resumo.totalPts || 0);
    if (!(custo > 0 || custoAlt > 0) && it?.resumo?.custoTotal) custoTotal += Number(it.resumo.custoTotal || 0);
  }

  const custoMilheiro = totalPts > 0 ? custoTotal / (totalPts / 1000) : 0;
  const lucroTotal =
    itens.reduce((s, i) => s + (toMoney(i?.resumo?.lucroTotal) || 0), 0) || 0;

  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** escolhe automaticamente o melhor jeito de consolidar totais */
function smartTotals(itens: any[], totais?: any) {
  if (totais && (totais.totalCIA || totais.pontosCIA || totais.custoTotal || totais.custoMilheiroTotal)) {
    return totalsCompatFromTotais(totais);
  }
  const hasResumo = (itens || []).some((i) => i?.resumo);
  if (hasResumo) return totalsFromItemsResumo(itens);
  return totalsFromItemsData(itens);
}

/** -------- Normalizações (compat) -------- */
function normalizeFromOldShape(body: any) {
  const modo: "compra" | "transferencia" =
    body.modo || (body.origem ? "transferencia" : "compra");

  const resumo = {
    totalPts: Number(body?.calculos?.totalPts || 0),
    custoMilheiro: Number(body?.calculos?.custoMilheiro || 0),
    custoTotal: Number(body?.calculos?.custoTotal || 0),
    lucroTotal: Number(body?.calculos?.lucroTotal || 0),
  };

  const valores = body.valores || {
    ciaCompra: body.ciaCompra,
    destCia: body.destCia,
    origem: body.origem,
  };

  const itens = [{ idx: 1, modo, resumo, valores }];
  const totaisId = { ...resumo };

  const compat = {
    modo,
    ciaCompra: modo === "compra" ? valores?.ciaCompra ?? null : null,
    destCia: modo === "transferencia" ? valores?.destCia ?? null : null,
    origem: modo === "transferencia" ? valores?.origem ?? null : null,
  };

  const totais = {
    totalCIA: resumo.totalPts,
    custoTotal: resumo.custoTotal,
    custoMilheiroTotal: resumo.custoMilheiro,
    lucroTotal: resumo.lucroTotal,
  };

  return { itens, totaisId, totais, compat };
}

function normalizeFromNewShape(body: any) {
  const itens: any[] = Array.isArray(body.itens) ? body.itens : [];
  const totals = smartTotals(itens, body.totais);

  // compat para listagem/filtros antigos
  let modo: "compra" | "transferencia" | null = null;
  const kinds = new Set((itens || []).map((it: any) => it?.modo || it?.kind));
  if (kinds.size === 1) {
    const k = [...kinds][0];
    if (k === "compra" || k === "transferencia") modo = k;
  }

  let ciaCompra: CIA | null = null;
  let destCia: CIA | null = null;
  let origem: Origem | null = null;

  const firstCompra = (itens || []).find((x: any) => x.kind === "compra" || x.modo === "compra");
  const firstTransf = (itens || []).find((x: any) => x.kind === "transferencia" || x.modo === "transferencia");

  if (firstCompra?.data?.programa) {
    const p = firstCompra.data.programa;
    if (p === "latam" || p === "smiles") ciaCompra = p;
  }
  if (firstTransf?.data) {
    const d = firstTransf.data.destino;
    const o = firstTransf.data.origem;
    if (d === "latam" || d === "smiles") destCia = d;
    if (o === "livelo" || o === "esfera") origem = o;
  }

  const totaisId = {
    totalPts: totals.totalPts,
    custoTotal: totals.custoTotal,
    custoMilheiro: totals.custoMilheiro,
    lucroTotal: totals.lucroTotal,
  };

  const compat = { modo, ciaCompra, destCia, origem };

  const totais = {
    totalCIA: totals.totalPts,
    custoTotal: totals.custoTotal,
    custoMilheiroTotal: totals.custoMilheiro,
    lucroTotal: totals.lucroTotal,
  };

  return { itens, totaisId, totais, compat };
}

/** ===================== GET ===================== */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // /api/compras?id=0001 -> retorna DOC (com totais preenchidos)
  if (id) {
    const item = await findCompraById(id);
    if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    if (!item.totais || !Number(item.totais.totalCIA ?? item.totais.pontosCIA)) {
      const totals = smartTotals(item.itens || [], item.totais);
      item.totais = {
        totalCIA: totals.totalPts,
        custoTotal: totals.custoTotal,
        custoMilheiroTotal: totals.custoMilheiro,
        lucroTotal: totals.lucroTotal,
      };
      item.totaisId = {
        totalPts: totals.totalPts,
        custoTotal: totals.custoTotal,
        custoMilheiro: totals.custoMilheiro,
        lucroTotal: totals.lucroTotal,
      };
      item.calculos = { ...item.totaisId };
    }
    return NextResponse.json(item);
  }

  // listagem + filtros
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const modoFil = url.searchParams.get("modo") || "";
  const ciaFil = url.searchParams.get("cia") || "";
  const origemFil = url.searchParams.get("origem") || "";
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || "";
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const all = await listComprasRaw();

  const firstModo = (r: any) =>
    r.modo || r.itens?.[0]?.modo || r.itens?.[0]?.kind || "";

  const rowCIA = (r: any) => {
    const m = r.modo || r.itens?.[0]?.modo || r.itens?.[0]?.kind;
    if (m === "compra")
      return r.ciaCompra || r.itens?.[0]?.valores?.ciaCompra || r.itens?.find((x: any)=>x.kind==="compra")?.data?.programa || "";
    if (m === "transferencia")
      return r.destCia || r.itens?.[0]?.valores?.destCia || r.itens?.find((x: any)=>x.kind==="transferencia")?.data?.destino || "";
    return "";
  };

  const rowOrigem = (r: any) =>
    r.origem ||
    r.itens?.[0]?.valores?.origem ||
    r.itens?.find((x: any)=>x.kind==="transferencia")?.data?.origem ||
    "";

  // Normaliza totais por linha (aceitando pontosCIA)
  const normalized = (all || []).map((r: any) => {
    const hasPts = Number(r?.totais?.totalCIA ?? r?.totais?.pontosCIA) > 0;
    if (!hasPts) {
      const totals = smartTotals(r.itens || [], r.totais);
      r = {
        ...r,
        totais: {
          totalCIA: totals.totalPts,
          custoTotal: totals.custoTotal,
          custoMilheiroTotal: totals.custoMilheiro,
          lucroTotal: totals.lucroTotal,
        },
        totaisId: {
          totalPts: totals.totalPts,
          custoTotal: totals.custoTotal,
          custoMilheiro: totals.custoMilheiro,
          lucroTotal: totals.lucroTotal,
        },
        calculos: {
          totalPts: totals.totalPts,
          custoTotal: totals.custoTotal,
          custoMilheiro: totals.custoMilheiro,
          lucroTotal: totals.lucroTotal,
        },
      };
    } else if (r?.totais?.pontosCIA && !r?.totais?.totalCIA) {
      // se vieram só pontosCIA, espelha para totalCIA
      r = { ...r, totais: { ...r.totais, totalCIA: Number(r.totais.pontosCIA) } };
    }
    return r;
  });

  let rows = normalized.slice();

  if (q) {
    rows = rows.filter(
      (r) =>
        String(r.id).toLowerCase().includes(q) ||
        String(r.cedenteId || "").toLowerCase().includes(q) ||
        String(r.cedenteNome || "").toLowerCase().includes(q)
    );
  }
  if (modoFil) rows = rows.filter((r) => firstModo(r) === modoFil);
  if (ciaFil) rows = rows.filter((r) => rowCIA(r) === ciaFil);
  if (origemFil) rows = rows.filter((r) => rowOrigem(r) === origemFil);
  if (start) rows = rows.filter((r) => String(r.dataCompra) >= start);
  if (end) rows = rows.filter((r) => String(r.dataCompra) <= end);

  rows.sort((a: any, b: any) =>
    a.dataCompra < b.dataCompra
      ? 1
      : a.dataCompra > b.dataCompra
      ? -1
      : String(a.id).localeCompare(String(b.id))
  );

  const total = rows.length;
  const items = rows.slice(offset, offset + limit);

  return NextResponse.json({ ok: true, total, items });
}

/** ===================== POST (upsert) ===================== */
export async function POST(req: Request) {
  const body = await req.json();

  const id = String(body.id);
  const dataCompra = body.dataCompra || "";
  const statusPontos: Status = body.statusPontos || "aguardando";
  const cedenteId = body.cedenteId || "";
  const cedenteNome = body.cedenteNome || "";

  const { itens, totaisId, totais, compat } = Array.isArray(body.itens)
    ? normalizeFromNewShape(body)
    : normalizeFromOldShape(body);

  const row = {
    id,
    dataCompra,
    statusPontos,
    cedenteId,
    cedenteNome,

    // novo modelo
    itens,
    totais, // salva no novo padrão

    // compat p/ listagem antiga
    totaisId,
    modo: compat.modo || undefined,
    ciaCompra: compat.ciaCompra || undefined,
    destCia: compat.destCia || undefined,
    origem: compat.origem || undefined,
    calculos: { ...totaisId },

    metaMilheiro: body.metaMilheiro ?? undefined,
    comissaoCedente: body.comissaoCedente ?? undefined,

    savedAt: Date.now(),
  };

  await upsertCompra(row);
  return NextResponse.json({ ok: true, id: row.id });
}

/** ===================== PATCH (?id=) ===================== */
export async function PATCH(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch = await req.json().catch(() => ({}));
  const apply: any = { ...patch };

  // Se vierem itens e não vier `totais`, gere compat/novos; se vier `totais`, gere totaisId/calculos.
  if (Array.isArray(apply.itens) && !apply.totais && !apply.totaisId) {
    const smart = smartTotals(apply.itens);
    apply.totaisId = {
      totalPts: smart.totalPts,
      custoTotal: smart.custoTotal,
      custoMilheiro: smart.custoMilheiro,
      lucroTotal: smart.lucroTotal,
    };
    apply.calculos = { ...apply.totaisId };
    apply.totais = {
      totalCIA: smart.totalPts,
      custoTotal: smart.custoTotal,
      custoMilheiroTotal: smart.custoMilheiro,
      lucroTotal: smart.lucroTotal,
    };
  }
  if (apply.totais && !apply.totaisId) {
    const compatTot = totalsCompatFromTotais(apply.totais);
    apply.totaisId = { ...compatTot };
    apply.calculos = { ...compatTot };
  }

  // Mantém campos compat para a listagem
  const first = Array.isArray(apply.itens) ? apply.itens[0] : undefined;
  if (first) {
    const modo = first.modo || first.kind;
    apply.modo = modo;
    if (modo === "compra") {
      apply.ciaCompra =
        first?.valores?.ciaCompra ?? first?.data?.programa ?? null;
      apply.destCia = null;
      apply.origem = null;
    } else if (modo === "transferencia") {
      apply.ciaCompra = null;
      apply.destCia = first?.valores?.destCia ?? first?.data?.destino ?? null;
      apply.origem = first?.valores?.origem ?? first?.data?.origem ?? null;
    }
  }

  try {
    const updated = await updateCompraById(id, apply);
    return NextResponse.json(updated);
  } catch (e: any) {
    const msg = e?.message || "Erro ao atualizar";
    const code = /não encontrado/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

/** ===================== DELETE (?id=) ===================== */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    await deleteCompraById(id);
    return NextResponse.json({ ok: true, deleted: id });
  } catch (e: any) {
    const msg = e?.message || "Erro ao excluir";
    const code = /não encontrado/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
