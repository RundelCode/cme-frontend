import { NextRequest, NextResponse } from "next/server";

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function buildAuthHeader(req: NextRequest): string | undefined {
  const fromHeader = req.headers.get("authorization");
  if (fromHeader && fromHeader.trim() !== "") return fromHeader;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
  return undefined;
}

function resolveApiUrl(reqUrl: string) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  try {
    new URL(base);
    return base.replace(/\/$/, "");
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/$/, "");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = body?.input ?? {};

    if (!assertString(input?.name)) {
      return NextResponse.json({ error: "Campo 'name' es obligatorio" }, { status: 400 });
    }
    if (!isValidEmail(input?.email)) {
      return NextResponse.json(
        { error: "Campo 'email' es obligatorio y debe ser un email válido" },
        { status: 400 }
      );
    }

    const API = resolveApiUrl(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const preRes = await fetch(
      `${API}/companies/search?` +
        new URLSearchParams({
          q: String(input.email),
          limit: "10",
          offset: "0",
        }).toString(),
      {
        headers: {
          Accept: "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
          cookie,
        },
        cache: "no-store",
        credentials: "include",
      }
    );

    if (!preRes.ok) {
      const txt = await preRes.text().catch(() => "");
      return NextResponse.json(
        { error: txt || `Error verificando empresas (HTTP ${preRes.status})` },
        { status: preRes.status }
      );
    }

    const preList: Array<{ id: string; email?: string | null }> = await preRes.json();
    const found =
      preList?.find(
        (c) => (c?.email ?? "").toLowerCase() === String(input.email).toLowerCase()
      ) ?? null;

    if (found) {
      return NextResponse.json(
        {
          error:
            "Ya existe una empresa registrada con este email. Política: un usuario solo puede crear una empresa.",
          companyId: found.id,
        },
        { status: 409 }
      );
    }

    const createRes = await fetch(`${API}/companies`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
        cookie,
      },
      body: JSON.stringify(input),
      cache: "no-store",
      credentials: "include",
    });

    if (!createRes.ok) {
      const txt = await createRes.text().catch(() => "");
      return NextResponse.json(
        { error: txt || `Error creando empresa (HTTP ${createRes.status})` },
        { status: createRes.status }
      );
    }

    const company = await createRes.json();
    if (!company?.id) {
      return NextResponse.json(
        { error: "No se recibió 'id' en la respuesta de creación" },
        { status: 400 }
      );
    }

    return NextResponse.json({ company }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
