// app/api/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;

  let session: any = null;
  try {
    session = raw ? JSON.parse(decodeURIComponent(raw)) : null;
  } catch {}

  return NextResponse.json({
    hasSession: Boolean(session),
    session,
  });
}
