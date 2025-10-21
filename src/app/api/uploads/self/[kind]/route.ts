// src/app/api/uploads/self/[kind]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UPLOADS_BASE = process.env.UPLOADS_BASE ?? "http://localhost:3015";
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ?? "http://localhost:3000/graphql";

// Helpers
async function getUserIdFromSession(req: NextRequest): Promise<string | null> {
  // 1) Intenta via GraphQL authMe con las cookies del request (lo más confiable)
  const cookie = req.headers.get("cookie") ?? "";
  const authz = req.headers.get("authorization") ?? "";

  try {
    const r = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, authorization: authz },
      body: JSON.stringify({ query: "query { authMe { id } }" }),
      // importante: el endpoint de Next y GraphQL suelen ser mismo origen; si no, CORS server-side
    });
    const j = await r.json().catch(() => ({}));
    const id = j?.data?.authMe?.id ?? null;
    if (id) return id;
  } catch { /* ignore */ }

  // 2) (Fallback) decodifica un JWT si lo tuvieras en cookies específicas
  const session = req.cookies.get("session_access")?.value ?? null;
  const access = req.cookies.get("access_token")?.value ?? null;
  const jwt = session || access || null;
  if (jwt) {
    try {
      const [, b64] = jwt.split(".");
      if (b64) {
        const pad = "=".repeat((4 - (b64.length % 4)) % 4);
        const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
        const sub = payload?.sub ?? payload?.user_id ?? null;
        if (sub) return String(sub);
      }
    } catch { /* ignore */ }
  }

  return null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: { kind: string } }
) {
  try {
    const kind = (ctx.params?.kind || "").toLowerCase();
    // ✅ añade 'cv' si también subes CV desde settings
    if (!["avatar", "cover", "cv"].includes(kind)) {
      return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    }

    // 1) Resuelve userId de forma robusta
    const userId = await getUserIdFromSession(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // 2) Toma el form-data del cliente
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Falta archivo (key="file")' }, { status: 400 });
    }
    const fd = new FormData();
    fd.append("file", file, file.name);

    // 3) Reenvía al microservicio, inyectando headers requeridos
    const cookie = req.headers.get("cookie") ?? "";
    const authz = req.headers.get("authorization") ?? "";
    const upstream = await fetch(`${UPLOADS_BASE}/uploads/self/${kind}`, {
      method: "POST",
      headers: {
        "x-user-id": String(userId),
        "x-internal-gateway": "next-proxy",
        // reenviamos credenciales si el MS las usa para algo adicional
        cookie,
        authorization: authz,
        // ⚠️ NO fuerces content-type, deja que el fetch lo ponga con boundary.
      },
      body: fd,
    });

    const text = await upstream.text();
    try {
      const json = text ? JSON.parse(text) : null;
      return new NextResponse(JSON.stringify(json), { status: upstream.status });
    } catch {
      return NextResponse.json(
        { error: "Upstream no JSON", status: upstream.status, sample: text.slice(0, 200) },
        { status: 502 }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Error" }, { status: 500 });
  }
}
