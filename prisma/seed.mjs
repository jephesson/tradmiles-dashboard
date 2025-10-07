import { PrismaClient, Role } from "@prisma/client";
import crypto from "node:crypto";
const prisma = new PrismaClient();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function main() {
  const TEAM = "@vias_aereas";
  const users = [
    { login: "jephesson", name: "Jephesson Alex Floriano dos Santos", email: "jephesson@gmail.com", role: Role.admin, password: "ufpb2010" },
    { login: "lucas",     name: "Lucas Henrique Floriano de Araújo",  email: "luucasaraujo97@gmail.com", role: Role.staff,  password: "1234" },
    { login: "paola",     name: "Paola Rampelotto Ziani",             email: "paolaziani5@gmail.com",    role: Role.staff,  password: "1234" },
    { login: "eduarda",   name: "Eduarda Vargas de Freitas",          email: "eduarda.jeph@gmail.com",   role: Role.staff,  password: "1234" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { login: u.login },
      update: { name: u.name, email: u.email, team: TEAM, role: u.role, passwordHash: sha256(u.password) },
      create: { login: u.login, name: u.name, email: u.email, team: TEAM, role: u.role, passwordHash: sha256(u.password) },
    });
  }
  console.log("Seed ok ✅");
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
