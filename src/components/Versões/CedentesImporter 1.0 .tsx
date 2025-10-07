'use client';
import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

/* =========================
   Utils
========================= */
function stripDiacritics(str: string) {
  return str
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function toTitleCase(str: string) {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
function keyName(str: string) {
  return stripDiacritics(str).toLowerCase().replace(/\s+/g, " ").trim();
}

// Levenshtein (match aproximado opcional)
function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
    }
  }
  return dp[m][n];
}
function similarity(a: string, b: string) {
  const s1 = keyName(a), s2 = keyName(b);
  if (!s1 || !s2) return 0;
  const dist = levenshtein(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - dist / maxLen;
}
function makeIdentifier(name: string, index: number) {
  const cleaned = stripDiacritics(name).toUpperCase();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const base = (tokens[0] || "CED").replace(/[^A-Z0-9]/g, "");
  const prefix = (base.slice(0, 3) || "CED").padEnd(3, "X");
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}
function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function parsePoints(input: any): number {
  if (input === null || input === undefined) return 0;
  const s = String(input).trim();
  if (!s) return 0;
  // remove tudo que não é dígito
  const onlyDigits = s.replace(/[^\d]/g, "");
  return onlyDigits ? Number(onlyDigits) : 0;
}

/* =========================
   Tipos
========================= */
type SheetData = { name: string; rows: any[][] };
type Cedente = {
  identificador: string;
  nome_completo: string;
  latam: number;
  esfera: number;
  livelo: number;
  smiles: number;
};
type ProgramKey = "latam" | "esfera" | "livelo" | "smiles";
type ProgramConfig = {
  key: ProgramKey;
  label: string;
  sheet: string;       // aba onde estão os pontos desse programa
  colName: string;     // coluna com o NOME nessa aba
  colPoints: string;   // coluna com os PONTOS nessa aba
  stats: { matched: number; notFound: number };
};

/* =========================
   Componente
========================= */
export default function CedentesImporter() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Arquivo/Abas
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [namesSheet, setNamesSheet] = useState<string>(""); // aba de Nomes (etapa 1)

  // Etapa 1 — Nomes
  const [colNome, setColNome] = useState("A");
  const [threshold, setThreshold] = useState(0.9);
  const [dedupedNames, setDedupedNames] = useState<string[]>([]);
  const [listaCedentes, setListaCedentes] = useState<Cedente[]>([]);

  // Etapa 2 — Pontos por programa
  const [approximate, setApproximate] = useState(false); // match aproximado opcional
  const [programs, setPrograms] = useState<ProgramConfig[]>([
    { key: "latam",  label: "Latam",  sheet: "", colName: "", colPoints: "", stats: { matched:0, notFound:0 } },
    { key: "esfera", label: "Esfera", sheet: "", colName: "", colPoints: "", stats: { matched:0, notFound:0 } },
    { key: "livelo", label: "Livelo", sheet: "", colName: "", colPoints: "", stats: { matched:0, notFound:0 } },
    { key: "smiles", label: "Smiles", sheet: "", colName: "", colPoints: "", stats: { matched:0, notFound:0 } },
  ]);

  /* ---------- Helpers de coluna ---------- */
  function colLetterToIndex(col: string) {
    let idx = 0;
    for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
    return idx - 1;
  }
  function indexToColLetter(idx: number) {
    let s = ""; idx += 1;
    while (idx > 0) { const rem = (idx - 1) % 26; s = String.fromCharCode(65 + rem) + s; idx = Math.floor((idx - 1) / 26); }
    return s;
  }

  /* ---------- Abrir arquivo ---------- */
  function parseWorkbook(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const parsed: SheetData[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];
        return { name, rows };
      });
      setSheets(parsed);

      const first = parsed[0]?.name || "";
      setNamesSheet(first);
      setColNome("A");
      setDedupedNames([]);
      setListaCedentes([]);

      // por padrão, cada programa começa usando a primeira aba (você troca depois)
      setPrograms((prev) =>
        prev.map(p => ({ ...p, sheet: first, colName: "", colPoints: "", stats: {matched:0, notFound:0} }))
      );
    };
    reader.readAsArrayBuffer(file);
  }
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) parseWorkbook(f);
  }

  /* ---------- Options de colunas para a aba atual ---------- */
  const namesSheetObj = useMemo(() => sheets.find(s => s.name === namesSheet), [sheets, namesSheet]);
  const availableColumnsOnNames = useMemo(() => {
    if (!namesSheetObj) return ["A"];
    const maxLen = Math.max(...namesSheetObj.rows.slice(0, 32).map(r => r.length), 1);
    return Array.from({length:maxLen}, (_,i)=>indexToColLetter(i));
  }, [namesSheetObj]);

  function availableColumnsOn(sheetName: string) {
    const sh = sheets.find(s => s.name === sheetName);
    if (!sh) return ["A"];
    const maxLen = Math.max(...sh.rows.slice(0, 32).map(r => r.length), 1);
    return Array.from({length:maxLen}, (_,i)=>indexToColLetter(i));
  }

  const firstRowsPreview = useMemo(() => {
    if (!namesSheetObj) return [] as string[];
    const idx = colLetterToIndex(colNome);
    return namesSheetObj.rows.slice(0, 8).map(r => (r[idx] ?? "") as string);
  }, [namesSheetObj, colNome]);

  /* ---------- Etapa 1: processar nomes ---------- */
  function processNames() {
    if (!namesSheetObj) return;

    const idx = colLetterToIndex(colNome);
    const names: string[] = [];
    for (const row of namesSheetObj.rows) {
      const cell = row[idx];
      if (typeof cell === "string" && cell.trim()) names.push(toTitleCase(cell.trim()));
    }

    const cleaned = names.map(n => toTitleCase(stripDiacritics(n))).filter(n => n && n.length > 1);
    const unique = Array.from(new Set(cleaned));
    const deduped: string[] = [];
    for (const name of unique) {
      const isDup = deduped.some(n => similarity(n, name) >= threshold);
      if (!isDup) deduped.push(name);
    }
    deduped.sort((a, b) => a.localeCompare(b, "pt-BR"));
    setDedupedNames(deduped);

    const base: Cedente[] = deduped.map((n, i) => ({
      identificador: makeIdentifier(n, i),
      nome_completo: toTitleCase(n),
      latam: 0, esfera: 0, livelo: 0, smiles: 0,
    }));
    setListaCedentes(base);
    // zera contadores
    setPrograms(prev => prev.map(p => ({...p, stats: {matched:0, notFound:0}})));
  }

  /* ---------- Etapa 2: aplicar pontos (um programa por vez) ---------- */
  function applyPointsForProgram(p: ProgramConfig) {
    const sheetObj = sheets.find(s => s.name === p.sheet);
    if (!sheetObj || !p.colName || !p.colPoints) return;

    const nameIdx   = colLetterToIndex(p.colName);
    const pointsIdx = colLetterToIndex(p.colPoints);

    // Mapa por nome normalizado
    const mapExact = new Map<string, number>();
    const namesInSheet: Array<{orig:string; key:string}> = [];

    for (const row of sheetObj.rows) {
      const n = row[nameIdx];
      if (typeof n !== "string" || !n.trim()) continue;
      const key = keyName(n);
      namesInSheet.push({orig: n, key});

      const pts = parsePoints(row[pointsIdx]);
      // se houver repetidos, soma (ou troca para "maior" se preferir)
      mapExact.set(key, (mapExact.get(key) ?? 0) + pts);
    }

    let matched = 0, notFound = 0;
    const updated = listaCedentes.map((c) => {
      const k = keyName(c.nome_completo);
      let val = mapExact.get(k);

      if (val == null && approximate && namesInSheet.length) {
        let best: {idx:number; score:number} | null = null;
        for (let i=0;i<namesInSheet.length;i++){
          const cand = namesInSheet[i];
          const sc = similarity(cand.key, k);
          if (!best || sc > best.score) best = {idx:i, score:sc};
        }
        if (best && best.score >= 0.90) {
          const chosen = namesInSheet[best.idx];
          val = mapExact.get(chosen.key);
        }
      }

      if (val != null) {
        matched++;
        return { ...c, [p.key]: val } as Cedente;
      } else {
        notFound++;
        return c;
      }
    });

    setListaCedentes(updated);
    setPrograms(prev => prev.map(cfg => cfg.key === p.key ? {...cfg, stats:{matched, notFound}} : cfg));
  }

  /* ---------- Export ---------- */
  function exportCSV() {
    if (!listaCedentes.length) return;
    const header = "identificador;nome_completo;latam;esfera;livelo;smiles\n";
    const lines = listaCedentes.map(r =>
      `${r.identificador};${r.nome_completo};${r.latam};${r.esfera};${r.livelo};${r.smiles}`
    );
    download("cedentes_importados.csv", header + lines.join("\n"));
  }
  function exportJSON() {
    if (!listaCedentes.length) return;
    download("cedentes_importados.json", JSON.stringify(listaCedentes, null, 2));
  }

  /* ---------- UI ---------- */
  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="TradeMiles" className="h-12 w-auto" />
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          TradeMiles • Cedentes
        </h1>
      </div>

      <p className="mb-6 text-sm text-slate-600">
        Etapa 1: importe os nomes e gere IDs. Etapa 2: para <b>cada programa</b> (Latam, Esfera, Livelo, Smiles),
        selecione a <b>aba específica</b> desse programa e as colunas de <b>Nome</b> e <b>Pontos</b>.
        O sistema casa os nomes automaticamente, independente da ordem. Opcional: correspondência aproximada (≥ 90%).
      </p>

      {/* Upload */}
      <div className="mb-4 flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Arquivo Excel</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e)=>{ const f=e.target.files?.[0]; if (f) parseWorkbook(f); }}
          style={{ display: "none" }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2"
          >
            Escolher arquivo
          </button>
          <span className="text-sm text-slate-700">
            {fileName || "Nenhum arquivo escolhido"}
          </span>
          <span className="text-xs text-slate-500">Aceita .xlsx ou .xls</span>
        </div>
      </div>

      {/* ETAPA 1 — NOMES */}
      {sheets.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">Etapa 1 — Nomes</h2>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">Aba dos Nomes</label>
              <select
                className="rounded-xl border px-3 py-2"
                value={namesSheet}
                onChange={(e) => setNamesSheet(e.target.value)}
              >
                {sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">Coluna com os Nomes</label>
              <select
                className="rounded-xl border px-3 py-2"
                value={colNome}
                onChange={(e) => setColNome(e.target.value)}
              >
                {availableColumnsOnNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">Similaridade (≥) p/ deduplicar nomes</label>
              <input
                type="range" min={0.7} max={0.98} step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
              />
              <div className="text-xs text-slate-600">{Math.round(threshold * 100)}%</div>
            </div>
          </div>

          {firstRowsPreview.length > 0 && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="mb-2 font-medium">Prévia (primeiras linhas da coluna de nomes)</div>
              <ul className="list-disc space-y-1 pl-6">
                {firstRowsPreview.map((v, i) => (
                  <li key={i} className="text-slate-700">
                    {v || <span className="text-slate-400">(vazio)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={processNames}
            className="mb-6 rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800"
          >
            Processar nomes e gerar IDs
          </button>
        </>
      )}

      {/* ETAPA 2 — PONTOS POR PROGRAMA */}
      {dedupedNames.length > 0 && sheets.length > 0 && (
        <>
          <div className="mt-2 mb-3 flex items-center gap-3">
            <h2 className="text-lg font-semibold">Etapa 2 — Importar Pontos por Programa</h2>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={approximate}
                onChange={(e)=>setApproximate(e.target.checked)}
              />
              Usar correspondência aproximada (≥ 90%)
            </label>
          </div>

          <div className="grid gap-4">
            {programs.map((p, idx) => {
              const cols = availableColumnsOn(p.sheet);
              return (
                <div key={p.key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-base font-medium">{p.label}</div>
                    {(p.stats.matched + p.stats.notFound) > 0 && (
                      <div className="text-xs text-slate-600">
                        Casados: <b>{p.stats.matched}</b> • Não encontrados: <b>{p.stats.notFound}</b>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="flex flex-col">
                      <label className="mb-1 text-xs font-medium text-slate-600">Aba</label>
                      <select
                        className="rounded-xl border px-3 py-2"
                        value={p.sheet}
                        onChange={(e)=>{
                          const v = e.target.value;
                          setPrograms(prev => prev.map((cfg,i)=> i===idx ? {...cfg, sheet:v, colName:"", colPoints:"", stats:{matched:0,notFound:0}} : cfg));
                        }}
                      >
                        {sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="mb-1 text-xs font-medium text-slate-600">Coluna do Nome</label>
                      <select
                        className="rounded-xl border px-3 py-2"
                        value={p.colName}
                        onChange={(e)=>{
                          const v = e.target.value;
                          setPrograms(prev => prev.map((cfg,i)=> i===idx ? {...cfg, colName:v} : cfg));
                        }}
                      >
                        <option value="">Selecione…</option>
                        {cols.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="mb-1 text-xs font-medium text-slate-600">Coluna dos Pontos</label>
                      <select
                        className="rounded-xl border px-3 py-2"
                        value={p.colPoints}
                        onChange={(e)=>{
                          const v = e.target.value;
                          setPrograms(prev => prev.map((cfg,i)=> i===idx ? {...cfg, colPoints:v} : cfg));
                        }}
                      >
                        <option value="">Selecione…</option>
                        {cols.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={()=>applyPointsForProgram(p)}
                        className="rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800 disabled:opacity-50"
                        disabled={!p.sheet || !p.colName || !p.colPoints}
                      >
                        Aplicar {p.label}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Resultado final */}
      {listaCedentes.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Resultado ({listaCedentes.length} cedentes)
            </h2>
            <div className="flex gap-3">
              <button
                onClick={exportCSV}
                className="rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800 disabled:opacity-50"
                disabled={!listaCedentes.length}
              >
                Exportar CSV
              </button>
              <button
                onClick={exportJSON}
                className="rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800 disabled:opacity-50"
                disabled={!listaCedentes.length}
              >
                Exportar JSON
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Nome completo</th>
                  <th className="px-3 py-2 font-medium">Latam</th>
                  <th className="px-3 py-2 font-medium">Esfera</th>
                  <th className="px-3 py-2 font-medium">Livelo</th>
                  <th className="px-3 py-2 font-medium">Smiles</th>
                </tr>
              </thead>
              <tbody>
                {listaCedentes.map((r, idx) => (
                  <tr key={r.identificador} className="border-t border-slate-200">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono">{r.identificador}</td>
                    <td className="px-3 py-2">{toTitleCase(r.nome_completo)}</td>
                    <td className="px-3 py-2">{r.latam.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2">{r.esfera.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2">{r.livelo.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2">{r.smiles.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 text-xs text-slate-500">
        Dica: se um programa estiver com muitos “não encontrados”, confira se a coluna de <b>Nome</b> e a <b>aba</b> estão corretas.
        Se os nomes variam muito, ative a correspondência aproximada.
      </div>
    </div>
  );
}
