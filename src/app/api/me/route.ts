import { NextResponse } from "next/server";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import {
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mask(v?: string | null) {
  if (!v) return null;
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "..." + v.slice(-4);
}

function pickBearer(
  cookieStore: Awaited<
    ReturnType<typeof nextCookies>
  >
) {
  const access =
    cookieStore.get(
      "access_token"
    )?.value || null;

  if (
    access &&
    access.trim() !== ""
  ) {
    return {
      header: `Bearer ${access}`,
      source:
        "access_token",
    };
  }

  const sb =
    cookieStore.get(
      "sb-access-token"
    )?.value || null;

  if (
    sb &&
    sb.trim() !== ""
  ) {
    return {
      header: `Bearer ${sb}`,
      source:
        "sb-access-token",
    };
  }

  const packed =
    cookieStore.get(
      "supabase-auth-token"
    )?.value || null;

  if (packed) {
    try {
      const parsed =
        JSON.parse(
          packed
        );

      if (
        Array.isArray(
          parsed
        ) &&
        typeof parsed[0] ===
        "string" &&
        parsed[0]
      ) {
        return {
          header: `Bearer ${parsed[0]}`,
          source:
            "supabase-auth-token[0]",
        };
      }

      if (
        parsed &&
        typeof parsed ===
        "object" &&
        typeof parsed
          .access_token ===
        "string"
      ) {
        return {
          header: `Bearer ${parsed.access_token}`,
          source:
            "supabase-auth-token.access_token",
        };
      }
    } catch { }
  }

  return {
    header:
      undefined as
      | string
      | undefined,
    source: "none",
  };
}

export async function GET() {
  const dbg: Record<
    string,
    any
  > = {};

  try {
    const API =
      resolveApiUrl(
        "http://localhost"
      );

    const hdrs =
      await nextHeaders();

    const cookieStore =
      await nextCookies();

    const allCookies =
      cookieStore
        .getAll()
        .map(
          (c) => c.name
        );

    const picked =
      pickBearer(
        cookieStore
      );

    dbg.route =
      "GET /api/auth/me";

    dbg.api = API;

    dbg.cookies =
      allCookies;

    dbg.token_source =
      picked.source;

    dbg.token_mask =
      mask(
        picked.header?.replace(
          /^Bearer\s+/i,
          ""
        )
      );

    const upstream =
      await fetch(
        `${API}/auth/me`,
        {
          method:
            "GET",
          headers: {
            Accept:
              "application/json",
            ...(picked.header
              ? {
                Authorization:
                  picked.header,
              }
              : {}),
            "x-correlation-id":
              hdrs.get(
                "x-correlation-id"
              ) || "",
          },
          cache:
            "no-store",
          credentials:
            "omit",
        }
      );

    let data: any;
    let raw = "";

    try {
      const parsed =
        await readJsonStrict(
          upstream
        );

      data =
        parsed.data;

      raw =
        parsed.raw;
    } catch (e: any) {
      return NextResponse.json(
        {
          id: null,
          role: null,
          user: null,
          error:
            "upstream_not_json",
          debug: {
            ...dbg,
            details:
              e?.raw ??
              null,
          },
        },
        {
          status: 200,
        }
      );
    }

    dbg.upstream_status =
      upstream.status;

    dbg.upstream_url =
      `${API}/auth/me`;

    dbg.upstream_body_snippet =
      raw?.slice(
        0,
        300
      );

    if (!upstream.ok) {
      const msg =
        data?.error ||
        data?.message ||
        `auth_me_upstream_${upstream.status}`;

      const res =
        NextResponse.json(
          {
            id: null,
            role: null,
            user: null,
            error: msg,
            debug: dbg,
          },
          {
            status: 200,
          }
        );

      res.headers.set(
        "Vary",
        "Cookie, Authorization"
      );

      return res;
    }

    const id =
      data?.id ??
      data?.user?.id ??
      null;

    const role =
      data?.role ??
      data?.user?.role ??
      null;

    const user =
      data ?? null;

    dbg.resolved_id =
      id;

    dbg.resolved_role =
      role;

    const res =
      NextResponse.json(
        {
          id,
          role,
          user,
          debug: dbg,
        },
        {
          status: 200,
        }
      );

    res.headers.set(
      "Vary",
      "Cookie, Authorization"
    );

    return res;
  } catch (e: any) {
    return NextResponse.json(
      {
        id: null,
        role: null,
        user: null,
        error:
          "internal_error",
        debug: dbg,
      },
      {
        status: 200,
      }
    );
  }
}