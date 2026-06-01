import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildAuthHeader,
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

async function readUpstream(res: Response) {
  try {
    const { data, raw } = await readJsonStrict(res);

    return {
      ok: res.ok,
      status: res.status,
      data,
      text: raw,
      url: res.url,
      ctype:
        res.headers.get("content-type") ||
        "",
    };
  } catch (e: any) {
    return {
      ok: res.ok,
      status: res.status,
      data: null,
      text: e?.raw ?? "",
      url: res.url,
      ctype:
        res.headers.get("content-type") ||
        "",
    };
  }
}

function mapOrderBy(
  v: string | null | undefined
) {
  switch (
  (v || "").toLowerCase()
  ) {
    case "newest":
      return "created_at_desc";

    case "oldest":
      return "created_at_asc";

    case "salary_desc":
      return "salary_desc";

    case "salary_asc":
      return "salary_asc";

    default:
      return (
        v ||
        "created_at_desc"
      );
  }
}

export async function GET(
  req: NextRequest
) {
  try {
    const API =
      resolveApiUrl(req);

    const url = new URL(req.url);

    const authorization =
      buildAuthHeader(req);

    const cookie =
      req.headers.get("cookie") ??
      "";

    const limit =
      url.searchParams.get(
        "limit"
      ) || "10";

    const offset =
      url.searchParams.get(
        "offset"
      ) || "0";

    const orderBy =
      mapOrderBy(
        url.searchParams.get(
          "orderBy"
        )
      );

    const qs =
      new URLSearchParams();

    const copyKeys = [
      "q",
      "employmentType",
      "locationType",
      "location",
      "companyId",
      "status",
      "minSalary",
      "maxSalary",
    ];

    for (const k of copyKeys) {
      const v =
        url.searchParams.get(k);

      if (
        v != null &&
        v !== ""
      ) {
        qs.set(k, v);
      }
    }

    const projectType =
      url.searchParams.get(
        "projectType"
      );

    if (
      projectType &&
      !qs.get(
        "employmentType"
      )
    ) {
      qs.set(
        "employmentType",
        projectType
      );
    }

    const paymentType =
      url.searchParams.get(
        "paymentType"
      );

    if (
      paymentType &&
      !qs.get(
        "paymentType"
      )
    ) {
      qs.set(
        "paymentType",
        paymentType
      );
    }

    const skillsAnyAll = [
      "skillsAny",
      "skillsAll",
    ];

    for (const key of skillsAnyAll) {
      const arr =
        url.searchParams.getAll(
          `${key} []`
        );

      for (const v of arr) {
        if (v) {
          qs.append(
            `${key} []`,
            v
          );
        }
      }

      const single =
        url.searchParams.get(
          key
        );

      if (single) {
        qs.append(
          `${key} []`,
          single
        );
      }
    }

    qs.set("limit", limit);
    qs.set("offset", offset);
    qs.set("orderBy", orderBy);

    const target =
      `${API} /jobs/search ? ${qs.toString()} `;

    const headers: HeadersInit =
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

    const r = await fetch(
      target,
      {
        method: "GET",
        headers,
        cache: "no-store",
        credentials:
          "include",
      }
    );

    const parsed =
      await readUpstream(r);

    if (
      !parsed.ok ||
      !(
        parsed.ctype.includes(
          "application/json"
        ) ||
        typeof parsed.data ===
        "object"
      )
    ) {
      const status =
        parsed.status || 502;

      return NextResponse.json(
        {
          total: 0,
          items: [],
          error:
            `jobs_upstream_${status} `,
        },
        {
          status,
        }
      );
    }

    const payload =
      parsed.data ?? {};

    const normalized =
      Array.isArray(payload)
        ? {
          total:
            payload.length,
          items: payload,
        }
        : payload?.data &&
          typeof payload.data ===
          "object"
          ? {
            total: Number(
              payload.data
                .total ??
              (payload.data
                .items
                ?.length ||
                0)
            ),
            items:
              payload.data
                .items ?? [],
          }
          : {
            total: Number(
              payload.total ??
              (payload.items
                ?.length ||
                0)
            ),
            items:
              payload.items ??
              payload.jobs ??
              [],
          };

    return NextResponse.json(
      {
        total:
          normalized.total ||
          0,
        items:
          normalized.items ||
          [],
      },
      {
        status: 200,
      }
    );
  } catch (e: any) {
    const msg =
      e?.message ||
      "jobs_search_proxy_error";

    const isAuth =
      /unauthorized|forbidden|token|auth/i.test(
        msg
      );

    return NextResponse.json(
      {
        total: 0,
        items: [],
        error: msg,
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