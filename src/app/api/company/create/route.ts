import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthHeader,
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function sanitizeUrl(u?: string | null): string | undefined {
  if (!u) return undefined;

  try {
    const x = new URL(u);
    return x.toString();
  } catch {
    return undefined;
  }
}

async function getCurrentUser(req: NextRequest, API: string) {
  const cookie = req.headers.get("cookie") ?? "";
  const authorization = buildAuthHeader(req);
  const origin = new URL(req.url).origin;

  const local = await fetch(`${origin}/api/me`, {
    headers: {
      Accept: "application/json",
      cookie,
      ...(authorization ? { Authorization: authorization } : {}),
    },
    cache: "no-store",
    credentials: "include",
  });

  if (local.ok) {
    const me = await local.json().catch(() => null);

    const id: string | null =
      me?.id ??
      me?.user?.id ??
      null;

    const role = String(
      me?.role ??
      me?.user?.role ??
      ""
    ).toLowerCase();

    return id ? { id, role } : null;
  }

  for (const path of ["/me", "/auth/me"]) {
    const r = await fetch(`${API}${path}`, {
      headers: {
        Accept: "application/json",
        cookie,
        ...(authorization ? { Authorization: authorization } : {}),
      },
      cache: "no-store",
      credentials: "include",
    });

    if (r.ok) {
      const me = await r.json().catch(() => null);

      const id: string | null =
        me?.id ??
        me?.user?.id ??
        null;

      const role = String(
        me?.role ??
        me?.user?.role ??
        ""
      ).toLowerCase();

      if (id) {
        return { id, role };
      }
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  try {
    const input = await req.json().catch(() => ({}));

    const API = resolveApiUrl(req);
    const cookie = req.headers.get("cookie") ?? "";
    const authorization = buildAuthHeader(req);

    if (!assertString(input?.name)) {
      return NextResponse.json(
        { error: "Campo 'name' es obligatorio" },
        { status: 400 }
      );
    }

    if (!isValidEmail(input?.email)) {
      return NextResponse.json(
        { error: "Campo 'email' inválido" },
        { status: 400 }
      );
    }

    const me = await getCurrentUser(req, API);

    if (!me?.id) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const ownedRes = await fetch(
      `${API}/companies/search?` +
      new URLSearchParams({
        adminId: String(me.id),
        limit: "1",
        offset: "0",
      }).toString(),
      {
        headers: {
          Accept: "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
          cookie,
        },
        cache: "no-store",
        credentials: "include",
      }
    );

    const ownedParsed = await readJsonStrict(ownedRes);
    const ownedJson = ownedParsed.data;

    if (!ownedRes.ok) {
      return NextResponse.json(
        {
          error: `owned_check_${ownedRes.status}`,
          raw: ownedJson,
        },
        {
          status: ownedRes.status,
        }
      );
    }

    const ownedList: Array<any> =
      Array.isArray(ownedJson?.items)
        ? ownedJson.items
        : Array.isArray(ownedJson)
          ? ownedJson
          : [];

    if (ownedList.length > 0) {
      return NextResponse.json(
        {
          error: "Ya tienes una empresa registrada",
          companyId: ownedList[0]?.id,
        },
        {
          status: 409,
        }
      );
    }

    const dupRes = await fetch(
      `${API}/companies/search?` +
      new URLSearchParams({
        q: String(input.email),
        limit: "10",
        offset: "0",
      }).toString(),
      {
        headers: {
          Accept: "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
          cookie,
        },
        cache: "no-store",
        credentials: "include",
      }
    );

    const dupParsed = await readJsonStrict(dupRes);
    const dupJson = dupParsed.data;

    if (!dupRes.ok) {
      return NextResponse.json(
        {
          error: `dup_check_${dupRes.status}`,
          raw: dupJson,
        },
        {
          status: dupRes.status,
        }
      );
    }

    const dupList: Array<{
      id: string;
      email?: string | null;
    }> =
      Array.isArray(dupJson?.items)
        ? dupJson.items
        : Array.isArray(dupJson)
          ? dupJson
          : [];

    const found = dupList.find(
      (c) =>
        (c?.email ?? "").toLowerCase() ===
        String(input.email).toLowerCase()
    );

    if (found) {
      return NextResponse.json(
        {
          error: "Ya existe una empresa con este email",
          companyId: found.id,
        },
        {
          status: 409,
        }
      );
    }

    const payload = {
      name: String(input.name).trim(),
      email: String(input.email).trim(),
      website: input.website
        ? String(input.website).trim()
        : undefined,
      description: input.description
        ? String(input.description).trim()
        : undefined,
      industry: input.industry
        ? String(input.industry).trim()
        : undefined,
      location: input.location
        ? String(input.location).trim()
        : undefined,
      profilePicture: sanitizeUrl(
        input.profilePicture ?? undefined
      ),
      coverPhoto: sanitizeUrl(
        input.coverPhoto ?? undefined
      ),
      adminId: me.id,
      subscriptionPlan: input.subscriptionPlan ?? "free",
      companyRating: 0,
      boolVerified: false,
    };

    const createRes = await fetch(`${API}/companies`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
        cookie,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    });

    const createParsed = await readJsonStrict(createRes);
    const company = createParsed.data;

    if (!createRes.ok) {
      return NextResponse.json(
        {
          error: `create_${createRes.status}`,
          raw: company,
        },
        {
          status: createRes.status,
        }
      );
    }

    if (!company?.id) {
      return NextResponse.json(
        {
          error: "Respuesta inválida del backend",
          raw: company,
        },
        {
          status: 400,
        }
      );
    }

    console.log(
      `[company/create] DONE in ${Date.now() - t0}ms`
    );

    return NextResponse.json(
      { company },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}