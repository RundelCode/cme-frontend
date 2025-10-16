import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import Navbar from "../../../../components/navbar/navbar";
import styles from "./userProfile.module.css";
import { gqlRequest } from "../../../../lib/gql";

export const dynamic = "force-dynamic";

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT!;

type AuthMe = { authMe: { id: string; email: string; role: string } };

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
  about_me?: string | null;
  phone?: string | null;
  experience?: ExperienceItem[] | null;
  education?: EducationItem[] | null;
  cv_url?: string | null;
};

type ProfileQuery = { myProfile: Profile | null };

const AUTH_ME = `query { authMe { id email role } }`;

const MY_PROFILE = `
  query {
    myProfile {
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

async function getAuthAndProfile() {
  const hdrs = await nextHeaders();
  const cookieHeader = (await nextCookies()).toString();

  try {
    const auth = await gqlRequest<AuthMe>(GRAPHQL_ENDPOINT, AUTH_ME, {}, hdrs, cookieHeader);
    const isLogged = !!auth?.authMe?.id;

    let profile: Profile | null = null;
    if (isLogged) {
      try {
        const q = await gqlRequest<ProfileQuery>(GRAPHQL_ENDPOINT, MY_PROFILE, {}, hdrs, cookieHeader);
        profile = q.myProfile ?? null;
        console.log("Perfil", profile);
      } catch {
        profile = null;
      }
    }
    return { isLogged, profile, authMe: auth?.authMe ?? null };
  } catch {
    return { isLogged: false, profile: null, authMe: null };
  }
}

function hasValidExperience(exp: ExperienceItem[] | null | undefined) {
  if (!Array.isArray(exp)) return false;
  return exp.some(
    (e) =>
      e.role ||
      e.company ||
      e.start ||
      e.end ||
      (e.description && e.description.trim() !== "")
  );
}

function hasValidEducation(edu: EducationItem[] | null | undefined) {
  if (!Array.isArray(edu)) return false;
  return edu.some(
    (e) =>
      e.degree ||
      e.institution ||
      e.start ||
      e.end ||
      (e.description && e.description.trim() !== "")
  );
}

export default async function Page() {
  const { isLogged, profile, authMe } = await getAuthAndProfile();

  return (
    <div className={styles.main}>
      <Navbar />
      <div className={styles.content}>
        {!isLogged && (
          <div className={styles.ErrorCard}>
            <h2>Necesitas iniciar sesión</h2>
            <p>Para ver tu perfil, inicia sesión o crea una cuenta.</p>
            <div className={styles.actions}>
              <Link className={styles.ctaBtn} href="/login">Iniciar sesión</Link>
              <Link className={styles.ctaBtnOutline} href="/register">Registrarme</Link>
            </div>
          </div>
        )}

        {isLogged && profile && (
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
                <p className={styles.muted}>Aún no has añadido una descripción.</p>
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
                <p className={styles.muted}>No se han añadido habilidades.</p>
              )}
            </div>

            {/* Detalles */}
            <div className={styles.section}>
              <h3>Detalles</h3>
              <dl className={styles.detailList}>
                <div className={styles.detailRow}>
                  <dt>Email</dt><dd>{profile.email ?? authMe?.email ?? "—"}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>Ocupación</dt><dd>{profile.occupation ?? "—"}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>Teléfono</dt><dd>{profile.phone ?? "—"}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>Rol</dt><dd>{profile.role ?? "—"}</dd>
                </div>
              </dl>
            </div>
            {/* Experiencia */}
            <div className={styles.section}>
              <h3>Experiencia</h3>
              {hasValidExperience(profile.experience) ? (
                <dl className={styles.detailList}>
                  {profile.experience!.map((it, i) => (
                    <div className={styles.detailRow} key={`exp-${i}`}>
                      <dt>
                        <strong>{it.role || "—"}</strong>
                        {it.company ? ` ${it.company}` : ""}
                      </dt>
                      <dd>
                        {(it.start || "")}{it.end ? ` – ${it.end}` : ""}
                        {it.description ? <><br />{it.description}</> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className={styles.muted}>Aún no has añadido experiencia.</p>
              )}
            </div>

            {/* Educación */}
            <div className={styles.section}>
              <h3>Educación</h3>
              {hasValidEducation(profile.education) ? (
                <dl className={styles.detailList}>
                  {profile.education!.map((it, i) => (
                    <div className={styles.detailRow} key={`edu-${i}`}>
                      <dt>
                        <strong>{it.degree || ""}</strong>
                        {it.institution ? ` — ${it.institution}` : ""}
                      </dt>
                      <dd>
                        {(it.start || "")}{it.end ? ` – ${it.end}` : ""}
                        {it.description ? <><br />{it.description}</> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className={styles.muted}>Aún no has añadido educación.</p>
              )}
            </div>

            {/* CV */}
            <div className={styles.section}>
              <h3>Currículum</h3>
              {profile.cv_url ? (
                <a
                  href={profile.cv_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.skill}
                >
                  Ver CV (PDF)
                </a>
              ) : (
                <p className={styles.muted}>Aún no subes tu CV.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
