// src/lib/auth.ts
"use client";

/** Sessão persistida no navegador */
export type Session = {
  id: string;
  name: string;
  login: string;
  email?: string | null;
  team: string;
  role: "admin" | "staff";
};

const AUTH_SESSION_KEY = "auth_session";

/* =============== Helpers =============== */
function normTeam(s: string) {
  const v = (s || "").trim();
  if (!v) return "";
  const withAt = v.startsWith("@") ? v : `@${v}`;
  return withAt.toLowerCase();
}

/* =============== Sessão local =============== */
export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.id || !s?.login || !s?.team) return null;
    return s as Session;
  } catch {
    return null;
  }
}

export function signOut() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

/* =============== API (servidor) =============== */
/** Garante que o arquivo data/auth.json exista (e cria seed se não existir) */
export async function ensureSeedCredentials(): Promise<void> {
  await fetch("/api/auth", { method: "GET" }).catch(() => {});
}

/** Restaura as credenciais de seed (jephesson/ufpb2010; demais/1234) */
export async function resetCredentialsToSeed(): Promise<boolean> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resetSeed" }),
  });
  return res.ok;
}

/** Define/atualiza a senha de um login */
export async function setPassword(login: string, newPassword: string): Promise<boolean> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setPassword", login, password: newPassword }),
  });
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error || "Falha ao salvar senha");
  return true;
}

/** Faz login no servidor e salva a sessão no localStorage */
export async function signIn(params: {
  team: string;
  login: string;
  password: string;
}): Promise<boolean> {
  const payload = {
    action: "login",
    team: normTeam(params.team),
    login: params.login,
    password: params.password,
  };

  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!json?.ok) return false;

  const session: Session | undefined = json.data?.session;
  if (!session) return false;

  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return true;
}
