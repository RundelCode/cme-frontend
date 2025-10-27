"use client";

import { useCallback, useEffect, useState } from "react";

export type Filters = {
  q: string;
  projectType: string;
  paymentType: string;
  minSalary: number | "";
  maxSalary: number | "";
  location: string;
  orderBy: "newest" | "oldest" | "salary_desc" | "salary_asc";
};

export type JobOffer = {
  id: string;
  company_id: string;
  title: string;
  description?: string | null;
  employment_type?: string | null;
  location_type?: string | null;
  skills?: string[] | null;
  location?: string | null;
  salary?: number | null;
  currency?: string | null;
  created_at: string;
  status: string;
};

type SearchResp = { items: JobOffer[]; total: number };

function toQS(params: Record<string, any>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export function useJobSearch(initial: {
  filters: Filters;
  limit?: number;
  offset?: number;
}) {
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [limit, setLimit] = useState(initial.limit ?? 12);
  const [offset, setOffset] = useState(initial.offset ?? 0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<JobOffer[]>([]);

  const buildQuery = (f: Filters) => ({
    q: f.q || undefined,
    employmentType: f.projectType || undefined,
    location: f.location || undefined,
    minSalary: f.minSalary === "" ? undefined : Number(f.minSalary),
    maxSalary: f.maxSalary === "" ? undefined : Number(f.maxSalary),
    orderBy: f.orderBy,
  });

  const run = useCallback(
    async (f = filters, l = limit, o = offset) => {
      setLoading(true);
      setError(null);

      try {
        const qs = toQS({ ...buildQuery(f), limit: l, offset: o });
        const res = await fetch(`/api/jobs/search${qs}`, {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "include",
        });

        const json = await res.json().catch(async () => {
          const txt = await res.text();
          throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
        });

        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

        const data = json as SearchResp;
        if (!data || !Array.isArray(data.items)) {
          throw new Error("Respuesta REST sin 'items'");
        }

        setItems(data.items);
        setTotal(data.total ?? 0);
      } catch (e: any) {
        setError(e?.message ?? "Error cargando ofertas");
      } finally {
        setLoading(false);
      }
    },
    [filters, limit, offset]
  );

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (nextFilters: Filters) => {
    setFilters(nextFilters);
    setOffset(0);
    await run(nextFilters, limit, 0);
  };

  const goToPage = async (page: number) => {
    const o = page * limit;
    setOffset(o);
    await run(filters, limit, o);
  };

  return {
    state: { filters, limit, offset, total, items, loading, error },
    actions: { submit, setLimit, goToPage, refetch: run },
  };
}
