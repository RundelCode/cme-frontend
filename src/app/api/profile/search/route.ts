// app/api/profile/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SEARCH_PROFILES } from "../../../../../lib/queries";

function resolveGraphqlUrl(req: NextRequest) {
  const env =
    process.env.GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL ||
    "/api/graphql";
  return env.startsWith("/")
    ? new URL(env, req.nextUrl.origin).toString()
    : env;
}

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json().catch(() => ({}));
    const url = resolveGraphqlUrl(req);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };

    const auth = req.headers.get("authorization");
    if (auth) headers["authorization"] = auth;

    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");
    if (xReqId) headers["x-request-id"] = xReqId;
    if (xCorrId) headers["x-correlation-id"] = xCorrId;

    const gqlRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: SEARCH_PROFILES,
        variables: { input: input ?? {} },
      }),
      cache: "no-store",
    });

    const raw = await gqlRes.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
    }

    if (!gqlRes.ok) {
      console.error("[profiles/search] GraphQL HTTP error:", gqlRes.status, raw);
      return NextResponse.json(
        { error: `GraphQL HTTP ${gqlRes.status}`, raw },
        { status: 502 }
      );
    }

    if (data?.errors?.length) {
      console.error("[profiles/search] GraphQL errors:", data.errors);
      return NextResponse.json(
        { error: data.errors[0]?.message ?? "GraphQL error", details: data.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: data?.data?.searchProfiles ?? [] });
  } catch (e: any) {
    console.error("[profiles/search] Proxy error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Search error (proxy)" },
      { status: 500 }
    );
  }
}
