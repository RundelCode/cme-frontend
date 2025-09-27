import { NextResponse } from "next/server";

const ALLOWED_ROLES = new Set(["company_admin", "headhunter", "candidate"]);

function buildSignupMutation(roleLiteral: string) {
  return `
    mutation Signup($email: String!, $password: String!, $full_name: String!, $phone: String!) {
      signup(
        email: $email,
        password: $password,
        full_name: $full_name,
        phone: $phone,
        role: ${roleLiteral}
      ) {
        user { id email role }
        session { access_token refresh_token }
      }
    }
  `;
}

export async function POST(req: Request) {
  try {
    const { email, password, fullName, phone, role } = await req.json();

    const normalized = String(role || "").trim();
    if (!ALLOWED_ROLES.has(normalized)) {
      return NextResponse.json(
        { error: `Role inválido. Usa uno de: ${[...ALLOWED_ROLES].join(", ")}` },
        { status: 400 }
      );
    }

    const SIGNUP = buildSignupMutation(normalized);

    const upstream = await fetch(process.env.GRAPHQL_ENDPOINT!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: SIGNUP,
        variables: { email, password, full_name: fullName, phone },
      }),
    });

    const raw = await upstream.text();
    let json: any = null;
    try { json = raw ? JSON.parse(raw) : null; }
    catch { 
      return NextResponse.json({ error: "Respuesta no-JSON del gateway", details: raw?.slice(0,300) }, { status: 502 });
    }

    if (!upstream.ok || json?.errors?.length || !json?.data?.signup) {
      const message = json?.errors?.map((e: any) => e.message).join(" | ") || `Upstream ${upstream.status}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { user, session } = json.data.signup;

    const res = NextResponse.json({ user });
    res.cookies.set("access_token", session.access_token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 60 * 60,
    });
    res.cookies.set("refresh_token", session.refresh_token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
