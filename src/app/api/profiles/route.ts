import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PROFILES_BASE =
    process.env.PROFILES_BASE_URL ?? "http://localhost:3001";

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

async function fetchJson(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = data?.message || data?.error || `upstream_error (${res.status})`;
        throw new Error(msg);
    }
    return data;
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const idsParam = url.searchParams.get("ids")?.trim();
        if (!idsParam) {
            return NextResponse.json({ profiles: [] }, { status: 200 });
        }
        const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);
        if (!ids.length) {
            return NextResponse.json({ profiles: [] }, { status: 200 });
        }

        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";

        try {
            const target = `${PROFILES_BASE}/profiles?ids=${encodeURIComponent(ids.join(","))}`;
            const data = await fetchJson(target, {
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
        } catch {
            try {
                const target = `${PROFILES_BASE}/profiles/batch`;
                const data = await fetchJson(target, {
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
            } catch {
                const results = await Promise.allSettled(
                    ids.map(id =>
                        fetchJson(`${PROFILES_BASE}/profiles/${id}`, {
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
                    .filter(r => r.status === "fulfilled")
                    .map((r: any) => r.value)
                    .filter(Boolean);
                return NextResponse.json({ profiles });
            }
        }
    } catch (e: any) {
        const msg = e?.message || "profiles_proxy_error";
        const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
        return NextResponse.json({ profiles: [], error: msg }, { status: isAuth ? 401 : 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
