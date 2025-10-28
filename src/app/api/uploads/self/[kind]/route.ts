import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function resolveApiUrl(req: NextRequest) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "cme-monolith.vercel.app/api";
  if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
  return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

function decodeJwtPayload<T = any>(jwt: string): T | null {
  try {
    const [, b64] = jwt.split(".");
    if (!b64) return null;
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function pickBestJwt(req: NextRequest) {
  const access = req.cookies.get("access_token")?.value ?? null;
  const session = req.cookies.get("session_access")?.value ?? null;

  const accessPayload = access ? decodeJwtPayload<any>(access) : null;
  const sessionPayload = session ? decodeJwtPayload<any>(session) : null;

  if (accessPayload?.sub || accessPayload?.user_id) {
    return { jwt: access, payload: accessPayload, source: "access_token" };
  }
  if (sessionPayload?.sub || sessionPayload?.user_id) {
    return { jwt: session, payload: sessionPayload, source: "session_access" };
  }
  return { jwt: null as string | null, payload: null as any, source: null as string | null };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ kind: string }> | { kind: string } }
) {
  try {
    const p = "then" in ctx.params ? await ctx.params : (ctx.params as { kind: string });
    const rawKind = p.kind;
    const kind = (rawKind || "").toLowerCase();

    if (!["avatar", "cover"].includes(kind)) {
      return NextResponse.json({ error: "route_not_supported", detail: `No existe /uploads/self/${kind}` }, { status: 404 });
    }

    const { jwt, payload, source } = pickBestJwt(req);
    if (!jwt) {
      return NextResponse.json({ error: "unauthenticated_missing_token" }, { status: 401 });
    }

    const userId = payload?.sub ?? payload?.user_id ?? null;
    if (!userId) {
      return NextResponse.json({ error: "cannot_extract_user_id_from_token" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'missing_file_field', detail: 'Se espera key "file"' }, { status: 400 });
    }

    const fd = new FormData();
    fd.append("file", file, file.name);

    const API = resolveApiUrl(req);
    const upstream = await fetch(`${API}/uploads/self/${kind}`, {
      method: "POST",
      headers: {
        "x-user-id": String(userId),
        "x-internal-gateway": "next-proxy",
        "x-auth-source": source ?? "unknown",
        ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization")! } : {}),
        ...(req.headers.get("cookie") ? { cookie: req.headers.get("cookie")! } : {}),
      },
      body: fd,
      cache: "no-store",
    });

    const text = await upstream.text();
    try {
      const json = text ? JSON.parse(text) : null;
      return new NextResponse(JSON.stringify(json ?? {}), { status: upstream.status, headers: { "content-type": "application/json" } });
    } catch {
      return NextResponse.json(
        { error: "upstream_not_json", sample: text.slice(0, 180) },
        { status: 502 }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "internal_error" }, { status: 500 });
  }
}
