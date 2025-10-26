import { NextRequest, NextResponse } from "next/server";

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

async function readJson(res: Response) {
    const raw = await res.text();
    let data: any = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        const e: any = new Error("upstream_not_json");
        e.__raw = raw?.slice(0, 300);
        throw e;
    }
    return { data, raw };
}

export async function GET(req: NextRequest) {
    const debug = req.nextUrl.searchParams.get("__debug") === "1" || req.headers.get("x-debug") === "1";
    try {
        const API = resolveApiUrl(req);
        const sp = req.nextUrl.searchParams;
        const limit = Number(sp.get("limit") ?? "25");
        const offset = Number(sp.get("offset") ?? "0");
        const status = sp.get("status") || null;
        const notificationType = sp.get("type") || sp.get("notificationType") || null;

        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";
        const xReqId = req.headers.get("x-request-id");
        const xCorrId = req.headers.get("x-correlation-id");

        const baseHeaders: HeadersInit = {
            Accept: "application/json",
            ...(authorization ? { Authorization: authorization } : {}),
            ...(cookie ? { cookie } : {}),
            ...(xReqId ? { "x-request-id": xReqId } : {}),
            ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
        };

        const meRes = await fetch(`${API}/auth/me`, {
            method: "GET",
            headers: baseHeaders,
            cache: "no-store",
            credentials: "include",
        });
        const { data: meData } = await readJson(meRes);
        if (!meRes.ok || !meData?.id) {
            const msg = meData?.error || meData?.message || `auth_me_upstream_${meRes.status}`;
            return NextResponse.json({ items: [], error: msg }, { status: meRes.status || 401 });
        }
        const userId: string = meData.id;

        const qs = new URLSearchParams();
        qs.set("userId", userId);
        if (status) qs.set("status", status);
        if (notificationType) qs.set("notificationType", notificationType);
        qs.set("limit", String(limit));
        qs.set("offset", String(offset));

        const up = await fetch(`${API}/notifications?${qs.toString()}`, {
            method: "GET",
            headers: baseHeaders,
            cache: "no-store",
            credentials: "include",
        });

        const { data, raw } = await readJson(up);
        if (!up.ok) {
            const msg = data?.error || data?.message || `notifications_upstream_${up.status}`;
            const payload = debug ? { items: [], error: msg, __debug: { status: up.status, raw: data ?? raw } } : { items: [], error: msg };
            return NextResponse.json(payload, { status: up.status || 500 });
        }

        const items = Array.isArray(data) ? data : data?.items ?? [];
        return NextResponse.json(debug ? { items, __debug: { status: up.status } } : { items }, { status: 200 });
    } catch (e: any) {
        const payload = { items: [], error: e?.message || "notifications_load_failed", __debug: e?.__raw || null };
        return NextResponse.json(payload, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const debug = req.nextUrl.searchParams.get("__debug") === "1" || req.headers.get("x-debug") === "1";
    try {
        const API = resolveApiUrl(req);
        const body = await req.json().catch(() => ({} as any));

        const payload = {
            userId: body.userId ?? body.user_id,
            title: body.title,
            message: body.message,
            notificationType: body.notificationType ?? body.notification_type,
            channel: body.channel ?? "email",
            relatedId: body.relatedId ?? body.related_id ?? null,
        };

        if (!payload.userId || !payload.title || !payload.message || !payload.notificationType) {
            return NextResponse.json(
                { error: "Missing required fields (userId, title, message, notificationType)" },
                { status: 400 }
            );
        }

        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";
        const xReqId = req.headers.get("x-request-id");
        const xCorrId = req.headers.get("x-correlation-id");

        const headers: HeadersInit = {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(authorization ? { Authorization: authorization } : {}),
            ...(cookie ? { cookie } : {}),
            ...(xReqId ? { "x-request-id": xReqId } : {}),
            ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
        };

        const up = await fetch(`${API}/notifications`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            cache: "no-store",
            credentials: "include",
        });

        const { data, raw } = await readJson(up);
        if (!up.ok) {
            const msg = data?.error || data?.message || `notifications_upstream_${up.status}`;
            const payloadErr = debug ? { error: msg, __debug: { status: up.status, raw: data ?? raw } } : { error: msg };
            return NextResponse.json(payloadErr, { status: up.status || 500 });
        }

        return NextResponse.json(debug ? { notification: data, __debug: { status: up.status } } : { notification: data }, { status: 201 });
    } catch (e: any) {
        const payload = { error: e?.message || "notification_create_failed", __debug: e?.__raw || null };
        return NextResponse.json(payload, { status: 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
