import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildAuthHeader,
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

async function fetchJsonDebug(
  url: string,
  init: RequestInit
) {
  const res = await fetch(
    url,
    init
  );

  let data: any = null;
  let raw = "";

  try {
    const parsed =
      await readJsonStrict(
        res
      );

    data =
      parsed.data;

    raw =
      parsed.raw;
  } catch (e: any) {
    raw =
      e?.raw ?? "";
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      `upstream_error(${res.status})`;

    const detail = {
      url,
      status:
        res.status,
      raw: raw?.slice(
        0,
        500
      ),
    };

    console.error(
      "[profiles/batch] Upstream error:",
      msg,
      detail
    );

    const err: any =
      new Error(msg);

    err.status =
      res.status;

    err.raw = raw;

    throw err;
  }

  return data ?? null;
}

export async function POST(
  req: NextRequest
) {
  const debug: Record<
    string,
    any
  > = {};

  try {
    const body =
      await req
        .json()
        .catch(
          () => ({})
        );

    const ids: string[] =
      Array.isArray(
        body?.ids
      )
        ? body.ids
        : [];

    if (!ids.length) {
      return NextResponse.json(
        {
          profiles: [],
        },
        {
          status: 200,
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

    const commonHeaders: HeadersInit =
    {
      Accept:
        "application/json",
      ...(authorization
        ? {
          Authorization:
            authorization,
        }
        : {}),
      ...(cookie
        ? { cookie }
        : {}),
    };

    try {
      const url =
        `${API} /profiles/batch`;

      debug.postUrl =
        url;

      const data =
        await fetchJsonDebug(
          url,
          {
            method:
              "POST",
            headers: {
              ...commonHeaders,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              {
                ids,
              }
            ),
            cache:
              "no-store",
            credentials:
              "include",
          }
        );

      const profiles =
        Array.isArray(
          data
        )
          ? data
          : data?.profiles ??
          [];

      return NextResponse.json(
        {
          profiles,
        }
      );
    } catch (e: any) {
      debug.postErr =
        e?.message ||
        String(e);
    }

    try {
      const url =
        `${API}/profiles?ids=${encodeURIComponent(
          ids.join(",")
        )}`;

      debug.getUrl =
        url;

      const data =
        await fetchJsonDebug(
          url,
          {
            method:
              "GET",
            headers:
              commonHeaders,
            cache:
              "no-store",
            credentials:
              "include",
          }
        );

      const profiles =
        Array.isArray(
          data
        )
          ? data
          : data?.profiles ??
          [];

      return NextResponse.json(
        {
          profiles,
        }
      );
    } catch (e: any) {
      debug.getErr =
        e?.message ||
        String(e);
    }

    try {
      debug.nRequests =
        ids.length;

      const results =
        await Promise.allSettled(
          ids.map(
            (id) =>
              fetchJsonDebug(
                `${API} /profiles/${encodeURIComponent(
                  id
                )
                } `,
                {
                  method:
                    "GET",
                  headers:
                    commonHeaders,
                  cache:
                    "no-store",
                  credentials:
                    "include",
                }
              )
          )
        );

      const profiles =
        results
          .filter(
            (
              r
            ): r is PromiseFulfilledResult<any> =>
              r.status ===
              "fulfilled"
          )
          .map(
            (r) =>
              r.value
          )
          .filter(
            Boolean
          );

      if (
        profiles.length ===
        0
      ) {
        return NextResponse.json(
          {
            profiles:
              [],
            error:
              "no_profiles_from_upstream",
            debug,
          },
          {
            status: 502,
          }
        );
      }

      return NextResponse.json(
        {
          profiles,
          debug,
        }
      );
    } catch (e: any) {
      debug.nRequestsErr =
        e?.message ||
        String(e);

      return NextResponse.json(
        {
          profiles:
            [],
          error:
            "profiles_batch_proxy_error",
          debug,
        },
        {
          status: 502,
        }
      );
    }
  } catch (e: any) {
    const msg =
      e?.message ||
      "profiles_batch_proxy_error";

    const isAuth =
      /unauthorized|forbidden|token|auth/i.test(
        msg
      );

    return NextResponse.json(
      {
        profiles: [],
        error: msg,
        debug,
      },
      {
        status: isAuth
          ? 401
          : 500,
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