// src/app/profile/my-company/page.tsx
import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import Navbar from "../../../../components/navbar/navbar";
import styles from "../company/companyProfile.module.css";
import CompanyRatingClient from "../company/rating/CompanyRatingClient";
import CompanyOffers from "../company/offers/CompanyOffers";
import { getOriginFromHeaders } from "../../../../lib/getOrigin";

export const dynamic = "force-dynamic";

type AuthMe = { id: string; email: string; role: string };

type Company = {
  id: string;
  name: string;
  email: string;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  profilePicture?: string | null;
  coverPhoto?: string | null;
  companyRating?: number | null;
  boolVerified?: boolean | null;
  verifiedAt?: string | null;
  subscriptionPlan?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

async function getMeAndCompany() {
  const hdrs = await nextHeaders();
  const cookieHeader = (await nextCookies()).toString();
  const origin = await getOriginFromHeaders();

  const meRes = await fetch(`${origin}/api/me`, {
    method: "GET",
    headers: {
      cookie: cookieHeader,
      Accept: "application/json",
      "x-correlation-id": hdrs.get("x-correlation-id") || "",
    },
    cache: "no-store",
  });
  const meJson = await meRes.json().catch(() => null);
  const me: AuthMe | null = meJson?.id ? { id: meJson.id, email: meJson?.user?.email ?? meJson?.email ?? "", role: meJson?.role ?? "" } : null;
  if (!me?.id) return { me: null as AuthMe | null, company: null as Company | null };

  let company: Company | null = null;

  const searchRes = await fetch(`${origin}/api/company/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Accept: "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify({ input: { adminId: me.id, limit: 1 } }),
    cache: "no-store",
  });
  const searchJson = await searchRes.json().catch(() => null);
  const first = Array.isArray(searchJson?.items) ? searchJson.items[0] : null;
  if (first?.id) {
    company = {
      id: String(first.id),
      name: String(first.name ?? ""),
      email: String(first.email ?? ""),
      website: first.website ?? null,
      description: first.description ?? null,
      industry: first.industry ?? null,
      location: first.location ?? null,
      profilePicture: first.profilePicture ?? null,
      coverPhoto: first.coverPhoto ?? null,
      companyRating: typeof first.companyRating === "number" ? first.companyRating : Number(first.companyRating ?? 0),
      boolVerified: !!first.boolVerified,
      verifiedAt: first.verifiedAt ?? null,
      subscriptionPlan: first.subscriptionPlan ?? null,
      createdAt: first.createdAt ?? "",
      updatedAt: first.updatedAt ?? null,
    };
  }

  return { me, company };
}

export default async function MyCompanyPage() {
  const { me, company } = await getMeAndCompany();

  return (
    <div className={styles.main}>
      <Navbar />
      <div className={styles.content}>
        {!me && (
          <div className={styles.errorCard}>
            <h2>No has iniciado sesión</h2>
            <p>Inicia sesión para ver tu empresa.</p>
            <div className={styles.actions}>
              <Link className={styles.ctaBtn} href="/login">
                Iniciar sesión
              </Link>
            </div>
          </div>
        )}

        {me && !company && (
          <div className={styles.card}>
            <div className={styles.section}>
              <h3>Tu empresa</h3>
              <p className={styles.muted}>
                No encontramos una empresa asociada a tu usuario administrador.
              </p>
              <div className={styles.actions}>
                <Link className={styles.ctaBtn} href="/createCompany">
                  Crear empresa
                </Link>
              </div>
            </div>
          </div>
        )}

        {me && company && (
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
