import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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

function resolveApiUrl(req: NextRequest) {
    const base =
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_URL ||
        "http://localhost:3000/api";
    if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
    return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

async function fetchJson(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const txt = await res.text().catch(() => "");
    let data: any = null;
    try {
        data = txt ? JSON.parse(txt) : null;
    } catch {
        const err: any = new Error("upstream_not_json");
        err.status = res.status;
        err.raw = txt?.slice(0, 300);
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
        const url = new URL(req.url);
        const idsParam = url.searchParams.get("ids")?.trim();
        if (!idsParam) return NextResponse.json({ profiles: [] }, { status: 200 });

        const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
        if (!ids.length) return NextResponse.json({ profiles: [] }, { status: 200 });

        const API = resolveApiUrl(req);
        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";

        const commonHeaders: HeadersInit = {
            Accept: "application/json",
            ...(authorization ? { Authorization: authorization } : {}),
            ...(cookie ? { cookie } : {}),
        };

        try {
            const target = `${API}/profiles?ids=${encodeURIComponent(ids.join(","))}`;
            const data = await fetchJson(target, {
                method: "GET",
                headers: commonHeaders,
                cache: "no-store",
                credentials: "include",
            });
            const profiles = Array.isArray(data) ? data : data?.profiles ?? [];
            return NextResponse.json({ profiles });
        } catch {
            try {
                const target = `${API}/profiles/batch`;
                const data = await fetchJson(target, {
                    method: "POST",
                    headers: { ...commonHeaders, "Content-Type": "application/json" },
                    body: JSON.stringify({ ids }),
                    cache: "no-store",
                    credentials: "include",
                });
                const profiles = Array.isArray(data) ? data : data?.profiles ?? [];
                return NextResponse.json({ profiles });
            } catch {
                const results = await Promise.allSettled(
                    ids.map((id) =>
                        fetchJson(`${API}/profiles/${encodeURIComponent(id)}`, {
                            method: "GET",
                            headers: commonHeaders,
                            cache: "no-store",
                            credentials: "include",
                        })
                    )
                );
                const profiles = results
                    .filter((r) => r.status === "fulfilled")
                    .map((r: any) => r.value)
                    .filter(Boolean);
                return NextResponse.json({ profiles });
            }
        }
    } catch (e: any) {
        const msg = e?.message || "profiles_proxy_error";
        const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
        return NextResponse.json({ profiles: [], error: msg }, { status: isAuth ? 401 : e?.status || 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
