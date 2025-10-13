import { NextResponse } from "next/server";

const SOCIAL_LOGIN = `
  mutation SocialLogin($access_token: String!, $refresh_token: String) {
    socialLogin(access_token: $access_token, refresh_token: $refresh_token) {
      user { id email role profile_picture }
      session { access_token refresh_token token_type expires_in }
    }
  }
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const access_token = body?.access_token;
    const refresh_token = body?.refreshToken ?? null;
    const rememberMe = !!body?.rememberMe;

    if (!access_token) {
      return NextResponse.json({ error: 'access_token is required' }, { status: 400 });
    }

    if (!process.env.GRAPHQL_ENDPOINT) {
      console.error("GRAPHQL_ENDPOINT no definido");
      return NextResponse.json({ error: "Misconfig: GRAPHQL_ENDPOINT no definido" }, { status: 500 });
    }

    const upstream = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: SOCIAL_LOGIN, variables: { access_token, refresh_token } }),
    });

    const raw = await upstream.text();
    let json: any;
    try { json = raw ? JSON.parse(raw) : null; } 
    catch (e) {
      console.error("Upstream devolvió no-JSON:\n", raw);
      return NextResponse.json({ error: "El gateway devolvió una respuesta no JSON.", details: raw?.slice(0, 300) }, { status: 502 });
    }

    console.log('/api/social-login -> upstream status:', upstream.status, 'body:', JSON.stringify(json));

    if (!upstream.ok || json?.errors?.length || !json?.data?.socialLogin) {
      const message = json?.errors?.map((e: any) => e.message).join(" | ") || `Upstream ${upstream.status}`;
      console.error('/api/social-login error upstream:', message);
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const { user, session } = json.data.socialLogin ?? {};
    if (!session?.access_token) {
      console.error('/api/social-login: session missing in upstream response', json);
      return NextResponse.json({ error: 'session_missing_in_upstream' }, { status: 502 });
    }

    const res = NextResponse.json({ user, session });

    const ACCESS_TTL = rememberMe ? 60 * 60 * 24 * 7 : 60 * 60;

    res.cookies.set("access_token", session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TTL,
    });

    if (session.refresh_token) {
      res.cookies.set("refresh_token", session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    } else {
      console.log('/api/social-login: no refresh_token returned, skipping refresh cookie');
    }

    console.log('/api/social-login: cookies set, returning success');
    return res;
  } catch (err: any) {
    console.error("Error /api/social-login:", err);
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}