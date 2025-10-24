// src/app/api/profiles/batch/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PROFILES_BASE = process.env.PROFILES_BASE_URL ?? "http://localhost:3001";

function buildAuthHeader(req: NextRequest): string | undefined {
    const fromHeader = req.headers.get("authorization");
    if (fromHeader && fromHeader.trim() !== "") return fromHeader;

    const token = req.cookies.get("access_token")?.value;
    if (token && token.trim() !== "") return `Bearer ${token}`;

    const cookieHeader = req.headers.get("cookie") ?? "";
    const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
    if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
    return undefined;
}

// Igual a tu helper, pero guardando el cuerpo crudo para debug
async function fetchJsonDebug(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const raw = await res.text().catch(() => "");
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* no JSON */ }

    if (!res.ok) {
        const msg = data?.message || data?.error || `upstream_error (${res.status})`;
        const detail = { url, status: res.status, headers: Object.fromEntries(res.headers), raw: raw?.slice(0, 500) };
        // Log en server (se ve en la consola de Next)
        console.error("[profiles/batch] Upstream error:", msg, detail);
        throw new Error(msg);
    }
    return data ?? null;
}

export async function POST(req: NextRequest) {
    const debug: Record<string, any> = {};
    try {
        const body = await req.json().catch(() => ({}));
        const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
        if (!ids.length) return NextResponse.json({ profiles: [] }, { status: 200 });

        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";

        // 1) Intento POST batch upstream
        try {
            const url = `${PROFILES_BASE}/profiles/batch`;
            debug.postUrl = url;
            const data = await fetchJsonDebug(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    ...(authorization ? { authorization } : {}),
                    cookie,
                },
                body: JSON.stringify({ ids }),
                cache: "no-store",
            });
            const profiles = Array.isArray(data) ? data : (data?.profiles ?? []);
            return NextResponse.json({ profiles });
        } catch (e: any) {
            debug.postErr = e?.message || String(e);
        }

        // 2) Fallback GET ?ids=...
        try {
            const url = `${PROFILES_BASE}/profiles?ids=${encodeURIComponent(ids.join(","))}`;
            debug.getUrl = url;
            const data = await fetchJsonDebug(url, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    ...(authorization ? { authorization } : {}),
                    cookie,
                },
                cache: "no-store",
            });
            const profiles = Array.isArray(data) ? data : (data?.profiles ?? []);
            return NextResponse.json({ profiles });
        } catch (e: any) {
            debug.getErr = e?.message || String(e);
        }

        // 3) Último fallback: N requests /profiles/:id
        try {
            debug.nRequests = ids.length;
            const results = await Promise.allSettled(
                ids.map((id) =>
                    fetchJsonDebug(`${PROFILES_BASE}/profiles/${id}`, {
                        method: "GET",
                        headers: {
                            Accept: "application/json",
                            ...(authorization ? { authorization } : {}),
                            cookie,
                        },
                        cache: "no-store",
                    })
                )
            );
            const profiles = results
                .filter((r) => r.status === "fulfilled")
                .map((r: any) => r.value)
                .filter(Boolean);

            if (profiles.length === 0) {
                // No conseguimos nada: devolvemos detalle para que lo veas en el cliente
                return NextResponse.json(
                    { profiles: [], error: "no_profiles_from_upstream", debug },
                    { status: 502 }
                );
            }
            return NextResponse.json({ profiles, debug });
        } catch (e: any) {
            debug.nRequestsErr = e?.message || String(e);
            return NextResponse.json(
                { profiles: [], error: "profiles_batch_proxy_error", debug },
                { status: 502 }
            );
        }
    } catch (e: any) {
        const msg = e?.message || "profiles_batch_proxy_error";
        const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
        return NextResponse.json({ profiles: [], error: msg, debug }, { status: isAuth ? 401 : 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
