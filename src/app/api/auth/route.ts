// app/api/auth/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tipos locais para não depender do @prisma/client durante o build
type Role = "admin" | "staff";

const TEAM = "@vias_aereas";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

type Session = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  team: string;
  role: Role;
};

type ApiLogin = { action: "login"; login: string; password: string };
type ApiSetPassword = { action: "setPassword"; login: string; password: string };
type ApiResetSeed = { action: "resetSeed" };
type ApiLogout = { action: "logout" };
type ApiBody = ApiLogin | ApiSetPassword | ApiResetSeed | ApiLogout;

const SEED_USERS: Array<{
  login: string;
  name: string;
  email: string | null;
  role: Role;
  password: string;
}> = [
  {
    login: "jephesson",
    name: "Jephesson Alex Floriano dos Santos",
    email: "jephesson@gmail.com",
    role: "admin",
    password: "ufpb2010",
  },
  {
    login: "lucas",
    name: "Lucas Henrique Floriano de Araújo",
    email: "luucasaraujo97@gmail.com",
    role: "staff",
    password: "1234",
  },
  {
    login: "paola",
    name: "Paola Rampelotto Ziani",
    email: "paolaziani5@gmail.com",
    role: "staff",
    password: "1234",
  },
  {
    login: "eduarda",
    name: "Eduarda Vargas de Freitas",
    email: "eduarda.jeph@gmail.com",
    role: "staff",
    password: "1234",
  },
];

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function setSessionCookie(res: NextResponse, session: Session) {
  // mantém seu formato atual (URL-encoded JSON) e configurações seguras em prod
  res.cookies.set("tm.session", encodeURIComponent(JSON.stringify(session)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  });
}

function isApiBody(v: unknown): v is ApiBody {
  if (!v || typeof v !== "object") return false;
  const action = (v as { action?: string }).action;
  return action === "login" || action === "setPassword" || action === "resetSeed" || action === "logout";
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true }, { headers: noCache() });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw = await req.json().catch(() => null);
    if (!isApiBody(raw)) {
      return NextResponse.json(
        { ok: false, error: "ação inválida" },
        { status: 400, headers: noCache() }
      );
    }

    // ===== LOGIN =====
    if (raw.action === "login") {
      const login = norm(raw.login);
      const password = String(raw.password ?? "");
      if (!login || !password) {
        return NextResponse.json(
          { ok: false, error: "dados inválidos" },
          { status: 400, headers: noCache() }
        );
        }

      const user = await prisma.user.findUnique({ where: { login } });
      if (!user) {
        return NextResponse.json(
          { ok: false, error: "usuário não encontrado" },
          { status: 401, headers: noCache() }
        );
      }
      if (user.passwordHash !== sha256(password)) {
        return NextResponse.json(
          { ok: false, error: "senha inválida" },
          { status: 401, headers: noCache() }
        );
      }

      const session: Session = {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email ?? null,
        team: user.team,
        role: user.role as Role, // prisma enum compatível
      };

      const res = NextResponse.json({ ok: true, data: { session } }, { headers: noCache() });
      setSessionCookie(res, session);
      return res;
    }

    // ===== SET PASSWORD =====
    if (raw.action === "setPassword") {
      const login = norm(raw.login);
      const password = String(raw.password ?? "");
      if (!login || !password) {
        return NextResponse.json(
          { ok: false, error: "dados inválidos" },
          { status: 400, headers: noCache() }
        );
      }

      const exists = await prisma.user.findUnique({ where: { login } });
      if (!exists) {
        return NextResponse.json(
          { ok: false, error: "usuário não encontrado" },
          { status: 404, headers: noCache() }
        );
      }

      await prisma.user.update({
        where: { login },
        data: { passwordHash: sha256(password) },
      });

      return NextResponse.json({ ok: true }, { headers: noCache() });
    }

    // ===== RESET SEED =====
    if (raw.action === "resetSeed") {
      await prisma.$transaction(
        SEED_USERS.map((u) =>
          prisma.user.upsert({
            where: { login: u.login },
            update: {
              name: u.name,
              email: u.email,
              team: TEAM,
              role: u.role,
              passwordHash: sha256(u.password),
            },
            create: {
              login: u.login,
              name: u.name,
              email: u.email,
              team: TEAM,
              role: u.role,
              passwordHash: sha256(u.password),
            },
          }),
        ),
      );
      return NextResponse.json({ ok: true }, { headers: noCache() });
    }

    // ===== LOGOUT =====
    if (raw.action === "logout") {
      const res = NextResponse.json({ ok: true }, { headers: noCache() });
      res.cookies.set("tm.session", "", { path: "/", maxAge: 0 });
      return res;
    }

    return NextResponse.json(
      { ok: false, error: "ação inválida" },
      { status: 400, headers: noCache() }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro ao processar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}
