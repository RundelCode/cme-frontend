import { NextResponse } from "next/server";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveApiUrl() {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  try {
    new URL(base);
    return base.replace(/\/+$/, "");
  } catch {
    return "http://localhost:3000/api";
  }
}

function mask(v?: string | null) {
  if (!v) return null;
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "..." + v.slice(-4);
}

function pickBearer(cookieStore: Awaited<ReturnType<typeof nextCookies>>) {
  const access = cookieStore.get("access_token")?.value || null;
  if (access && access.trim() !== "") return { header: `Bearer ${access}`, source: "access_token" };
  const sb = cookieStore.get("sb-access-token")?.value || null;
  if (sb && sb.trim() !== "") return { header: `Bearer ${sb}`, source: "sb-access-token" };
  const packed = cookieStore.get("supabase-auth-token")?.value || null;
  if (packed) {
    try {
      const parsed = JSON.parse(packed);
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
        return { header: `Bearer ${parsed[0]}`, source: "supabase-auth-token[0]" };
      }
      if (parsed && typeof parsed === "object" && typeof (parsed as any).access_token === "string") {
        return { header: `Bearer ${(parsed as any).access_token}`, source: "supabase-auth-token.access_token" };
      }
    } catch { }
  }
  return { header: undefined as string | undefined, source: "none" };
}

export async function GET() {
  const dbg: Record<string, any> = {};
  try {
    const API = resolveApiUrl();
    const hdrs = await nextHeaders();
    const cookieStore = await nextCookies();
    const allCookies = cookieStore.getAll().map(c => c.name);
    const picked = pickBearer(cookieStore);

    dbg.route = "GET /api/auth/me";
    dbg.api = API;
    dbg.cookies = allCookies;
    dbg.token_source = picked.source;
    dbg.token_mask = mask(picked.header?.replace(/^Bearer\s+/i, ""));

    console.log("[auth/me] in", dbg);

    const upstream = await fetch(`${API}/auth/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(picked.header ? { Authorization: picked.header } : {}),
        "x-correlation-id": hdrs.get("x-correlation-id") || "",
      },
      cache: "no-store",
      credentials: "omit",
    });

    const raw = await upstream.text();
    dbg.upstream_status = upstream.status;
    dbg.upstream_url = `${API}/auth/me`;
    dbg.upstream_body_snippet = raw?.slice(0, 300);

    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      console.error("[auth/me] parse_error", dbg);
      return NextResponse.json(
        { id: null, role: null, user: null, error: "upstream_not_json", debug: dbg },
        { status: 200 }
      );
    }

    if (!upstream.ok) {
      const msg = data?.error || data?.message || `auth_me_upstream_${upstream.status}`;
      console.error("[auth/me] upstream_not_ok", { ...dbg, msg });
      const res = NextResponse.json({ id: null, role: null, user: null, error: msg, debug: dbg }, { status: 200 });
      res.headers.set("Vary", "Cookie, Authorization");
      return res;
    }

    const id = data?.id ?? data?.user?.id ?? null;
    const role = data?.role ?? data?.user?.role ?? null;
    const user = data ?? null;

    dbg.resolved_id = id;
    dbg.resolved_role = role;

    console.log("[auth/me] ok", dbg);

    const res = NextResponse.json({ id, role, user, debug: dbg }, { status: 200 });
    res.headers.set("Vary", "Cookie, Authorization");
    return res;
  } catch (e: any) {
    console.error("[auth/me] fatal", { error: e?.message, ...dbg });
    return NextResponse.json({ id: null, role: null, user: null, error: "internal_error", debug: dbg }, { status: 200 });
  }
}
