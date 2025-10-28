import { NextRequest, NextResponse } from "next/server";

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function assertString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function buildAuthHeader(req: NextRequest): string | undefined {
  const h = req.headers.get("authorization");
  if (h && h.trim() !== "") return h;
  const cookie = req.headers.get("cookie") ?? "";
  const m =
    cookie.match(/(?:^|;\s*)access_token=([^;]+)/i) ||
    cookie.match(/(?:^|;\s*)session_access=([^;]+)/i);
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
function toSnake(payload: Record<string, any>) {
  const map: Record<string, string> = {
    profilePicture: "profile_picture",
    coverPhoto: "cover_photo",
    subscriptionPlan: "subscription_plan",
    companyRating: "company_rating",
    boolVerified: "bool_verified",
    verifiedAt: "verified_at",
    adminId: "admin_id",
  };
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    const key = map[k] ?? k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    if (v !== undefined) out[key] = v;
  }
  return out;
}
function sanitizeUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  try {
    const x = new URL(u);
    return x.toString();
  } catch {
    return undefined;
  }
}
async function getCurrentUser(req: NextRequest, API: string) {
  const cookie = req.headers.get("cookie") ?? "";
  const authorization = buildAuthHeader(req);
  const origin = new URL(req.url).origin;
  const local = await fetch(`${origin}/api/me`, {
    headers: { Accept: "application/json", cookie, ...(authorization ? { Authorization: authorization } : {}) },
    cache: "no-store",
    credentials: "include",
  });
  if (local.ok) {
    const me = await local.json().catch(() => null);
    const id: string | null = me?.id ?? me?.user?.id ?? null;
    const role = (me?.role ?? me?.user?.role ?? "").toString().toLowerCase();
    return id ? { id, role } : null;
  }
  for (const path of ["/me", "/auth/me"]) {
    const r = await fetch(`${API}${path}`, {
      headers: { Accept: "application/json", cookie, ...(authorization ? { Authorization: authorization } : {}) },
      cache: "no-store",
      credentials: "include",
    });
    if (r.ok) {
      const me = await r.json().catch(() => null);
      const id: string | null = me?.id ?? me?.user?.id ?? null;
      const role = (me?.role ?? me?.user?.role ?? "").toString().toLowerCase();
      if (id) return { id, role };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const input = body?.input ?? {};
    if (!assertString(input?.name)) return NextResponse.json({ error: "Campo 'name' es obligatorio" }, { status: 400 });
    if (!isValidEmail(input?.email)) return NextResponse.json({ error: "Campo 'email' inválido" }, { status: 400 });

    const API = resolveApiUrl(req.url);
    const cookie = req.headers.get("cookie") ?? "";
    const authorization = buildAuthHeader(req);

    const me = await getCurrentUser(req, API);
    if (!me?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const ownedRes = await fetch(
      `${API}/companies/search?` +
      new URLSearchParams({ adminId: String(me.id), limit: "1", offset: "0" }).toString(),
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
    if (!ownedRes.ok) {
      const txt = await ownedRes.text().catch(() => "");
      return NextResponse.json(
        { error: txt || `Error verificando propiedad (HTTP ${ownedRes.status})` },
        { status: ownedRes.status }
      );
    }
    const ownedJson = await ownedRes.json().catch(() => null);
    const ownedList: Array<any> = Array.isArray(ownedJson?.items)
      ? ownedJson.items
      : Array.isArray(ownedJson)
        ? ownedJson
        : [];
    if (ownedList.length > 0) {
      return NextResponse.json(
        { error: "Ya tienes una empresa registrada", companyId: ownedList[0]?.id },
        { status: 409 }
      );
    }

    const dupRes = await fetch(
      `${API}/companies/search?` +
      new URLSearchParams({ q: String(input.email), limit: "10", offset: "0" }).toString(),
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
    if (!dupRes.ok) {
      const txt = await dupRes.text().catch(() => "");
      return NextResponse.json(
        { error: txt || `Error verificando duplicados (HTTP ${dupRes.status})` },
        { status: dupRes.status }
      );
    }
    const dupJson = await dupRes.json().catch(() => null);
    const dupList: Array<{ id: string; email?: string | null }> = Array.isArray(dupJson?.items)
      ? dupJson.items
      : Array.isArray(dupJson)
        ? dupJson
        : [];
    const found = dupList.find(
      (c) => (c?.email ?? "").toLowerCase() === String(input.email).toLowerCase()
    );
    if (found) {
      return NextResponse.json(
        { error: "Ya existe una empresa con este email", companyId: found.id },
        { status: 409 }
      );
    }

    const bodyOut = toSnake({
      name: String(input.name).trim(),
      email: String(input.email).trim(),
      website: input.website ? String(input.website).trim() : undefined,
      description: input.description ? String(input.description).trim() : undefined,
      industry: input.industry ? String(input.industry).trim() : undefined,
      location: input.location ? String(input.location).trim() : undefined,
      profilePicture: sanitizeUrl(input.profilePicture ?? undefined),
      coverPhoto: sanitizeUrl(input.coverPhoto ?? undefined),
      adminId: me.id,
      subscriptionPlan: "FREE",
      companyRating: 0,
      boolVerified: false,
    });


    const createRes = await fetch(`${API}/companies`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
        cookie,
      },
      body: JSON.stringify(bodyOut),
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

    const company = await createRes.json().catch(() => null);
    if (!company?.id) return NextResponse.json({ error: "Respuesta inválida del backend" }, { status: 400 });

    return NextResponse.json({ company }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
