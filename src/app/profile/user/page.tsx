import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import Navbar from "../../../../components/navbar/navbar";
import styles from "./userProfile.module.css";
import { getOriginFromHeaders } from "../../../../lib/getOrigin";

export const dynamic = "force-dynamic";

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

async function getAuthAndProfile() {
  const hdrs = await nextHeaders();
  const cookies = await nextCookies();
  const cookieHeader = cookies.toString();
  const origin = await getOriginFromHeaders();

  const meRes = await fetch(`${origin}/api/me`, {
    headers: { cookie: cookieHeader, Accept: "application/json", "x-correlation-id": hdrs.get("x-correlation-id") || "" },
    cache: "no-store",
  });
  const meJson = await meRes.json().catch(() => null);
  const userId: string | null = meJson?.id ?? meJson?.user?.id ?? null;
  if (!meRes.ok || !userId) return { isLogged: false, profile: null, authMe: null };

  const pRes = await fetch(`${origin}/api/profiles?ids=${encodeURIComponent(userId)}`, {
    headers: { cookie: cookieHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const pJson = await pRes.json().catch(() => null);
  const profile: Profile | null = Array.isArray(pJson?.profiles) ? pJson.profiles[0] ?? null : null;

  const authMe = { id: userId, email: profile?.email ?? "", role: profile?.role ?? meJson?.role ?? "" };
  return { isLogged: true, profile, authMe };
}

function hasValidExperience(exp: ExperienceItem[] | null | undefined) {
  if (!Array.isArray(exp)) return false;
  return exp.some((e) => e.role || e.company || e.start || e.end || (e.description && e.description.trim() !== ""));
}

function hasValidEducation(edu: EducationItem[] | null | undefined) {
  if (!Array.isArray(edu)) return false;
  return edu.some((e) => e.degree || e.institution || e.start || e.end || (e.description && e.description.trim() !== ""));
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

            <div className={styles.section}>
              <h3>Sobre mí</h3>
              {profile.about_me && profile.about_me.trim().length ? (
                <p className={styles.occupation}>{profile.about_me}</p>
              ) : (
                <p className={styles.muted}>Aún no has añadido una descripción.</p>
              )}
            </div>

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
              </dl>
            </div>

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
