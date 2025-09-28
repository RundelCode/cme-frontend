"use client";

import useSWR from "swr";
import Image from "next/image";
import styles from "./job.module.css";
import { PropagateLoader } from "react-spinners";

type Props = { jobId: string };

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Error cargando la oferta");
    return r.json();
  });

function short(id: string) {
  if (!id) return "";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export default function JobDetailClient({ jobId }: Props) {
  const { data, error, isLoading } = useSWR(jobId ? `/api/jobs/${jobId}` : null, fetcher);

  if (!jobId) return null;
  if (isLoading) return <div className={styles.loading}><PropagateLoader></PropagateLoader></div>;
  if (error || !data?.job) return <div className={styles.error}>No se pudo cargar la oferta.</div>;

  const { job, company } = data as {
    job: {
      id: string;
      company_id: string | null;
      title: string;
      description?: string | null;
      employment_type?: string | null;
      location_type?: string | null;
      skills?: string[] | null;
      requirements?: string | null;
      location?: string | null;
      salary?: number | null;
      currency?: string | null;
    };
    company: {
      name?: string | null;
      profilePicture?: string | null;
      coverPhoto?: string | null;
      location?: string | null;
    } | null;
  };

  const salary =
    job.salary == null
      ? "—"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: job.currency ?? "USD",
          maximumFractionDigits: 2,
        }).format(job.salary);

  const companyName = company?.name ?? (job.company_id ? `Company #${short(job.company_id)}` : "Company");
  const companyLogo = company?.profilePicture ?? null;
  const companyCover = company?.coverPhoto ?? null;
  const loc = job.location ?? company?.location ?? "—";

  return (
    <div className={styles.main}>
      <div className={styles.modal}>
        <div className={styles.cover}>
          {companyCover ? <Image src={companyCover} alt="" fill className={styles.coverImg} priority /> : null}
        </div>

        <div className={styles.infoSection}>
          <div className={styles.logoWrapper}>
            {companyLogo ? (
              <Image src={companyLogo} alt={companyName} width={72} height={72} className={styles.logoImg} />
            ) : (
              <div className={styles.logoPlaceholder} />
            )}
          </div>

          <div className={styles.header}>
            <div className={styles.meta}>
              {companyName} · {loc}
            </div>
            <div className={styles.title}>{job.title}</div>

            <div className={styles.textSection}>
              <p>
                <b>Tipo:</b> {job.employment_type ?? "—"}
              </p>
              {" · "}
              <p>
                <b>Modalidad:</b> {job.location_type ?? "—"}
              </p>
            </div>

            <div>
              <b>Salario:</b> {salary}
            </div>
          </div>

          {Array.isArray(job.skills) && job.skills.length > 0 && (
            <div className={styles.skills}>
              {job.skills.map((s) => (
                <span key={s} className={styles.skill}>
                  {s}
                </span>
              ))}
            </div>
          )}

          {job.description && (
            <div>
              <h3>Descripción</h3>
              <p className={styles.text}>{job.description}</p>
            </div>
          )}

          {job.requirements && (
            <div>
              <h3>Requisitos</h3>
              <p className={styles.text}>{job.requirements}</p>
            </div>
          )}

          <div className={styles.actions}>
            <a href={`/jobs/${job.id}/apply`} className={styles.primaryBtn}>
              Aplicar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
