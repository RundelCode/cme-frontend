// src/app/profile/company/page.tsx (o la ruta que uses)
import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import Navbar from "../../../../components/navbar/navbar";
import styles from "./companyProfile.module.css";
import { gqlRequest } from "../../../../lib/gql";
import CompanyRatingClient from "./rating/CompanyRatingClient";
import CompanyOffers from "./offers/CompanyOffers";

export const dynamic = "force-dynamic";
const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT!;

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

type CompanyQuery = { company: Company | null };

const GET_COMPANY = `
  query GetCompany($id: ID!) {
    company(id: $id) {
      id
      name
      email
      website
      description
      industry
      location
      profilePicture
      coverPhoto
      companyRating
      boolVerified
      verifiedAt
      subscriptionPlan
      createdAt
      updatedAt
    }
  }
`;

async function getCompanyById(id: string) {
  const hdrs = await nextHeaders();
  const cookieHeader = (await nextCookies()).toString();
  try {
    const data = await gqlRequest<CompanyQuery>(
      GRAPHQL_ENDPOINT,
      GET_COMPANY,
      { id },
      hdrs,
      cookieHeader
    );
    return data?.company ?? null;
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
