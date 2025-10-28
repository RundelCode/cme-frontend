// src/app/api/profile/update/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/* ===== utils comunes ===== */
function buildAuthHeader(req: NextRequest | Request): string | undefined {
    const h = req.headers.get("authorization");
    if (h && h.trim() !== "") return h;

    const cookieHeader = req.headers.get("cookie") ?? "";
    const read = (name: string) => {
        const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i"));
        return m?.[1] ? decodeURIComponent(m[1]) : null;
    };
    const access = read("access_token") || read("sb-access-token");
    if (access && access.trim() !== "") return `Bearer ${access}`;

    const packed = read("supabase-auth-token");
    if (packed) {
        try {
            const parsed = JSON.parse(packed);
            if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) return `Bearer ${parsed[0]}`;
            if (parsed && typeof parsed === "object" && typeof (parsed as any).access_token === "string") {
                return `Bearer ${(parsed as any).access_token}`;
            }
        } catch { }
    }
    return undefined;
}

function resolveApiUrl(input: NextRequest | Request | string) {
    const base =
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_URL ||
        "http://localhost:3001/api"; // default a tu backend
    const trim = (s: string) => s.replace(/\/$/, "");
    if (/^https?:\/\//i.test(base)) return trim(base);
    const u = typeof input === "string" ? new URL(input) : new URL((input as Request).url);
    return trim(new URL(base, u.origin).toString());
}

async function readJsonStrict(res: Response) {
    const raw = await res.text();
    let data: any = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        const e: any = new Error("upstream_not_json");
        e.status = res.status;
        e.raw = raw?.slice(0, 1200);
        throw e;
    }
    return { data, raw };
}

function camelToSnakeKey(k: string) {
    return k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

// solo convertimos el primer nivel (lo que envía tu form)
function camelToSnakePayload(obj: Record<string, any>) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
        out[camelToSnakeKey(k)] = v;
    }
    return out;
}

/* ========== INTENTO MULTI-RUTA: probamos varios endpoints/verbos ========== */
async function tryUpdateOnBackend(API: string, headers: HeadersInit, snakePayload: Record<string, any>, meId?: string | null) {
    // orden de intentos: verbos y rutas típicas para update profile
    const targets: Array<{ method: "PATCH" | "PUT" | "POST"; path: string; body?: any }> = [];

    // preferimos "me"
    targets.push({ method: "PATCH", path: "/profiles/me", body: snakePayload });
    targets.push({ method: "PUT", path: "/profiles/me", body: snakePayload });
    targets.push({ method: "POST", path: "/profiles/me", body: snakePayload });

    // plural :id
    if (meId) {
        targets.push({ method: "PATCH", path: `/profiles/${encodeURIComponent(meId)}`, body: snakePayload });
        targets.push({ method: "PUT", path: `/profiles/${encodeURIComponent(meId)}`, body: snakePayload });
        targets.push({ method: "POST", path: `/profiles/${encodeURIComponent(meId)}`, body: snakePayload });
    }

    // variantes "profile" singular que he visto en tus rutas
    targets.push({ method: "PATCH", path: "/profile/me", body: snakePayload });
    targets.push({ method: "PUT", path: "/profile/me", body: snakePayload });
    targets.push({ method: "POST", path: "/profile/me", body: snakePayload });

    if (meId) {
        targets.push({ method: "PATCH", path: `/profile/${encodeURIComponent(meId)}`, body: snakePayload });
        targets.push({ method: "PUT", path: `/profile/${encodeURIComponent(meId)}`, body: snakePayload });
        targets.push({ method: "POST", path: `/profile/${encodeURIComponent(meId)}`, body: snakePayload });
    }

    // rutas de acción comunes en migraciones GQL->REST
    targets.push({ method: "POST", path: "/profiles/update", body: snakePayload });
    targets.push({ method: "POST", path: "/profile/update", body: snakePayload });
    targets.push({ method: "POST", path: "/profiles/update-my", body: snakePayload });

    const debug: any[] = [];

    for (const t of targets) {
        const url = `${API}${t.path}`;
        try {
            console.log(`[profile/update] trying ${t.method} ${url}`);
            const up = await fetch(url, {
                method: t.method,
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify(t.body ?? {}),
                credentials: "include",
                cache: "no-store",
            });
            const { data, raw } = await readJsonStrict(up);

            if (up.ok) {
                return { ok: true, data, tried: debug.concat({ ok: true, method: t.method, url, status: up.status }) };
            }
            debug.push({ ok: false, method: t.method, url, status: up.status, err: data ?? raw });
        } catch (e: any) {
            debug.push({ ok: false, method: t.method, url, error: e?.message || String(e) });
        }
    }

    return { ok: false, tried: debug };
}

/* =================== HANDLER =================== */

export async function POST(req: NextRequest) {
    const debug: Record<string, any> = {};
    try {
        const API = resolveApiUrl(req);
        const auth = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";

        const baseHeaders: HeadersInit = {
            Accept: "application/json",
            ...(auth ? { Authorization: auth } : {}),
            ...(cookie ? { cookie } : {}),
        };

        const payload = await req.json().catch(() => ({}));
        debug.inputKeys = Object.keys(payload || {});

        // quién soy
        let me: any = null;
        try {
            const up = await fetch(`${API}/auth/me`, { method: "GET", headers: baseHeaders, cache: "no-store", credentials: "include" });
            const { data } = await readJsonStrict(up);
            me = data;
        } catch {
            try {
                const up2 = await fetch(`${API}/profiles/me`, { method: "GET", headers: baseHeaders, cache: "no-store", credentials: "include" });
                const { data } = await readJsonStrict(up2);
                me = data?.profile ?? data;
            } catch { }
        }
        const meId = me?.id ?? null;
        debug.meId = meId;

        const snake = camelToSnakePayload(payload);
        debug.snakeKeys = Object.keys(snake || {});

        const result = await tryUpdateOnBackend(API, baseHeaders, snake, meId);
        debug.tried = result.tried;

        if (!result.ok) {
            return NextResponse.json({ ok: false, error: "no_backend_route_for_update", debug }, { status: 502 });
        }

        // traer perfil fresco (para que el cliente se actualice con los nombres correctos)
        let fresh: any = null;
        try {
            const r = await fetch(`${API}/profiles/me`, {
                method: "GET",
                headers: baseHeaders,
                cache: "no-store",
                credentials: "include",
            });
            const { data } = await readJsonStrict(r);
            fresh = data?.profile ?? data ?? null;
        } catch { }

        return NextResponse.json({ ok: true, profile: fresh ?? null, debug });
    } catch (e: any) {
        debug.error = e?.message || String(e);
        return NextResponse.json({ ok: false, error: debug.error, debug }, { status: 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
