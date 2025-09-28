// src/app/api/login/route.ts
import { NextResponse } from "next/server";

const LOGIN = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      user { id email role }
      session { access_token refresh_token }
    }
  }
`;

export async function POST(req: Request) {
  try {
    const { email, password, rememberMe } = await req.json();

    if (!process.env.GRAPHQL_ENDPOINT) {
      console.error("GRAPHQL_ENDPOINT no definido");
      return NextResponse.json(
        { error: "Misconfig: GRAPHQL_ENDPOINT no definido" },
        { status: 500 }
      );
    }

    const upstream = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: LOGIN, variables: { email, password } }),
    });

    const raw = await upstream.text();

    let json: any;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error("Upstream devolvió no-JSON:\n", raw);
      return NextResponse.json(
        { error: "El gateway devolvió una respuesta no JSON.", details: raw?.slice(0, 300) },
        { status: 502 }
      );
    }

    if (!upstream.ok || json?.errors?.length || !json?.data?.login) {
      const message =
        json?.errors?.map((e: any) => e.message).join(" | ") ||
        `Upstream ${upstream.status}`;
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const { user, session } = json.data.login;

    const res = NextResponse.json({ user });

    const ACCESS_TTL = rememberMe ? 60 * 60 * 24 * 7 : 60 * 60; // 7d vs 1h

    res.cookies.set("access_token", session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TTL,
    });

    res.cookies.set("refresh_token", session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err: any) {
    console.error("Error /api/login:", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
