import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest): string | undefined {
    const c = req.headers.get("cookie") ?? "";
    const read = (name: string) => {
        const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i"));
        return m?.[1] ? decodeURIComponent(m[1]) : null;
    };

    const access = read("access_token") || read("sb-access-token");
    if (access && access.trim() !== "") return `Bearer ${access}`;

    const packed = read("supabase-auth-token");
    if (packed) {
        try {
            const parsed = JSON.parse(packed);
            if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
                return `Bearer ${parsed[0]}`;
            }
            if (parsed && typeof parsed === "object" && typeof (parsed as any).access_token === "string") {
                return `Bearer ${(parsed as any).access_token}`;
            }
        } catch { }
    }

    const h = req.headers.get("authorization");
    if (h && h.trim() !== "") return h;

    return undefined;
}


function resolveApiUrl(req: NextRequest) {
    const base =
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_URL ||
        "cme-monolith.vercel.app/api";
    if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
    return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

async function fetchJson(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const text = await res.text().catch(() => "");
    let data: any = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        const err: any = new Error("upstream_not_json");
        err.status = res.status;
        err.raw = text?.slice(0, 300);
        throw err;
    }
    if (!res.ok) {
        const msg = data?.message || data?.error || `upstream_error (${res.status})`;
        const err: any = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

export async function GET(req: NextRequest) {
    try {
        const API = resolveApiUrl(req);
        const url = new URL(req.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";

        const baseHeaders: HeadersInit = {
            Accept: "application/json",
            ...(authorization ? { Authorization: authorization } : {}),
            ...(cookie ? { cookie } : {}),
        };

        // 1) Obtener el usuario autenticado
        let me: any = null;
        try {
            me = await fetchJson(`${API}/auth/me`, {
                method: "GET",
                headers: baseHeaders,
                cache: "no-store",
                credentials: "include",
            });
        } catch (e: any) {
            // fallback opcional si tu backend expone /profiles/me
            try {
                me = await fetchJson(`${API}/profiles/me`, {
                    method: "GET",
                    headers: baseHeaders,
                    cache: "no-store",
                    credentials: "include",
                });
            } catch (e2: any) {
                return NextResponse.json(
                    { total: 0, items: [], error: e2?.message || "No autenticado" },
                    { status: e2?.status === 401 ? 401 : 500 }
                );
            }
        }

        const userId: string | undefined = me?.id;
        if (!userId) {
            return NextResponse.json(
                { total: 0, items: [], error: "No autenticado (sin userId)" },
                { status: 401 }
            );
        }

        // 2) Querystring para referrals
        const qs = new URLSearchParams();
        qs.set("headhunterId", userId);
        qs.set("all", "true");
        if (from) qs.set("from", from);
        if (to) qs.set("to", to);

        // 3) Llamar a /referrals
        const referrals = await fetchJson(`${API}/referrals?${qs.toString()}`, {
            method: "GET",
            headers: baseHeaders,
            cache: "no-store",
            credentials: "include",
        });

        return NextResponse.json(referrals);
    } catch (e: any) {
        const msg = e?.message || "referrals_proxy_error";
        const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
        return NextResponse.json(
            { total: 0, items: [], error: msg },
            { status: isAuth ? 401 : e?.status || 500 }
        );
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
