// src/app/api/notifications/[id]/read/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function buildAuthHeader(req: Request): string | undefined {
  const fromHeader = req.headers.get("authorization");
  if (fromHeader && fromHeader.trim() !== "") return fromHeader;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
  return undefined;
}

const NOTIFS_BASE = process.env.NOTIFICATIONS_BASE_URL ?? "http://localhost:30xx";

export async function PATCH(req: Request, ctx: any) {
  try {
    const id = ctx?.params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "missing_notification_id" }, { status: 400 });
    }

    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const upstream = await fetch(`${NOTIFS_BASE}/notifications/${id}/read`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(authorization ? { authorization } : {}),
        cookie,
      },
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const msg = data?.error || data?.message || `notifications_upstream_${upstream.status}`;
      return NextResponse.json({ error: msg }, { status: upstream.status });
    }

    return NextResponse.json(data ?? { ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "notifications_proxy_error" }, { status: 500 });
  }
}

export async function OPTIONS(_req: Request) {
  return NextResponse.json({}, { status: 200 });
}
