// src/app/profile/company/page.tsx
import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import Navbar from "../../../../components/navbar/navbar";
import styles from "./companyProfile.module.css";
import CompanyRatingClient from "./rating/CompanyRatingClient";
import CompanyOffers from "./offers/CompanyOffers";

export const dynamic = "force-dynamic";

type Company = {
  id: string;
  name: string;
  email: string;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  profilePicture?: string | null; // camelCase usado por la vista
  coverPhoto?: string | null;     // camelCase usado por la vista
  companyRating?: number | null;
  boolVerified?: boolean | null;
  verifiedAt?: string | null;
  subscriptionPlan?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

// Utilidad: toma el valor camel si existe; si no, el snake; si no, null
function coalesce<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return null;
}

async function getOrigin() {
  const hdrs = await nextHeaders();
  const host = hdrs.get("host") || "localhost:3001";
  const proto = hdrs.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

async function getCompanyById(id: string): Promise<Company | null> {
  try {
    const origin = await getOrigin();
    const ck = await nextCookies();
    const cookieHeader = ck
      .getAll()
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join("; ");

    // Nota: este proxy devuelve lo que venga del backend (snake o camel).
    const res = await fetch(`${origin}/api/company/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: cookieHeader
        ? { cookie: cookieHeader, Accept: "application/json" }
        : { Accept: "application/json" },
    });

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const raw = data?.company ?? data ?? null;
    if (!raw?.id) return null;

    // 🔁 Normalizamos snake → camel para lo que consume la UI
    const company: Company = {
      id: raw.id,
      name: raw.name,
      email: raw.email,
      website: coalesce<string>(raw.website, raw.website_url),
      description: raw.description ?? null,
      industry: raw.industry ?? null,
      location: raw.location ?? null,
      profilePicture: coalesce<string>(raw.profilePicture, raw.profile_picture),
      coverPhoto: coalesce<string>(raw.coverPhoto, raw.cover_photo),
      companyRating: (() => {
        const n = Number(
          raw.companyRating ?? raw.company_rating ?? null
        );
        return Number.isFinite(n) ? n : null;
      })(),
      boolVerified: coalesce<boolean>(raw.boolVerified, raw.bool_verified) ?? null,
      verifiedAt: raw.verifiedAt ?? raw.verified_at ?? null,
      subscriptionPlan: raw.subscriptionPlan ?? raw.subscription_plan ?? null,
      createdAt: raw.createdAt ?? raw.created_at ?? null,
      updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
    };

    return company;
  } catch {
    return null;
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const id = sp?.id?.trim();
  const company = id ? await getCompanyById(id) : null;

  return (
    <div className={styles.main}>
      <Navbar />
      <div className={styles.content}>
        {!id && (
          <div className={styles.card}>
            <h2>Falta el ID de la empresa</h2>
            <p>
              Pasa el parámetro <code>?id=&lt;company-id&gt;</code> en la URL.
            </p>
            <div className={styles.actions}>
              <Link className={styles.ctaBtn} href="/search/companies">
                Volver
              </Link>
            </div>
          </div>
        )}

        {id && !company && (
          <div className={styles.errorCard}>
            <h2>No encontramos esta empresa</h2>
            <p>Verifica que exista o sea pública.</p>
            <div className={styles.actions}>
              <Link className={styles.ctaBtn} href="/search/companies">
                Volver
              </Link>
            </div>
          </div>
        )}

        {id && company && (
          <div className={styles.card}>
            <div className={styles.coverContainer}>
              {company.coverPhoto ? (
                <Image
                  src={company.coverPhoto}
                  alt={company.name}
                  fill
                  className={styles.cover}
                  priority
                />
              ) : (
                <div className={styles.coverFallback} aria-hidden />
              )}
            </div>

            <div className={styles.infoSection}>
              <div className={styles.avatarWrap}>
                {company.profilePicture ? (
                  <Image
                    src={company.profilePicture}
                    alt={company.name}
                    width={112}
                    height={112}
                    className={styles.avatar}
                    priority
                  />
                ) : (
                  <div className={styles.avatarPlaceholder} aria-hidden />
                )}
              </div>

              <div className={styles.identity}>
                <h2 className={styles.name}>
                  {company.name}
                  {company.boolVerified && (
                    <span className={styles.verifiedStar} title="Verificada">★</span>
                  )}
                </h2>

                <div className={styles.meta}>
                  <span>{company.industry ?? "—"}</span>
                  <span className={styles.dot}>·</span>
                  <span>{company.location ?? "—"}</span>
                </div>

                <div className={styles.ratingRow}>
                  <CompanyRatingClient
                    companyId={company.id}
                    initialRating={company.companyRating ?? 0}
                    className={styles.stars}
                    valueClassName={styles.ratingValue}
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h3>Descripción</h3>
              <p>{company.description || "Sin descripción"}</p>
            </div>

            <div className={styles.section}>
              <h3>Detalles</h3>
              <dl className={styles.detailList}>
                <div className={styles.detailRow}>
                  <dt>Email</dt><dd>{company.email ?? "—"}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>Sitio web</dt>
                  <dd>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noreferrer">
                        {company.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <div className={styles.section}>
              <h3>Ofertas de trabajo</h3>
              <CompanyOffers companyId={company.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
