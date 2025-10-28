import { NextRequest, NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest): string | undefined {
    const h = req.headers.get("authorization");
    if (h && h.trim() !== "") return h;
    const token = req.cookies.get("access_token")?.value || req.cookies.get("session_access")?.value;
    if (token && token.trim() !== "") return `Bearer ${token}`;
    const cookie = req.headers.get("cookie") ?? "";
    const m = cookie.match(/(?:^|;\s*)(access_token|session_access)=([^;]+)/i);
    if (m?.[2]) return `Bearer ${decodeURIComponent(m[2])}`;
    return undefined;
}

function resolveApiUrl(reqUrl: string) {
    const base = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:3000/api";
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
        const API = resolveApiUrl(req.url);
        const body = await req.json().catch(() => ({}));
        const auth = buildAuthHeader(req);
        const res = await fetch(`${API}/jobs`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
            body: JSON.stringify(body),
            credentials: "include",
            cache: "no-store",
        });
        const raw = await res.text();
        let json: any = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { }
        if (!res.ok) return NextResponse.json({ message: json?.message || json?.error || `HTTP ${res.status}` }, { status: res.status });
        return NextResponse.json(json, { status: res.status });
    } catch (e: any) {
        return NextResponse.json({ message: e?.message || "Error inesperado" }, { status: 500 });
    }
}
