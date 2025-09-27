  "use client";

  import FiltersBar from "../filters/FiltersBar";
  import { useJobSearch, type Filters, type JobOffer } from "../../hooks/useJobSearch";
  import { PropagateLoader } from "react-spinners";
  import Image from "next/image";
  import styles from "./jobs.module.css";

  import PlaceholderCompany from "../../public/images/placeholders/company.png";

  const DEFAULTS: Filters = {
    q: "",
    projectType: "",
    paymentType: "",
    minSalary: "",
    maxSalary: "",
    location: "",
    orderBy: "newest",
  };

  function JobCard({ job }: { job: JobOffer }) {
    const posted = new Date(job.created_at);
    const postedText = posted.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });

    const salaryText = formatSalary(job.salary, job.currency);
    const skills = job.skills ?? [];

    return (
      <article className={styles.card}>
        {/* Cover */}
        <div className={styles.cover}>
          <Image src={PlaceholderCompany} alt="" fill className={styles.coverImg} priority />
        </div>

        <div className={styles.body}>
          <div className={styles.companyRow}>
            <div className={styles.companyAvatar}>
              <Image src={PlaceholderCompany} alt="Company" width={60} height={60} />
            </div>
            <div className={styles.companyMeta}>
              <div className={styles.companyName}>
                Company {job.company_id ? `#${short(job.company_id)}` : ""}
              </div>
              <div className={styles.companyLocation}>{job.location ?? "—"}</div>
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
            <div className={styles.posted}>publicado el {postedText}</div>
            <div className={styles.salaryBlock}>
              <div className={styles.salaryLabel}>Rango salarial</div>
              <div className={styles.salaryValue}>{salaryText}</div>
            </div>
            <div className={styles.buttons}>
              <a className={styles.secondaryBtn} href={`/jobs/${job.id}`}>
                Ver Detalles
              </a>
              <a className={styles.primaryBtn} href={`/jobs/${job.id}/apply`}>
                Aplicar
              </a>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // --- helpers ---
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

  // --- Página de búsqueda ---
  export default function JobSearchClient() {
    const { state, actions } = useJobSearch({
      filters: DEFAULTS,
      limit: 12,
      offset: 0,
    });

    const items = state.items ?? [];

    return (
      <div className={styles.main}>
        <FiltersBar defaultValues={state.filters} onSubmit={actions.submit} />

        {state.loading && (
          <div className={styles.loader}>
            <PropagateLoader />
          </div>
        )}

        {state.error && <div className={styles.error}>Error: {state.error}</div>}

        {!state.loading && !state.error && (
          <>
            <div className={styles.count}>Mostrando {state.total} ofertas</div>
            <ul className={styles.grid}>
              {items.map((job) => (
                <li key={job.id} className={styles.item}>
                  <JobCard job={job} />
                </li>
              ))}
              {items.length === 0 && <li className={styles.center}>Sin resultados</li>}
            </ul>
          </>
        )}
      </div>
    );
  }
