import { NextResponse } from "next/server";

type ApplicationRow = {
  id: string;
  job_offer_id: string;
  candidate_id: string;
  accepted: boolean;
  notes?: string | null;
  created_at: string;
};

type ProfileMini = {
  full_name?: string | null;
  profile_picture?: string | null;
  occupation?: string | null;
  reputation_score?: number | null;
};

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

function resolveApiUrl(reqUrl: string) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  try {
    new URL(base);
    return base.replace(/\/$/, "");
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/$/, "");
  }
}

export async function GET(req: Request) {
  try {
    const API = resolveApiUrl(req.url);
    const url = new URL(req.url);
    const jobOfferId = url.searchParams.get("jobOfferId");
    const candidateId = url.searchParams.get("candidateId");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (!jobOfferId) {
      return NextResponse.json({ error: "jobOfferId es requerido" }, { status: 400 });
    }

    const cookieHeader = req.headers.get("cookie") ?? "";
    const access = getCookieValue(cookieHeader, "access_token") ?? "";
    const headers = new Headers({ accept: "application/json" });
    if (access) headers.set("Authorization", `Bearer ${access}`);

    const qs = new URLSearchParams();
    qs.set("jobOfferId", jobOfferId);
    if (candidateId) qs.set("candidateId", candidateId);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));

    const appsRes = await fetch(`${API}/applications?${qs.toString()}`, {
      headers,
      cache: "no-store",
      credentials: "include",
    });
    if (!appsRes.ok) {
      const txt = await appsRes.text().catch(() => "");
      return NextResponse.json({ error: txt || "Error listando applications" }, { status: appsRes.status });
    }
    const items: ApplicationRow[] = await appsRes.json();
    const ids = Array.from(new Set(items.map((a) => a.candidate_id))).filter(Boolean) as string[];

    if (ids.length === 0) {
      return NextResponse.json({ limit, offset, count: 0, items, people: [] });
    }

    let profilesById = new Map<
      string,
      { name: string | null; photo: string | null; occupation: string | null; reputation: number | null }
    >();
    let fetchedOk = false;

    try {
      const pr = await fetch(`${API}/profiles/search`, {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          accept: "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        }),
        body: JSON.stringify({ ids, sortBy: "reputation", order: "desc", limit: ids.length }),
        cache: "no-store",
        credentials: "include",
      });
      if (pr.ok) {
        const list: Array<{ id: string } & ProfileMini> = await pr.json();
        profilesById = new Map(
          (list || []).map((p) => [
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
      }
    } catch {
      fetchedOk = false;
    }

    if (!fetchedOk) {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await fetch(`${API}/profiles/${id}`, {
              headers,
              cache: "no-store",
              credentials: "include",
            });
            if (!r.ok) throw new Error();
            const p: ProfileMini = await r.json();
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
            return [id, { name: null, photo: null, occupation: null, reputation: null }] as const;
          }
        })
      );
      profilesById = new Map(results);
    }

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

    return NextResponse.json({ limit, offset, count: items.length, items, people });
  } catch (err: any) {
    const msg = String(err?.message || "Error listando applications");
    if (msg.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const API = resolveApiUrl(req.url);
    const { jobId, notes } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "jobId es requerido" }, { status: 400 });
    }

    const cookieHeader = req.headers.get("cookie") ?? "";
    const access = getCookieValue(cookieHeader, "access_token") ?? "";

    const meRes = await fetch(`${API}/auth/me`, {
      headers: new Headers({
        accept: "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      }),
      cache: "no-store",
      credentials: "include",
    });
    if (!meRes.ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const me = await meRes.json();
    const candidateId = me?.id;
    if (!candidateId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const createRes = await fetch(`${API}/applications`, {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      }),
      body: JSON.stringify({ jobOfferId: jobId, candidateId, notes }),
      cache: "no-store",
      credentials: "include",
    });

    if (createRes.status === 409) {
      return NextResponse.json({ error: "Ya aplicaste a esta oferta." }, { status: 409 });
    }
    if (createRes.status === 401) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!createRes.ok) {
      const txt = await createRes.text().catch(() => "");
      return NextResponse.json({ error: txt || "Error creando aplicación" }, { status: createRes.status });
    }

    const data: ApplicationRow = await createRes.json();
    return NextResponse.json(data);
  } catch (err: any) {
    const msg = String(err?.message || "Error creando aplicación");
    if (msg.includes("already_applied")) {
      return NextResponse.json({ error: "Ya aplicaste a esta oferta." }, { status: 409 });
    }
    if (msg.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
