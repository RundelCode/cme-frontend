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
  | { total?: number; items?: JobOffer[] }
  | JobOffer[]
  | { jobs?: JobOffer[]; total?: number }
  | { data?: { total?: number; items?: JobOffer[] } };

const API_SEARCH = "/api/jobs/search";

function parseSearch(resp: RestSearchResponse): { items: JobOffer[]; total: number } {
  if (resp && typeof resp === "object" && "data" in resp && (resp as any).data) {
    const d = (resp as any).data;
    const items = Array.isArray(d?.items) ? d.items : [];
    const total = Number.isFinite(d?.total) ? d.total : items.length;
    return { items, total };
  }
  if (resp && typeof resp === "object" && "items" in resp) {
    const items = Array.isArray((resp as any).items) ? (resp as any).items : [];
    const total = Number.isFinite((resp as any).total) ? (resp as any).total : items.length;
    return { items, total };
  }
  if (resp && typeof resp === "object" && "jobs" in resp) {
    const items = Array.isArray((resp as any).jobs) ? (resp as any).jobs : [];
    const total = Number.isFinite((resp as any).total) ? (resp as any).total : items.length;
    return { items, total };
  }
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
    s.set("orderBy", "created_at_desc");
    return s.toString();
  }, [companyId, page]);

  useEffect(() => {
    let cancelled = false;
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

        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();
        let json: any = null;

        if (contentType.includes("application/json")) {
          try { json = text ? JSON.parse(text) : null; } catch {
            throw new Error(`Respuesta JSON inválida. Fragmento: ${text.slice(0, 180)}`);
          }
        } else {
          const frag = text.slice(0, 180);
          throw new Error(`Respuesta no JSON (${contentType || "desconocido"}). Fragmento: ${frag}`);
        }

        if (!res.ok) {
          const msg = json?.error || json?.message || `Búsqueda falló (${res.status})`;
          throw new Error(msg);
        }

        const parsed = parseSearch(json);
        if (!cancelled) {
          setOffers(parsed.items || []);
          setTotal(parsed.total || 0);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message ?? "Error cargando ofertas");
          setOffers([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [qs]);

  if (loading) return <p className={styles.muted}>Cargando ofertas…</p>;
  if (err) return <p className={styles.errorCard}>{err}</p>;
  if (!offers.length) return <p className={styles.muted}>Esta empresa no tiene ofertas públicas.</p>;

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
