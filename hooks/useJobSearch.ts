"use client";

import { useCallback, useEffect, useState } from "react";
import { JOB_SEARCH } from "../lib/queries";

export async function gql<T>(query: string, variables?: Record<string, unknown>) {
  const res = await fetch("/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ query, variables }),
  });

  let json: any = null;
  try { json = await res.json(); } catch {
    const text = await res.text();
    throw new Error(`GraphQL: respuesta no JSON (${res.status}): ${text.slice(0, 150)}`);
  }
  if (!res.ok) throw new Error(json?.errors?.[0]?.message ?? `HTTP ${res.status}`);
  if (json?.errors?.length) throw new Error(json.errors[0]?.message ?? "GraphQL error");
  if (!json?.data) throw new Error("GraphQL: respuesta sin 'data'");

  return json.data as T;
}

const TAG = "[useJobSearch]";

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

type JobSearchResponse = {
  jobSearch?: { total?: number; items?: JobOffer[] };
};

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

  const buildInput = (f: Filters) => {
    const input = {
      q: f.q || undefined,
      employmentType: f.projectType || undefined,
      location: f.location || undefined,
      minSalary: f.minSalary === "" ? undefined : f.minSalary,
      maxSalary: f.maxSalary === "" ? undefined : f.maxSalary,
      orderBy: f.orderBy,
    } as const;
    console.log(`${TAG} buildInput ->`, input);
    return input;
  };

  const run = useCallback(
    async (f = filters, l = limit, o = offset) => {
      setLoading(true);
      setError(null);

      const input = buildInput(f);
      const started = performance.now();
      console.log(`${TAG} run() →`, { input, limit: l, offset: o });

      try {
        const data = await gql<JobSearchResponse>(JOB_SEARCH, { input, limit: l, offset: o });
        const jobSearch = data?.jobSearch;
        if (!jobSearch || !Array.isArray(jobSearch.items)) {
          console.error(`${TAG} respuesta mal formada:`, data);
          throw new Error("Respuesta GraphQL sin 'jobSearch.items'");
        }

        const dur = Math.round(performance.now() - started);
        console.log(`${TAG} response (${dur}ms) → total:`, jobSearch.total, "items:", jobSearch.items.length);

        setItems(jobSearch.items);
        setTotal(jobSearch.total ?? 0);
      } catch (e: any) {
        console.error(`${TAG} error →`, e?.message ?? e);
        setError(e?.message ?? "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [filters, limit, offset]
  );

  useEffect(() => {
    console.log(`${TAG} mount →`, { filters, limit, offset });
    run();
  }, []);

  const submit = async (nextFilters: Filters) => {
    console.log(`${TAG} submit() →`, nextFilters);
    setFilters(nextFilters);
    setOffset(0);
    await run(nextFilters, limit, 0);
  };

  const goToPage = async (page: number) => {
    const o = page * limit;
    console.log(`${TAG} goToPage(${page}) → offset:`, o);
    setOffset(o);
    await run(filters, limit, o);
  };

  return {
    state: { filters, limit, offset, total, items, loading, error },
    actions: { submit, setLimit, goToPage, refetch: run },
  };
}
