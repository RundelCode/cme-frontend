"use client";
import { useEffect, useMemo, useState } from "react";
import FiltersBar from "../filters/FiltersBar";
import { useJobSearch, type Filters, type JobOffer } from "../../hooks/useJobSearch";
import { PropagateLoader } from "react-spinners";
import Image from "next/image";
import styles from "./jobs.module.css";
import PlaceholderCompany from "../../public/images/placeholders/company.png";
import LocationIcon from "../../public/images/icons/Location.png";
import DateIcon from "../../public/images/icons/calendar.png";

import { getCompany } from "../../lib/company-client";
import type { Company } from "../../lib/company-client";
import JobDetailClient from "../jobDetails/JobDetailContent";


function Modal({
  children,
  onClose,
  labelledBy = "modal-title",
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const { body } = document;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={styles.modalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalBody} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.modalClose}
          aria-label="Cerrar"
          onClick={onClose}
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

const DEFAULTS: Filters = {
  q: "",
  projectType: "",
  paymentType: "",
  minSalary: "",
  maxSalary: "",
  location: "",
  orderBy: "newest",
};

function JobCard({
  job,
  company,
  onOpenDetails,
}: {
  job: JobOffer;
  company?: Company | null;
  onOpenDetails: (jobId: string) => void;
}) {
  const posted = new Date(job.created_at);
  const postedText = posted.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  const salaryText = formatSalary(job.salary, job.currency);
  const skills = job.skills ?? [];

  const name =
    company?.name ?? (job.company_id ? `Company #${short(job.company_id)}` : "Company");
  const logo = company?.profilePicture ?? null;
  const cover = company?.coverPhoto ?? null;
  const loc = company?.location ?? job.location ?? "—";

  return (
    <article className={styles.card}>
      <div className={styles.cover}>
        {cover ? (
          <Image src={cover} alt="" fill className={styles.coverImg} priority />
        ) : (
          <Image src={PlaceholderCompany} alt="" fill className={styles.coverImg} priority />
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.companyRow}>
          <div className={styles.companyAvatar}>
            {logo ? (
              <Image src={logo} alt={name} width={90} height={90} />
            ) : (
              <Image src={PlaceholderCompany} alt={name} width={90} height={90} />
            )}
          </div>
          <div className={styles.companyMeta}>
            <div className={styles.companyName}>
              {name} {company?.boolVerified ? "✦" : ""}
            </div>
            <div className={styles.companyLocation}>
              <Image className={styles.icon} src={LocationIcon} alt="Location" width={15} height={15} priority style={{marginRight: 5}} />
              {loc}
            </div>
            <div className={styles.chipsRow}>
              {chip(job.location_type)}
              {chip(job.employment_type)}
              {chip(job.status)}
            </div>
          </div>
        </div>

        <div className={styles.infoSection}>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>{job.title}</h3>
            {job.description && <p className={styles.desc}>{truncate(job.description, 220)}</p>}
          </div>

          {skills.length > 0 && (
            <div className={styles.skills}>
              {skills.slice(0, 8).map((s) => (
                <span key={s} className={styles.skill}>
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <div className={styles.posted}>
            <Image className={styles.icon} src={DateIcon} alt="Date" width={15} height={15} priority style={{marginRight: 5}} />
            Publicado el {postedText}</div>
          <div className={styles.salaryBlock}>
            <div className={styles.salaryLabel}>Rango salarial</div>
            <div className={styles.salaryValue}>{salaryText}</div>
          </div>
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => onOpenDetails(job.id)}
            >
              Ver Detalles
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatSalary(s?: number | null, currency?: string | null) {
  if (s == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 2,
    }).format(s);
  } catch {
    return `${s} ${currency ?? ""}`.trim();
  }
}
function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
function short(id: string) {
  if (!id) return "";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
function chip(v?: string | null) {
  if (!v) return null;
  return <span className={styles.badge}>{v}</span>;
}

function preloadImages(urls: string[]): Promise<void> {
  if (typeof window === "undefined" || urls.length === 0) return Promise.resolve();
  const unique = Array.from(new Set(urls.filter(Boolean)));
  return Promise.all(
    unique.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        })
    )
  ).then(() => undefined);
}

export default function JobSearchClient() {
  const { state, actions } = useJobSearch({
    filters: DEFAULTS,
    limit: 12,
    offset: 0,
  });

  const items = state.items ?? [];

  const [companiesById, setCompaniesById] = useState<Record<string, Company>>({});
  const [companyLoading, setCompanyLoading] = useState(false);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const openDetails = (jobId: string) => setActiveJobId(jobId);
  const closeDetails = () => setActiveJobId(null);

  useEffect(() => {
    const missing = Array.from(
      new Set(
        items
          .map((j) => j.company_id)
          .filter((id): id is string => Boolean(id) && !(id in companiesById))
      )
    );

    if (missing.length === 0) {
      setCompanyLoading(false);
      return;
    }

    let canceled = false;
    setCompanyLoading(true);

    (async () => {
      try {
        const results = await Promise.all(
          missing.map(async (id) => {
            try {
              const company = await getCompany(id);
              return { id, company };
            } catch (e) {
              console.warn("getCompany failed", id, e);
              return { id, company: undefined as unknown as Company };
            }
          })
        );
        if (canceled) return;
        setCompaniesById((prev) => {
          const next: Record<string, Company> = { ...prev };
          for (const r of results) if (r.company) next[r.id] = r.company;
          return next;
        });
      } finally {
        if (!canceled) setCompanyLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [items, companiesById]);

  const placeholderSrc =
    (PlaceholderCompany as unknown as { src: string }).src ?? "/_next/static/media/company.png";
  const imageUrls = useMemo(() => {
    const arr: string[] = [];
    for (const j of items) {
      const c = j.company_id ? companiesById[j.company_id] : undefined;
      const cover = c?.coverPhoto || placeholderSrc;
      const logo = c?.profilePicture || placeholderSrc;
      arr.push(cover, logo);
    }
    return arr;
  }, [items, companiesById, placeholderSrc]);

  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => {
    setImagesReady(false);
    if (state.loading) return;
    if (companyLoading) return;

    let cancelled = false;
    preloadImages(imageUrls).then(() => {
      if (!cancelled) setImagesReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [state.loading, companyLoading, imageUrls]);

  const ready = !state.loading && !state.error && !companyLoading && imagesReady;

  return (
    <div className={styles.main}>
      <FiltersBar defaultValues={state.filters} onSubmit={actions.submit} />

      {!ready && (
        <div className={styles.loader}>
          <PropagateLoader />
        </div>
      )}

      {state.error && <div className={styles.error}>Error: {state.error}</div>}

      {ready && (
        <>
          <div className={styles.count}>Mostrando {state.total} ofertas</div>
          <ul className={styles.grid}>
            {items.map((job) => (
              <li key={job.id} className={styles.item}>
                <JobCard
                  job={job}
                  company={companiesById[job.company_id]}
                  onOpenDetails={openDetails}
                />
              </li>
            ))}
            {items.length === 0 && <li className={styles.center}>Sin resultados</li>}
          </ul>

          {activeJobId && (
            <Modal onClose={closeDetails} labelledBy="job-detail-title">
              <JobDetailClient jobId={activeJobId} />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
