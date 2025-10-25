import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import Navbar from "../../../../components/navbar/navbar";
import styles from "./userProfile.module.css";
import { gqlRequest } from "../../../../lib/gql";

export const dynamic = "force-dynamic";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ??
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ??
  "/api/graphql";

// ==== Tipos ====
type ExperienceItem = {
  role?: string | null;
  company?: string | null;
  start?: string | null;
  end?: string | null;
  description?: string | null;
};

type EducationItem = {
  degree?: string | null;
  institution?: string | null;
  start?: string | null;
  end?: string | null;
  description?: string | null;
};

type Profile = {
  id: string;
  email: string;
  full_name?: string | null;
  profile_picture?: string | null;
  cover_photo?: string | null;
  role?: string | null;
  occupation?: string | null;
  skills?: string[] | null;

  // extendidos
  about_me?: string | null;
  phone?: string | null;
  experience?: ExperienceItem[] | null;
  education?: EducationItem[] | null;
  cv_url?: string | null;
};

type ProfileByIdQuery = { profile: Profile | null };

// ==== Query (incluye subcampos de experience/education) ====
const PROFILE_BY_ID = `
  query GetProfile($id: ID!) {
    profile(id: $id) {
      id
      email
      full_name
      profile_picture
      cover_photo
      occupation
      skills
      role
      phone
      about_me
      experience {
        role
        company
        start
        end
        description
      }
      education {
        degree
        institution
        start
        end
        description
      }
      cv_url
    }
  }
`;

async function getProfileById(id: string) {
  const hdrs = await nextHeaders();
  const cookieHeader = (await nextCookies()).toString();

  try {
    const data = await gqlRequest<ProfileByIdQuery>(
      GRAPHQL_ENDPOINT,
      PROFILE_BY_ID,
      { id },
      hdrs,
      cookieHeader
    );
    return data?.profile ?? null;
  } catch (e) {
    console.error("[profiles/users] gqlRequest error:", e);
    return null;
  }
}

// helpers para no mostrar listas vacías (con todos los campos nulos)
function hasValidExperience(exp: ExperienceItem[] | null | undefined) {
  if (!Array.isArray(exp)) return false;
  return exp.some(
    (e) => e?.role || e?.company || e?.start || e?.end || (e?.description && e.description.trim() !== "")
  );
}

function hasValidEducation(edu: EducationItem[] | null | undefined) {
  if (!Array.isArray(edu)) return false;
  return edu.some(
    (e) => e?.degree || e?.institution || e?.start || e?.end || (e?.description && e.description.trim() !== "")
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const id = searchParams?.id?.trim();
  const profile = id ? await getProfileById(id) : null;

  return (
    <div className={styles.main}>
      <Navbar />
      <div className={styles.content}>
        {!id && (
          <div className={styles.card}>
            <h2>Falta el ID de usuario</h2>
            <p>
              Pasa el parámetro <code>?id=&lt;usuario-id&gt;</code> en la URL.
            </p>
            <div className={styles.actions}>
              <Link className={styles.ctaBtn} href="/profiles">
                Volver
              </Link>
            </div>
          </div>
        )}

        {id && !profile && (
          <div className={styles.errorCard}>
            <h2>No encontramos este perfil</h2>
            <p>Verifica que el perfil exista y/o sea público.</p>
            <div className={styles.actions}>
              <Link className={styles.ctaBtn} href="/search/users">
                Volver
              </Link>
            </div>
          </div>
        )}

        {id && profile && (
          <div className={styles.card}>
            {/* Cover */}
            <div className={styles.coverContainer}>
              {profile.cover_photo ? (
                <Image
                  src={profile.cover_photo}
                  alt={profile.full_name ?? profile.email}
                  fill
                  className={styles.cover}
                  priority
                />
              ) : (
                <div className={styles.coverFallback} aria-hidden />
              )}
            </div>

            {/* Header */}
            <div className={styles.infoSection}>
              <div className={styles.avatarWrap}>
                {profile.profile_picture ? (
                  <Image
                    src={profile.profile_picture}
                    alt={profile.full_name ?? profile.email}
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
                  {profile.full_name || profile.email.split("@")[0] || "Usuario"}
                </h2>
              </div>
            </div>

            {/* Sobre mí */}
            <div className={styles.section}>
              <h3>Sobre mí</h3>
              {profile.about_me && profile.about_me.trim().length ? (
                <p className={styles.occupation}>{profile.about_me}</p>
              ) : (
                <p className={styles.muted}>Sin descripción</p>
              )}
            </div>

            {/* Skills */}
            <div className={styles.section}>
              <h3>Habilidades</h3>
              {profile.skills?.length ? (
                <ul className={styles.skills}>
                  {profile.skills.map((s) => (
                    <li key={s} className={styles.skill}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>No se han añadido Habilidades.</p>
              )}
            </div>

            {/* Detalles */}
            <div className={styles.section}>
              <h3>Detalles</h3>
              <dl className={styles.detailList}>
                <div className={styles.detailRow}>
                  <dt>Email</dt><dd>{profile.email}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>Ocupación</dt><dd>{profile.occupation ?? "—"}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>Teléfono</dt><dd>{profile.phone ?? "—"}</dd>
                </div>

              </dl>
            </div>

            {/* Experiencia */}
            <div className={styles.section}>
              <h3>Experiencia</h3>

              {hasValidExperience(profile.experience) ? (
                <div className={styles.gridCards}>
                  {profile.experience!.map((it, i) => {
                    const left = (it.start || "").trim();
                    const right = (it.end || "").trim();
                    const dates = left || right ? `${left}${right ? ` – ${right}` : ""}` : "—";
                    return (
                      <div className={styles.infoCard} key={`exp-${i}`}>
                        <div className={styles.cardTop}>
                          <div className={styles.cardLeft}>
                            <h4 className={styles.cardTitle}>{it.role || "—"}</h4>
                            {it.company ? <p className={styles.cardSubtitle}>{it.company}</p> : null}
                          </div>
                          <span className={styles.datePill}>{dates}</span>
                        </div>
                        {it.description ? <p className={styles.cardDesc}>{it.description}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyCard}>Sin experiencia registrada.</div>
              )}
            </div>


            {/* Educación */}
            <div className={styles.section}>
              <h3>Educación</h3>

              {hasValidEducation(profile.education) ? (
                <div className={styles.gridCards}>
                  {profile.education!.map((it, i) => {
                    const left = (it.start || "").trim();
                    const right = (it.end || "").trim();
                    const dates = left || right ? `${left}${right ? ` – ${right}` : ""}` : "—";
                    return (
                      <div className={styles.infoCard} key={`edu-${i}`}>
                        <div className={styles.cardTop}>
                          <div className={styles.cardLeft}>
                            <h4 className={styles.cardTitle}>{it.degree || "—"}</h4>
                            {it.institution ? <p className={styles.cardSubtitle}>{it.institution}</p> : null}
                          </div>
                          <span className={`${styles.datePill} ${styles.eduPill}`}>{dates}</span>
                        </div>
                        {it.description ? <p className={styles.cardDesc}>{it.description}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyCard}>Sin educación registrada.</div>
              )}
            </div>


          </div>
        )}
      </div>
    </div>
  );
}
