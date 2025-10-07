// src/lib/comprasRepo.ts (trecho)
export async function listComprasIds(): Promise<string[]> {
  // Se já tiver DB, troque por um SELECT só dos IDs.
  const all = await listComprasRaw(); // você já tem este
  return (all || []).map((r: any) => String(r?.id || "")).filter(Boolean);
}

// Gera próximo ID sequencial zero-padded (0001, 0002, ...)
export async function nextShortId(): Promise<string> {
  const ids = await listComprasIds();
  let max = 0;

  for (const id of ids) {
    // aceita 0001 / 1 / C-0001 etc.
    const m = String(id).match(/(\d+)\s*$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }

  const next = max + 1;
  // 4 dígitos com zero à esquerda; ajuste para 5/6 se quiser crescer mais
  return next.toString().padStart(4, "0");
}
