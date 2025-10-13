import { NextResponse } from "next/server";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";

const AUTH_ME = `query { authMe { id email role } }`;

export async function GET() {
  try {
    const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;
    if (!GRAPHQL_ENDPOINT) {
      return NextResponse.json({ error: "GRAPHQL_ENDPOINT no definido" }, { status: 500 });
    }

    const hdrs = await nextHeaders();
    const cookieStore = await nextCookies();
    const cookieHeader = cookieStore.toString();

    // 👇 lee el access_token httpOnly y construye Authorization
    const access = cookieStore.get("access_token")?.value;
    const authHeader = access ? `Bearer ${access}` : undefined;

    const upstream = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
        ...(authHeader ? { Authorization: authHeader } : {}),
        "x-correlation-id": hdrs.get("x-correlation-id") || "",
      },
      body: JSON.stringify({ query: AUTH_ME }),
      cache: "no-store",
    });

    const raw = await upstream.text();
    let json: any;
    try { json = raw ? JSON.parse(raw) : null; } catch {
      return NextResponse.json({ error: "Gateway devolvió no-JSON", details: raw?.slice(0,300) }, { status: 502 });
    }

    if (!upstream.ok || json?.errors?.length) {
      const msg = json?.errors?.map((e: any) => e.message).join(" | ") || `Upstream ${upstream.status}`;
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    return NextResponse.json({ user: json.data.authMe || null });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal Error" }, { status: 500 });
  }
}
