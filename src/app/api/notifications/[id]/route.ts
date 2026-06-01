// src/app/api/notifications/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

function buildAuthHeader(req: Request): string | undefined {
  const fromHeader = req.headers.get("authorization");
  if (fromHeader && fromHeader.trim() !== "") return fromHeader;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
  return undefined;
}

function resolveApiUrl(reqUrl: string) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "https://cme-monolith-7hth.onrender.com";
  try {
    new URL(base);
    return base.replace(/\/$/, "");
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/$/, "");
  }
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

export async function GET(req: NextRequest, context: any) {
  const url = new URL(req.url);
  const debug =
    url.searchParams.get("__debug") === "1" ||
    req.headers.get("x-debug") === "1";

  try {
    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    const API = resolveApiUrl(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const upstream = await fetch(
      `${API}/notifications/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
          ...(cookie ? { cookie } : {}),
        },
        cache: "no-store",
        credentials: "include",
      }
    );

    const { data, raw } = await readJson(upstream);

    if (!upstream.ok || !data?.id) {
      const msg =
        data?.error ||
        data?.message ||
        `notifications_upstream_${upstream.status}`;
      const payload = debug
        ? { error: msg, __debug: { status: upstream.status, raw: data ?? raw } }
        : { error: msg };
      return NextResponse.json(payload, { status: upstream.status || 500 });
    }

    return NextResponse.json(
      debug
        ? { notification: data, __debug: { status: upstream.status } }
        : { notification: data },
      { status: 200 }
    );
  } catch (e: any) {
    const payload = {
      error: e?.message || "notification_get_failed",
      __debug: e?.__raw || null,
    };
    return NextResponse.json(payload, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: any) {
  const url = new URL(req.url);
  const debug =
    url.searchParams.get("__debug") === "1" ||
    req.headers.get("x-debug") === "1";

  try {
    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const status: string | undefined =
      typeof body?.status === "string" && body.status.trim()
        ? body.status
        : undefined;

    const rawReadAt = body?.readAt as unknown;
    let readAt: string | undefined;
    if (rawReadAt === true || rawReadAt === "now")
      readAt = new Date().toISOString();
    else if (typeof rawReadAt === "string" && rawReadAt.trim())
      readAt = rawReadAt;

    if (!status && !readAt) {
      return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
    }

    const API = resolveApiUrl(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const upstream = await fetch(
      `${API}/notifications/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ status, readAt }),
        cache: "no-store",
        credentials: "include",
      }
    );

    const { data, raw } = await readJson(upstream);

    if (!upstream.ok) {
      const msg =
        data?.error ||
        data?.message ||
        `notifications_upstream_${upstream.status}`;
      const payload = debug
        ? { error: msg, __debug: { status: upstream.status, raw: data ?? raw } }
        : { error: msg };
      return NextResponse.json(payload, { status: upstream.status || 500 });
    }

    return NextResponse.json(
      debug
        ? { notification: data, __debug: { status: upstream.status } }
        : { notification: data },
      { status: 200 }
    );
  } catch (e: any) {
    const payload = {
      error: e?.message || "notification_update_failed",
      __debug: e?.__raw || null,
    };
    return NextResponse.json(payload, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
