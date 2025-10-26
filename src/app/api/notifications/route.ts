import { NextRequest, NextResponse } from "next/server";

const NOTIFS_Q = `
  query Notifications($userId: ID, $status: String, $notificationType: String, $limit: Int, $offset: Int) {
    notifications(userId: $userId, status: $status, notificationType: $notificationType, limit: $limit, offset: $offset) {
      id
      user_id
      title
      message
      notification_type
      channel
      status
      related_id
      read_at
      created_at
      updated_at
    }
  }
`;
const AUTH_ME = `query { authMe { id } }`;

function resolveGqlURL(origin: string) {
    return (
        process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim() ||
        process.env.GRAPHQL_URL?.trim() ||
        `${origin}/api/graphql`
    );
}

async function gql(req: NextRequest, query: string, variables?: any) {
    const url = resolveGqlURL(req.nextUrl.origin);
    const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json",
    };
    const auth = req.headers.get("authorization");
    const cookie = req.headers.get("cookie");
    if (auth) headers.authorization = auth;
    if (cookie) headers.cookie = cookie;

    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
    });

    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { }

    if (!res.ok || data?.errors?.length) {
        const message = data?.errors?.map((e: any) => e.message).join(" | ") || `HTTP ${res.status}`;
        const debug = { stage: "gql", url, status: res.status, request: { variables }, responseRaw: raw, response: data };
        throw Object.assign(new Error(message), { __debug: debug });
    }
    return data?.data;
}

function resolveNotifsBase(origin: string) {
    return process.env.NOTIFS_URL?.trim() || "http://localhost:3007";
}

export async function GET(req: NextRequest) {
    try {
        const sp = req.nextUrl.searchParams;
        const limit = Number(sp.get("limit") ?? "25");
        const offset = Number(sp.get("offset") ?? "0");
        const status = sp.get("status") || null;
        const notificationType = sp.get("type") || sp.get("notificationType") || null;

        const me = await gql(req, AUTH_ME);
        const userId: string | null = me?.authMe?.id ?? null;
        if (!userId) {
            return NextResponse.json({ items: [], error: "unauthenticated" }, { status: 401 });
        }

        const data = await gql(req, NOTIFS_Q, { userId, status, notificationType, limit, offset });
        const items = data?.notifications ?? [];
        return NextResponse.json({ items }, { status: 200 });
    } catch (e: any) {
        console.error("[/api/notifications][GET] fail:", e?.message, e?.__debug ?? "");
        return NextResponse.json(
            { items: [], error: e?.message || "notifications_load_failed", __debug: e?.__debug ?? null },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    const origin = req.nextUrl.origin;
    const base = resolveNotifsBase(origin);
    try {
        const body = await req.json().catch(() => ({}));

        const payload = {
            userId: body.userId ?? body.user_id,
            title: body.title,
            message: body.message,
            notificationType: body.notificationType ?? body.notification_type,
            channel: body.channel ?? "email",
            relatedId: body.relatedId ?? body.related_id ?? null,
        };


        if (!payload.userId || !payload.title || !payload.message || !payload.notificationType) {
            const msg = "Missing required fields (userId, title, message, notificationType)";
            console.warn("[/api/notifications][POST] 400:", msg);
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        const headers: Record<string, string> = {
            "content-type": "application/json",
            accept: "application/json",
        };
        const auth = req.headers.get("authorization");
        const cookie = req.headers.get("cookie");
        if (auth) headers.authorization = auth;
        if (cookie) headers.cookie = cookie;

        const res = await fetch(`${base}/notifications`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        const raw = await res.text();
        let data: any = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { }

        if (!res.ok) {
            console.error("[/api/notifications][POST] upstream error", res.status, raw);
            return NextResponse.json(
                { error: data?.message || data?.error || `REST error ${res.status}`, __debug: { base, payload, raw } },
                { status: 500 }
            );
        }

        return NextResponse.json({ notification: data }, { status: 201 });
    } catch (e: any) {
        console.error("[/api/notifications][POST] fail:", e?.message);
        return NextResponse.json(
            { error: e?.message || "notification_create_failed" },
            { status: 500 }
        );
    }
}
