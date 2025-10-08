// src/types.ts

/* ================== Tipos básicos e utilitários ================== */

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [k: string]: Json };

export type AnyObj = Record<string, unknown>;
export type UnknownRecord = AnyObj;
export type Nullish = null | undefined;

/** Array não-vazio */
export type NonEmptyArray<T> = [T, ...T[]];

/** Resultado seguro (útil para validadores/parsers) */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/* ================== Type Guards / Predicados ================== */

export function isRecord(v: unknown): v is AnyObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

export function defined<T>(v: T | Nullish): v is T {
  return v !== null && v !== undefined;
}

/* ================== Normalizadores / Converters ================== */

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  }
  if (typeof v === "number") return v !== 0;
  return false;
}

/** Converte valores monetários para number (mantém 2 casas se vier string) */
export function toMoney(v: unknown): number {
  if (typeof v === "string") {
    // aceita "1.234,56" ou "1234.56"
    const normalized = v
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

/** Garante array (copia tipada se já for) */
export function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Cast seguro para objeto, se for objeto */
export function asObject<T extends AnyObj = AnyObj>(v: unknown): T | undefined {
  return isRecord(v) ? (v as T) : undefined;
}

/* ================== Helpers genéricos ================== */

export function pick<T extends AnyObj, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** Lê propriedade com fallback e normalizador (evita `as any`) */
export function read<T>(
  obj: unknown,
  key: string,
  normalize: (v: unknown) => T,
  fallback: T,
): T {
  if (!isRecord(obj)) return fallback;
  return normalize((obj as AnyObj)[key]);
}

/** Soma segura (ignora NaN) */
export function sum(nums: Iterable<unknown>): number {
  let s = 0;
  for (const n of nums) {
    const v = Number(n);
    if (Number.isFinite(v)) s += v;
  }
  return s;
}

/* ================== Domínios comuns do projeto (opcional) ================== */
/** Use se precisar padronizar enums em vários arquivos */
export type CIA = "latam" | "smiles";
export type Origem = "livelo" | "esfera";
export type Status = "aguardando" | "liberados";
