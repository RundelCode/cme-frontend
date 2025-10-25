import { NextResponse } from "next/server";

const COOKIE_NAMES = ["session", "access_token", "id_token", "jwt", "cme_session"];

function isLocalhost(host?: string | null) {
  return !host || host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function clearCookie(res: NextResponse, name: string, host?: string | null) {
  res.cookies.set(name, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: !isLocalhost(host),
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });
  const host = new URL(request.url).host;

  for (const name of COOKIE_NAMES) clearCookie(res, name, host);
  return res;
}

export async function GET(request: Request) {
  return POST(request);
}
