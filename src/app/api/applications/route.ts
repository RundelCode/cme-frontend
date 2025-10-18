import { NextResponse } from "next/server";
import { gqlRequest } from "../../../../lib/gql";
import {
  AUTH_ME,
  CREATE_APPLICATION,
  APPLICATIONS,
  PROFILE_BY_ID_MIN,
  SEARCH_PROFILES_MIN,
} from "../../../../lib/queries";

type AuthMeResp = { authMe: { id: string } | null };

type CreateApplicationResp = {
  createApplication: {
    id: string;
    job_offer_id: string;
    candidate_id: string;
    accepted: boolean;
    notes?: string | null;
    created_at: string;
  };
};

type ApplicationsResp = {
  applications: Array<{
    id: string;
    job_offer_id: string;
    candidate_id: string;
    accepted: boolean;
    notes?: string | null;
    created_at: string;
  }>;
};

// --- util: obtener una cookie desde el header Cookie ---
function getCookieValue(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(/;\s*/);
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (k === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const ENDPOINT = process.env.GRAPHQL_ENDPOINT;
    if (!ENDPOINT) {
      return NextResponse.json(
        { error: "GRAPHQL_ENDPOINT no definido" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const jobOfferId = url.searchParams.get("jobOfferId");
    const candidateId = url.searchParams.get("candidateId");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const offset = Number(url.searchParams.get("offset") ?? "0");

    if (!jobOfferId) {
      return NextResponse.json(
        { error: "jobOfferId es requerido" },
        { status: 400 }
      );
    }

    // —— Cookies y Authorization a partir de req.headers ——
    const cookieHeader = req.headers.get("cookie") ?? "";
    const access = getCookieValue(cookieHeader, "access_token") ?? "";

    const h = new Headers({
      "content-type": "application/json",
      accept: "application/json",
    });
    if (access) h.set("Authorization", `Bearer ${access}`);

    // 1) Obtener applications
    const apps = await gqlRequest<ApplicationsResp>(
      ENDPOINT,
      APPLICATIONS,
      { jobOfferId, candidateId, limit, offset },
      h,
      cookieHeader
    );

    const items = apps.applications ?? [];
    const ids = Array.from(new Set(items.map((a) => a.candidate_id))).filter(
      Boolean
    ) as string[];

    if (ids.length === 0) {
      return NextResponse.json({
        limit,
        offset,
        count: 0,
        items,
        people: [],
      });
    }

    // 2) Intentar obtener perfiles por ids (searchProfiles), con fallback a profile(id)
    let profilesById = new Map<
      string,
      {
        name: string | null;
        photo: string | null;
        occupation: string | null;
        reputation: number | null;
      }
    >();
    let fetchedOk = false;

    try {
      const pr = await gqlRequest<{
        searchProfiles: Array<{
          id: string;
          full_name?: string | null;
          profile_picture?: string | null;
          occupation?: string | null;
          reputation_score?: number | null;
        }>;
      }>(
        ENDPOINT,
        SEARCH_PROFILES_MIN,
        {
          input: {
            ids,
            sortBy: "REPUTATION",
            order: "DESC",
            limit: ids.length,
          },
        },
        h,
        cookieHeader
      );

      const list = pr.searchProfiles ?? [];
      profilesById = new Map(
        list.map((p) => [
          p.id,
          {
            name: p.full_name ?? null,
            photo: p.profile_picture ?? null,
            occupation: p.occupation ?? null,
            reputation: p.reputation_score ?? null,
          },
        ])
      );
      fetchedOk = true;
    } catch {
      fetchedOk = false;
    }

    if (!fetchedOk) {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await gqlRequest<{
              profile: {
                full_name?: string | null;
                profile_picture?: string | null;
                occupation?: string | null;
                reputation_score?: number | null;
              } | null;
            }>(ENDPOINT, PROFILE_BY_ID_MIN, { id }, h, cookieHeader);

            const p = r.profile;
            return [
              id,
              {
                name: p?.full_name ?? null,
                photo: p?.profile_picture ?? null,
                occupation: p?.occupation ?? null,
                reputation: p?.reputation_score ?? null,
              },
            ] as const;
          } catch {
            return [
              id,
              { name: null, photo: null, occupation: null, reputation: null },
            ] as const;
          }
        })
      );
      profilesById = new Map(results);
    }

    // 3) Merge + orden por reputación
    const people = items.map((a) => {
      const p = profilesById.get(a.candidate_id);
      return {
        profileId: a.candidate_id,
        name: p?.name ?? null,
        photo: p?.photo ?? null,
        occupation: p?.occupation ?? null,
        reputation: p?.reputation ?? null,
        appliedAt: a.created_at,
      };
    });
    people.sort((a, b) => (b.reputation ?? -1) - (a.reputation ?? -1));

    return NextResponse.json({
      limit,
      offset,
      count: items.length,
      items,
      people,
    });
  } catch (err: any) {
    const msg = String(err?.message || "Error listando applications");
    if (msg.toLowerCase().includes("unauthorized") || err?.status === 401) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { jobId, notes } = await req.json();
    if (!jobId) {
      return NextResponse.json(
        { error: "jobId es requerido" },
        { status: 400 }
      );
    }

    const ENDPOINT = process.env.GRAPHQL_ENDPOINT;
    if (!ENDPOINT) {
      return NextResponse.json(
        { error: "GRAPHQL_ENDPOINT no definido" },
        { status: 500 }
      );
    }

    // —— Cookies y Authorization desde req.headers ——
    const cookieHeader = req.headers.get("cookie") ?? "";
    const access = getCookieValue(cookieHeader, "access_token") ?? "";

    const h = new Headers({
      "content-type": "application/json",
      accept: "application/json",
    });
    if (access) h.set("Authorization", `Bearer ${access}`);

    // quién soy
    const me = await gqlRequest<AuthMeResp>(
      ENDPOINT,
      AUTH_ME,
      {},
      h,
      cookieHeader
    );
    const candidateId = me?.authMe?.id;
    if (!candidateId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // crear application
    const data = await gqlRequest<CreateApplicationResp>(
      ENDPOINT,
      CREATE_APPLICATION,
      { jobOfferId: jobId, candidateId, notes },
      h,
      cookieHeader
    );

    return NextResponse.json(data.createApplication);
  } catch (err: any) {
    const msg = String(err?.message || "Error creando aplicación");

    if (msg.includes("already_applied") || err?.status === 409) {
      return NextResponse.json(
        { error: "Ya aplicaste a esta oferta." },
        { status: 409 }
      );
    }
    if (msg.toLowerCase().includes("unauthorized") || err?.status === 401) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
