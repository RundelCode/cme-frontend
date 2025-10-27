// src/app/profile/company/offers/CompanyOffers.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "../companyProfile.module.css";

type JobOffer = {
  id: string;
  title: string;
  location?: string | null;
  employment_type?: string | null;
  status?: string | null;
  created_at: string;
};

type RestSearchResponse =
  | { total?: number; items?: JobOffer[] }                // forma 1: { total, items }
  | JobOffer[]                                           // forma 2: array directo
  | { jobs?: JobOffer[]; total?: number }                // forma 3: { jobs, total }
  | { data?: { total?: number; items?: JobOffer[] } };   // forma 4: { data: { total, items } }

const API_SEARCH = "/api/jobs/search";

function parseSearch(resp: RestSearchResponse): { items: JobOffer[]; total: number } {
  // forma 4
  if (resp && typeof resp === "object" && "data" in resp && (resp as any).data) {
    const d = (resp as any).data;
    return {
      items: Array.isArray(d?.items) ? d.items : [],
      total: Number.isFinite(d?.total) ? d.total : (Array.isArray(d?.items) ? d.items.length : 0),
    };
  }
  // forma 1
  if (resp && typeof resp === "object" && "items" in resp) {
    const items = Array.isArray((resp as any).items) ? (resp as any).items : [];
    const total = Number.isFinite((resp as any).total) ? (resp as any).total : items.length;
    return { items, total };
  }
  // forma 3
  if (resp && typeof resp === "object" && "jobs" in resp) {
    const items = Array.isArray((resp as any).jobs) ? (resp as any).jobs : [];
    const total = Number.isFinite((resp as any).total) ? (resp as any).total : items.length;
    return { items, total };
  }
  // forma 2 (array)
  if (Array.isArray(resp)) return { items: resp, total: resp.length };

  return { items: [], total: 0 };
}

export default function CompanyOffers({ companyId }: { companyId: string }) {
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 10;

  const qs = useMemo(() => {
    const s = new URLSearchParams();
    s.set("companyId", companyId);
    s.set("limit", String(limit));
    s.set("offset", String(page * limit));
    // Opcional: ordena por fecha desc si tu backend lo soporta
    s.set("orderBy", "created_at_desc");
    return s.toString();
  }, [companyId, page]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`${API_SEARCH}?${qs}`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text();
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { }

        if (!res.ok) {
          const msg = json?.error || json?.message || `Búsqueda falló (${res.status})`;
          throw new Error(msg);
        }

        const parsed = parseSearch(json);
        setOffers(parsed.items || []);
        setTotal(parsed.total || 0);
      } catch (e: any) {
        setErr(e?.message ?? "Error cargando ofertas");
        setOffers([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    })();
  }, [qs]);

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
            <a className={styles.offerLink} href={`/jobs/${o.id}`} target="_blank" rel="noreferrer">
              Ver oferta
            </a>
          </li>
        ))}
      </ul>

    </div>
  );
}
