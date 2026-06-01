import { NextResponse } from "next/server";
import {
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

const ALLOWED_ROLES = new Set([
  "company_admin",
  "headhunter",
  "candidate",
]);

function isValidEmail(
  email: unknown
): email is string {
  return (
    typeof email ===
    "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

export async function POST(
  req: Request
) {
  try {
    const {
      email,
      password,
      fullName,
      phone,
      role,
    } = await req.json();

    const normalizedRole =
      String(
        role || ""
      ).trim();

    if (
      !ALLOWED_ROLES.has(
        normalizedRole
      )
    ) {
      return NextResponse.json(
        {
          error: `Role inválido. Usa uno de: ${[
            ...ALLOWED_ROLES,
          ].join(", ")}`,
        },
        {
          status: 400,
        }
      );
    }

    if (
      !isValidEmail(email)
    ) {
      return NextResponse.json(
        {
          error:
            "Email inválido",
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof password !==
      "string" ||
      password.length < 6
    ) {
      return NextResponse.json(
        {
          error:
            "Password requerido (mínimo 6 caracteres)",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !fullName ||
      typeof fullName !==
      "string"
    ) {
      return NextResponse.json(
        {
          error:
            "fullName es requerido",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !phone ||
      typeof phone !==
      "string"
    ) {
      return NextResponse.json(
        {
          error:
            "phone es requerido",
        },
        {
          status: 400,
        }
      );
    }

    const API =
      resolveApiUrl(req);

    const upstream =
      await fetch(
        `${API}/auth/signup`,
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
              "application/json",
          },
          body: JSON.stringify(
            {
              email,
              password,
              fullName,
              phone,
              role: normalizedRole,
            }
          ),
          cache:
            "no-store",
          credentials:
            "include",
        }
      );

    let data: any;

    try {
      const parsed =
        await readJsonStrict(
          upstream
        );

      data =
        parsed.data;
    } catch (e: any) {
      return NextResponse.json(
        {
          error:
            "upstream_not_json",
          details:
            e?.raw ??
            null,
        },
        {
          status: 502,
        }
      );
    }

    if (!upstream.ok) {
      const msg =
        data?.error ||
        data?.message ||
        `auth_signup_upstream_${upstream.status}`;

      const status =
        /conflict|already|23505/i.test(
          String(msg)
        )
          ? 409
          : upstream.status ||
          400;

      return NextResponse.json(
        {
          error: msg,
        },
        {
          status,
        }
      );
    }

    const user =
      data?.user ||
      data?.profile ||
      null;

    const session =
      data?.session ||
      data;

    const accessToken =
      session?.access_token ||
      session?.accessToken ||
      session?.access ||
      data?.access_token;

    const refreshToken =
      session?.refresh_token ||
      session?.refreshToken ||
      session?.refresh ||
      data?.refresh_token;

    if (!accessToken) {
      return NextResponse.json(
        {
          user,
        },
        {
          status: 201,
        }
      );
    }

    const res =
      NextResponse.json(
        {
          user,
        },
        {
          status: 201,
        }
      );

    res.cookies.set(
      "access_token",
      String(
        accessToken
      ),
      {
        httpOnly: true,
        secure:
          process.env
            .NODE_ENV ===
          "production",
        sameSite:
          "lax",
        path: "/",
        maxAge:
          60 * 60,
      }
    );

    if (refreshToken) {
      res.cookies.set(
        "refresh_token",
        String(
          refreshToken
        ),
        {
          httpOnly: true,
          secure:
            process.env
              .NODE_ENV ===
            "production",
          sameSite:
            "lax",
          path: "/",
          maxAge:
            60 *
            60 *
            24 *
            7,
        }
      );
    }

    return res;
  } catch (err: any) {
    return NextResponse.json(
      {
        error:
          err?.message ||
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}