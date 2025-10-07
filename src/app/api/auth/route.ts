// app/api/auth/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

export const runtime = "nodejs";

const TEAM = "@vias_aereas";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string) => (s || "").trim().toLowerCase();

const SEED_USERS: Array<{
  login: string; name: string; email: string | null; role: Role; password: string;
}> = [
  { login: "jephesson", name: "Jephesson Alex Floriano dos Santos", email: "jephesson@gmail.com", role: Role.admin, password: "ufpb2010" },
  { login: "lucas",     name: "Lucas Henrique Floriano de Araújo",  email: "luucasaraujo97@gmail.com", role: Role.staff,  password: "1234" },
  { login: "paola",     name: "Paola Rampelotto Ziani",             email: "paolaziani5@gmail.com",    role: Role.staff,  password: "1234" },
  { login: "eduarda",   name: "Eduarda Vargas de Freitas",          email: "eduarda.jeph@gmail.com",   role: Role.staff,  password: "1234" },
];

function setSessionCookie(res: NextResponse, session: any) {
  res.cookies.set("tm.session", encodeURIComponent(JSON.stringify(session)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  });
}

export async function GET() {
  // ping simples
  return NextResponse.json({ ok: true });
}

/** Body aceito:
 *  { action: "login", login, password }
 *  { action: "setPassword", login, password }
 *  { action: "resetSeed" }
 *  { action: "logout" }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ===== LOGIN =====
    if (body?.action === "login") {
      const login = norm(String(body.login ?? ""));
      const password = String(body.password ?? "");
      if (!login || !password) {
        return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
      }

      const user = await prisma.user.findUnique({ where: { login } });
      if (!user) return NextResponse.json({ ok: false, error: "usuário não encontrado" }, { status: 401 });
      if (user.passwordHash !== sha256(password)) {
        return NextResponse.json({ ok: false, error: "senha inválida" }, { status: 401 });
      }

      const session = {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email ?? null,
        team: user.team,
        role: user.role,
      };

      const res = NextResponse.json({ ok: true, data: { session } });
      setSessionCookie(res, session);
      return res;
    }

    // ===== SET PASSWORD =====
    if (body?.action === "setPassword") {
      const login = norm(String(body.login ?? ""));
      const password = String(body.password ?? "");
      if (!login || !password) {
        return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
      }

      await prisma.user.update({
        where: { login },
        data: { passwordHash: sha256(password) },
      });

      return NextResponse.json({ ok: true });
    }

    // ===== RESET SEED (popular/repopular usuários) =====
    if (body?.action === "resetSeed") {
      for (const u of SEED_USERS) {
        await prisma.user.upsert({
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
        });
      }
      return NextResponse.json({ ok: true });
    }

    // ===== LOGOUT =====
    if (body?.action === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.set("tm.session", "", { path: "/", maxAge: 0 });
      return res;
    }

    return NextResponse.json({ ok: false, error: "ação inválida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "erro ao processar" }, { status: 500 });
  }
}
