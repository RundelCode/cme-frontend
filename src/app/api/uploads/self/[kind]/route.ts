import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const UPLOADS_BASE = process.env.UPLOADS_BASE ?? "http://localhost:3015";

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
  ctx: { params: Promise<{ kind: string }> }
) {
  try {
    const { kind: rawKind } = await ctx.params;
    const kind = (rawKind || "").toLowerCase();
    if (!["avatar", "cover", "cv"].includes(kind)) {
      return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    }

    const { jwt, payload, source } = pickBestJwt(req);
    if (!jwt) {
      return NextResponse.json({ error: "No autenticado (sin token)" }, { status: 401 });
    }

    const userId = payload?.sub ?? payload?.user_id ?? null;
    if (!userId) {
      return NextResponse.json({ error: "No se pudo extraer userId del token" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Falta archivo (key="file")' }, { status: 400 });
    }
    const fd = new FormData();
    fd.append("file", file, file.name);

    const upstream = await fetch(`${UPLOADS_BASE}/uploads/self/${kind}`, {
      method: "POST",
      headers: {
        "x-user-id": String(userId),
        "x-internal-gateway": "next-proxy",
        "x-auth-source": source ?? "unknown",
      },
      body: fd,
    });

    const text = await upstream.text();
    try {
      const json = text ? JSON.parse(text) : null;
      return new NextResponse(JSON.stringify(json), { status: upstream.status });
    } catch {
      return NextResponse.json(
        { error: "Upstream no JSON", sample: text.slice(0, 180) },
        { status: 502 }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Error" }, { status: 500 });
  }
}
