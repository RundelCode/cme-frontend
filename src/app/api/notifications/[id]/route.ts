import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthHeader,
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

async function readJson(res: Response) {
  const { data, raw } = await readJsonStrict(res);
  return { data, raw };
}

export async function GET(
  req: NextRequest,
  context: any
) {
  const url = new URL(req.url);

  const debug =
    url.searchParams.get("__debug") ===
    "1" ||
    req.headers.get("x-debug") ===
    "1";

  try {
    const id =
      context?.params?.id;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "missing_id",
        },
        {
          status: 400,
        }
      );
    }

    const API =
      resolveApiUrl(req);

    const authorization =
      buildAuthHeader(req);

    const cookie =
      req.headers.get(
        "cookie"
      ) ?? "";

    const upstream =
      await fetch(
        `${API}/notifications/${encodeURIComponent(
          id
        )}`,
        {
          method: "GET",
          headers: {
            Accept:
              "application/json",
            ...(authorization
              ? {
                Authorization:
                  authorization,
              }
              : {}),
            ...(cookie
              ? {
                cookie,
              }
              : {}),
          },
          cache:
            "no-store",
          credentials:
            "include",
        }
      );

    const {
      data,
      raw,
    } = await readJson(
      upstream
    );

    if (
      !upstream.ok ||
      !data?.id
    ) {
      const msg =
        data?.error ||
        data?.message ||
        `notifications_upstream_${upstream.status}`;

      const payload =
        debug
          ? {
            error:
              msg,
            __debug:
            {
              status:
                upstream.status,
              raw:
                data ??
                raw,
            },
          }
          : {
            error:
              msg,
          };

      return NextResponse.json(
        payload,
        {
          status:
            upstream.status ||
            500,
        }
      );
    }

    return NextResponse.json(
      debug
        ? {
          notification:
            data,
          __debug:
          {
            status:
              upstream.status,
          },
        }
        : {
          notification:
            data,
        },
      {
        status: 200,
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ||
          "notification_get_failed",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: any
) {
  const url = new URL(req.url);

  const debug =
    url.searchParams.get("__debug") ===
    "1" ||
    req.headers.get("x-debug") ===
    "1";

  try {
    const id =
      context?.params?.id;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "missing_id",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      await req
        .json()
        .catch(
          () => ({})
        );

    const status =
      typeof body?.status ===
        "string" &&
        body.status.trim()
        ? body.status
        : undefined;

    const rawReadAt =
      body?.readAt;

    let readAt:
      | string
      | undefined;

    if (
      rawReadAt ===
      true ||
      rawReadAt ===
      "now"
    ) {
      readAt =
        new Date().toISOString();
    } else if (
      typeof rawReadAt ===
      "string" &&
      rawReadAt.trim()
    ) {
      readAt =
        rawReadAt;
    }

    if (
      !status &&
      !readAt
    ) {
      return NextResponse.json(
        {
          error:
            "nothing_to_update",
        },
        {
          status: 400,
        }
      );
    }

    const API =
      resolveApiUrl(req);

    const authorization =
      buildAuthHeader(req);

    const cookie =
      req.headers.get(
        "cookie"
      ) ?? "";

    const upstream =
      await fetch(
        `${API}/notifications/${encodeURIComponent(
          id
        )}`,
        {
          method:
            "PATCH",
          headers: {
            Accept:
              "application/json",
            "Content-Type":
              "application/json",
            ...(authorization
              ? {
                Authorization:
                  authorization,
              }
              : {}),
            ...(cookie
              ? {
                cookie,
              }
              : {}),
          },
          body: JSON.stringify(
            {
              status,
              readAt,
            }
          ),
          cache:
            "no-store",
          credentials:
            "include",
        }
      );

    const {
      data,
      raw,
    } = await readJson(
      upstream
    );

    if (
      !upstream.ok
    ) {
      const msg =
        data?.error ||
        data?.message ||
        `notifications_upstream_${upstream.status}`;

      const payload =
        debug
          ? {
            error:
              msg,
            __debug:
            {
              status:
                upstream.status,
              raw:
                data ??
                raw,
            },
          }
          : {
            error:
              msg,
          };

      return NextResponse.json(
        payload,
        {
          status:
            upstream.status ||
            500,
        }
      );
    }

    return NextResponse.json(
      debug
        ? {
          notification:
            data,
          __debug:
          {
            status:
              upstream.status,
          },
        }
        : {
          notification:
            data,
        },
      {
        status: 200,
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ||
          "notification_update_failed",
      },
      {
        status: 500,
      }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
    }
  );
}