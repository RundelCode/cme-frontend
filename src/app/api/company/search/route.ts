import { NextRequest, NextResponse } from "next/server";
import { SEARCH_COMPANIES } from "../../../../../lib/queries";

function resolveGraphqlUrl(req: NextRequest) {
  const env =
    process.env.GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL ||
    "/api/graphql";

  if (env.startsWith("/")) {
    return new URL(env, req.nextUrl.origin).toString();
  }
  return env;
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
    const cookie = req.headers.get("cookie");
    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");
    if (auth) headers["authorization"] = auth;
    if (cookie) headers["cookie"] = cookie;
    if (xReqId) headers["x-request-id"] = xReqId;
    if (xCorrId) headers["x-correlation-id"] = xCorrId;

    const gqlRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: SEARCH_COMPANIES,
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
      return NextResponse.json(
        {
          error: `GraphQL HTTP ${gqlRes.status}`,
          details: data?.errors ?? null,
          raw: data ?? raw,
          target: url,
        },
        { status: 502 },
      );
    }

    if (data?.errors?.length) {
      return NextResponse.json(
        {
          error: data.errors[0]?.message ?? "GraphQL error",
          details: data.errors,
          target: url,
        },
        { status: 500 },
      );
    }

    const items = data?.data?.searchCompanies ?? [];
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Search error (proxy)" },
      { status: 500 },
    );
  }
}
