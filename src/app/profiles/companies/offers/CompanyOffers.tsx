"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "../companyProfile.module.css";
import { Target } from "lucide-react";

const GQL =
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ??
  process.env.GRAPHQL_ENDPOINT ??
  "/api/graphql";

async function gql<T>(query: string, variables?: any) {
  const res = await fetch(GQL, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.errors?.[0]?.message ?? `GraphQL failed (${res.status})`);
  }
  return json.data as T;
}

type JobOffer = {
  id: string;
  title: string;
  location?: string | null;
  employment_type?: string | null;
  status?: string | null;
  created_at: string;
};

type JobSearchResult = {
  total: number;
  items: JobOffer[];
};

const JOB_SEARCH = `
  query JobSearch($input: JobSearchInput!, $limit: Int, $offset: Int) {
    jobSearch(input: $input, limit: $limit, offset: $offset) {
      total
      items {
        id
        title
        location
        employment_type
        status
        created_at
      }
    }
  }
`;

export default function CompanyOffers({ companyId }: { companyId: string }) {
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 10;

  const vars = useMemo(
    () => ({
      input: { companyId },
      limit,
      offset: page * limit,
    }),
    [companyId, page]
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const data = await gql<{ jobSearch: JobSearchResult }>(JOB_SEARCH, vars);
        setOffers(data.jobSearch?.items ?? []);
        setTotal(data.jobSearch?.total ?? 0);
      } catch (e: any) {
        setErr(e?.message ?? "Error cargando ofertas");
      } finally {
        setLoading(false);
      }
    })();
  }, [vars]);

  if (loading) return <p className={styles.muted}>Cargando ofertas…</p>;
  if (err) return <p className={styles.errorCard}>{err}</p>;
  if (!offers.length) return <p className={styles.muted}>Esta empresa no tiene ofertas públicas.</p>;

  const canNext = (page + 1) * limit < total;

  return (
    <div className={styles.offersBlock}>
      <ul className={styles.offerList}>
        {offers.map((o) => (
          <li key={o.id} className={styles.offerItem}>
            <div className={styles.offerTitle}>{o.title}</div>
            <div className={styles.offerMeta}>
              <span>{o.location ?? "Ubicación no especificada"}</span>
              <span className={styles.dot}>·</span>
              <span>{o.employment_type ?? "Tipo no especificado"}</span>
              <span className={styles.dot}>·</span>
              <span className={styles.tag}>{o.status ?? "—"}</span>
            </div>
            <a className={styles.offerLink} href={`/jobs/${o.id}`} target="_blank">Ver oferta</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
