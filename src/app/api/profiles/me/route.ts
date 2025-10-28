import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest | Request): string | undefined {
    const h = req.headers.get("authorization");
    if (h && h.trim() !== "") return h;
    const cookieHeader = req.headers.get("cookie") ?? "";
    const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
    if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
    return undefined;
}
function resolveApiUrl(input: NextRequest | Request | string) {
    const base = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:3001/api";
    const trim = (s: string) => s.replace(/\/$/, "");
    if (/^https?:\/\//i.test(base)) return trim(base);
    const u = typeof input === "string" ? new URL(input) : new URL((input as Request).url);
    return trim(new URL(base, u.origin).toString());
}
async function readJsonStrict(res: Response) {
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {
        const e: any = new Error("upstream_not_json");
        e.status = res.status;
        e.raw = raw?.slice(0, 800);
        throw e;
    }
    return { data, raw };
}

export async function GET(req: NextRequest) {
    try {
        const API = resolveApiUrl(req);
        const auth = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";
        const headers: HeadersInit = {
            Accept: "application/json",
            ...(auth ? { Authorization: auth } : {}),
            ...(cookie ? { cookie } : {}),
        };

        let up = await fetch(`${API}/profiles/me`, { method: "GET", headers, cache: "no-store", credentials: "include" });
        if (!up.ok) {
            const me = await fetch(`${API}/auth/me`, { method: "GET", headers, cache: "no-store", credentials: "include" });
            const { data: meData } = await readJsonStrict(me);
            const id = meData?.id;
            if (!id) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
            up = await fetch(`${API}/profiles/${encodeURIComponent(id)}`, { method: "GET", headers, cache: "no-store", credentials: "include" });
        }
        const { data } = await readJsonStrict(up);
        const profile = data?.profile ?? data ?? null;
        return NextResponse.json({ profile });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "profiles_me_error" }, { status: 500 });
    }
}

export async function OPTIONS() { return NextResponse.json({}, { status: 200 }); }
