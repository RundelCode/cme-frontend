import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import Navbar from "../../../../components/navbar/navbar";
import styles from "./userProfile.module.css";
import { gqlRequest } from "../../../../lib/gql";

export const dynamic = "force-dynamic";

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT!;

type AuthMe = { authMe: { id: string; email: string; role: string } };
type Profile = {
  id: string;
  email: string;
  full_name?: string | null;
  profile_picture?: string | null;
  cover_photo?: string | null;
  role?: string | null;
  occupation?: string | null;
  skills?: string[] | null;
};
type ProfileQuery = { myProfile: Profile | null };

const AUTH_ME = `query { authMe { id email role } }`;
const MY_PROFILE = `query { myProfile { id email full_name profile_picture cover_photo occupation skills role } }`;

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
      } catch {
        profile = null;
      }
    }
    return { isLogged, profile, authMe: auth?.authMe ?? null };
  } catch {
    return { isLogged: false, profile: null, authMe: null };
  }
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

        {isLogged && (
          <div className={styles.card}>
            <div className={styles.coverContainer}>
              {profile?.cover_photo ? (
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
                {profile?.profile_picture ? (
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
                  {profile?.full_name || profile?.email?.split("@")[0] || "Usuario"}
                </h2>
                <div className={styles.meta}>
                  <span className={styles.email}>{profile?.email ?? authMe?.email}</span>
                  {profile?.role && <span className={styles.role}> · {profile.role}</span>}
                </div>
                {profile?.occupation && (
                  <div className={styles.occupation}>{profile.occupation}</div>
                )}
              </div>
            </div>

            {/* SKILLS */}
            <div className={styles.section}>
              <h3>Skills</h3>
              {profile?.skills?.length ? (
                <ul className={styles.skills}>
                  {profile.skills.map((s) => (
                    <li key={s} className={styles.skill}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>Aún no has añadido skills.</p>
              )}
            </div>

            {/* DETALLES */}
            <div className={styles.section}>
              <h3>Detalles</h3>
              <dl className={styles.detailList}>
                <div className={styles.detailRow}>
                  <dt>Email</dt><dd>{profile?.email ?? authMe?.email ?? "—"}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>Ocupación</dt><dd>{profile?.occupation ?? "—"}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
