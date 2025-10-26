import { NextRequest, NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest): string | undefined {
  const h = req.headers.get("authorization");
  if (h && h.trim() !== "") return h;
  const token = req.cookies.get("access_token")?.value;
  if (token && token.trim() !== "") return `Bearer ${token}`;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
  return undefined;
}

function resolveApiUrl(req: NextRequest) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
  return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

function extractAccessToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const cookie = req.headers.get("cookie") ?? "";

  const m1 = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/i);
  if (m1?.[1]) return decodeURIComponent(m1[1]);

  const m2 = cookie.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m2?.[1]) return decodeURIComponent(m2[1]);

  const m3 = cookie.match(/(?:^|;\s*)supabase-auth-token=([^;]+)/i);
  if (m3?.[1]) {
    try {
      const val = decodeURIComponent(m3[1]);
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
        return parsed[0];
      }
      if (parsed && typeof parsed === "object" && typeof (parsed as any).access_token === "string") {
        return (parsed as any).access_token as string;
      }
    } catch {}
  }
  return null;
}

function decodeUserIdFromJwt(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json);
    return (
      (typeof payload?.sub === "string" && payload.sub) ||
      (typeof payload?.user_id === "string" && payload.user_id) ||
      (typeof payload?.id === "string" && payload.id) ||
      null
    );
  } catch {
    return null;
  }
}

async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const e: any = new Error("upstream_not_json");
    e.__raw = raw?.slice(0, 600);
    e.status = res.status;
    throw e;
  }
  return { data, raw };
}

export async function POST(req: NextRequest) {
  try {
    const { jobOfferId, candidateId } = (await req.json().catch(() => ({}))) as {
      jobOfferId?: string;
      candidateId?: string;
    };

    if (!jobOfferId) {
      return NextResponse.json({ error: "jobOfferId_required" }, { status: 400 });
    }

    const API = resolveApiUrl(req);
    const auth = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";
    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");

    const baseHeaders: HeadersInit = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(cookie ? { cookie } : {}),
      ...(xReqId ? { "x-request-id": xReqId } : {}),
      ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
    };

    // 1) Obtener headhunterId desde /auth/me (fallback: JWT cookie)
    let headhunterId: string | null = null;
    try {
      const meRes = await fetch(`${API}/auth/me`, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        credentials: "include",
      });
      const { data: me } = await readJson(meRes);
      if (meRes.ok && me?.id) headhunterId = String(me.id);
    } catch {}

    if (!headhunterId) {
      headhunterId = decodeUserIdFromJwt(extractAccessToken(req));
    }
    if (!headhunterId) {
      return NextResponse.json({ error: "unauthenticated_no_user_id" }, { status: 401 });
    }

    // 2) Crear referral en el monolito
    const payload: Record<string, any> = { headhunterId, jobOfferId };
    if (candidateId !== undefined) payload.candidateId = candidateId;

    const up = await fetch(`${API}/referrals`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    });

    const { data, raw } = await readJson(up);

    if (!up.ok) {
      const msg = data?.error || data?.message || `referrals_upstream_${up.status}`;
      const status = /conflict|already|23505/i.test(String(msg)) ? 409 : up.status || 500;
      return NextResponse.json(
        { error: msg, raw: data ?? raw, target: `${API}/referrals` },
        { status }
      );
    }

    const node = data || {};
    const code = node?.referral_code ?? node?.code ?? null;
    const id = node?.id ?? null;

    if (!code) {
      return NextResponse.json({ error: "missing_referral_code", raw: data }, { status: 502 });
    }

    return NextResponse.json({ code, id }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "referral_create_failed";
    const status =
      /unauth|forbidden|no_user_id/i.test(msg) ? 401 :
      /conflict|already|23505/i.test(msg) ? 409 :
      e?.status || 500;
    return NextResponse.json({ error: msg, __raw: e?.__raw ?? null }, { status });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
