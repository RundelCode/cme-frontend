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
    "https://cme-monolith.vercel.app/api";
  try {
    new URL(base);
    return base.replace(/\/$/, "");
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/$/, "");
  }
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
  const t0 = Date.now();
  try {
    const input = await req.json().catch(() => ({}));
    const API = resolveApiUrl(req.url);
    const cookie = req.headers.get("cookie") ?? "";
    const authorization = buildAuthHeader(req);

    console.log("[company/create] input recibido", input);

    if (!assertString(input?.name)) return NextResponse.json({ error: "Campo 'name' es obligatorio" }, { status: 400 });
    if (!isValidEmail(input?.email)) return NextResponse.json({ error: "Campo 'email' inválido" }, { status: 400 });

    const me = await getCurrentUser(req, API);
    if (!me?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const ownedRes = await fetch(
      `${API}/companies/search?` + new URLSearchParams({ adminId: String(me.id), limit: "1", offset: "0" }).toString(),
      { headers: { Accept: "application/json", ...(authorization ? { Authorization: authorization } : {}), cookie }, cache: "no-store", credentials: "include" }
    );
    const ownedRaw = await ownedRes.text().catch(() => "");
    let ownedJson: any = null;
    try { ownedJson = ownedRaw ? JSON.parse(ownedRaw) : null; } catch { ownedJson = null; }
    console.log("[company/create] precheck owned status", { status: ownedRes.status, ok: ownedRes.ok, ownedRaw });

    if (!ownedRes.ok) {
      return NextResponse.json({ error: `owned_check_${ownedRes.status}`, raw: ownedJson ?? ownedRaw }, { status: ownedRes.status });
    }
    const ownedList: Array<any> = Array.isArray(ownedJson?.items) ? ownedJson.items : Array.isArray(ownedJson) ? ownedJson : [];
    if (ownedList.length > 0) {
      return NextResponse.json({ error: "Ya tienes una empresa registrada", companyId: ownedList[0]?.id }, { status: 409 });
    }

    const dupRes = await fetch(
      `${API}/companies/search?` + new URLSearchParams({ q: String(input.email), limit: "10", offset: "0" }).toString(),
      { headers: { Accept: "application/json", ...(authorization ? { Authorization: authorization } : {}), cookie }, cache: "no-store", credentials: "include" }
    );
    const dupRaw = await dupRes.text().catch(() => "");
    let dupJson: any = null;
    try { dupJson = dupRaw ? JSON.parse(dupRaw) : null; } catch { dupJson = null; }
    console.log("[company/create] precheck dup status", { status: dupRes.status, ok: dupRes.ok, dupRaw });

    if (!dupRes.ok) {
      return NextResponse.json({ error: `dup_check_${dupRes.status}`, raw: dupJson ?? dupRaw }, { status: dupRes.status });
    }
    const dupList: Array<{ id: string; email?: string | null }> = Array.isArray(dupJson?.items) ? dupJson.items : Array.isArray(dupJson) ? dupJson : [];
    const found = dupList.find((c) => (c?.email ?? "").toLowerCase() === String(input.email).toLowerCase());
    if (found) {
      return NextResponse.json({ error: "Ya existe una empresa con este email", companyId: found.id }, { status: 409 });
    }

    const payload = {
      name: String(input.name).trim(),
      email: String(input.email).trim(),
      website: input.website ? String(input.website).trim() : undefined,
      description: input.description ? String(input.description).trim() : undefined,
      industry: input.industry ? String(input.industry).trim() : undefined,
      location: input.location ? String(input.location).trim() : undefined,
      profilePicture: sanitizeUrl(input.profilePicture ?? undefined),
      coverPhoto: sanitizeUrl(input.coverPhoto ?? undefined),
      adminId: me.id,
      subscriptionPlan: (input.subscriptionPlan ?? "free"),
      companyRating: 0,
      boolVerified: false,
    };

    console.log("[company/create] payload hacia backend", payload);

    const createRes = await fetch(`${API}/companies`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}), cookie },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    });

    const createRaw = await createRes.text().catch(() => "");
    let company: any = null;
    try { company = createRaw ? JSON.parse(createRaw) : null; } catch { company = null; }

    console.log("[company/create] respuesta backend", { status: createRes.status, ok: createRes.ok, createRaw });

    if (!createRes.ok) {
      return NextResponse.json({ error: `create_${createRes.status}`, raw: company ?? createRaw }, { status: createRes.status });
    }
    if (!company?.id) return NextResponse.json({ error: "Respuesta inválida del backend", raw: company ?? createRaw }, { status: 400 });

    console.log(`[company/create] DONE in ${Date.now() - t0}ms`);
    return NextResponse.json({ company }, { status: 201 });
  } catch (err: any) {
    console.log("[company/create] error", err?.message);
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
