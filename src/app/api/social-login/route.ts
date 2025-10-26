import { NextResponse } from "next/server";

type GraphQLResponse = { data?: any; errors?: any };

function getGraphqlUrl() {
  return (
    process.env.MY_GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL ||
    process.env.GRAPHQL_URL ||
    process.env.GRAPHQL_ENDPOINT
  );
}

function mask(token?: string | null) {
  if (!token) return null;
  return token.length > 20 ? `${token.slice(0, 8)}...${token.slice(-8)}` : "****";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const incomingToken = body?.access_token ?? null;
    const incomingRefresh = body?.refresh_token ?? null;
    if (!incomingToken) {
      console.error("[/api/social-login] no access_token recibido");
      return NextResponse.json({ error: "No access_token" }, { status: 400 });
    }

    const graphqlUrl = getGraphqlUrl();
    if (!graphqlUrl) {
      console.error("[/api/social-login] GRAPHQL URL no configurada en env");
      return NextResponse.json(
        { error: "Server misconfiguration: GRAPHQL URL missing" },
        { status: 500 }
      );
    }

    const graphqlBody = {
      query: `mutation ($access_token: String!, $refresh_token: String) {
        socialLogin(access_token: $access_token, refresh_token: $refresh_token) {
          user { id email role profile_picture }
          session { access_token refresh_token token_type expires_in }
        }
      }`,
      variables: { access_token: incomingToken, refresh_token: incomingRefresh },
    };

    const graphqlRes = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${incomingToken}`,
      },
      body: JSON.stringify(graphqlBody),
    });

    const status = graphqlRes.status;
    const text = await graphqlRes.text();
    let parsed: GraphQLResponse | null = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (e) {
      parsed = { data: null, errors: text };
    }

    if (!graphqlRes.ok) {
      console.error("[/api/social-login] GraphQL HTTP error:", status, text);
      return NextResponse.json(
        { error: "GraphQL HTTP error", details: text },
        { status: 502 }
      );
    }

    if (parsed?.errors) {
      console.error("[/api/social-login] GraphQL returned errors:", parsed.errors);
      return NextResponse.json(
        { error: "GraphQL errors", details: parsed.errors },
        { status: 400 }
      );
    }

    const session = parsed?.data?.socialLogin?.session;
    const user = parsed?.data?.socialLogin?.user ?? null;

    if (!session) {
      console.error("[/api/social-login] no session in GraphQL response", parsed);
      return NextResponse.json({ error: "no session" }, { status: 500 });
    }


    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
    const isProd = process.env.NODE_ENV === "production";

    const ACCESS_TTL = 60 * 60 * 24 * 7;
    const REFRESH_TTL = 60 * 60 * 24 * 30;

    const res = NextResponse.json({ ok: true, user });

    const sameSiteVal =
      (process.env.COOKIE_SAMESITE as any) || (isProd ? "none" : "lax");

    res.cookies.set("access_token", session.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSiteVal,
      path: "/",
      maxAge: ACCESS_TTL,
      domain: cookieDomain,
    });

    if (session.refresh_token) {
      res.cookies.set("refresh_token", session.refresh_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: sameSiteVal,
        path: "/",
        maxAge: REFRESH_TTL,
        domain: cookieDomain,
      });
    }


    return res;
  } catch (err: any) {
    console.error("[/api/social-login] Error:", err?.message ?? err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
