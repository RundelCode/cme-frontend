import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import styles from "./navbar.module.css";
import { gqlRequest } from "../../lib/gql";

import CMELOGO from "../../public/images/CMELOGO.png";
import JobOffersIcon from "../../public/images/icons/Nav/JobOffers.png";
import ActivePositionsIcon from "../../public/images/icons/Nav/ActivePositions.png";
import BillingIcon from "../../public/images/icons/Nav/Billing.png";
import CompletedIcon from "../../public/images/icons/Nav/Completed.png";
import CompanyIcon from "../../public/images/icons/Nav/Companies.png";
import NotificationsIcon from "../../public/images/icons/Nav/notifications.png";
import ReferralIcon from "../../public/images/icons/Nav/referral.png";
import UserIcon from "../../public/images/icons/Nav/Users.png";
import ProfileMini from "./ProfileMini";

export const dynamic = "force-dynamic";

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT!;

type AuthMeResp = { authMe: { id: string; email: string; role: string } | null };
type ProfileType = {
  myProfile: {
    id: string;
    email: string;
    full_name?: string | null;
    profile_picture?: string | null;
    cover_photo?: string | null;
    occupation?: string | null;
    skills?: string[] | null;
    role?: string | null; // <- importante
  } | null;
};

const AUTH_ME = `query { authMe { id email role } }`;
// Agregamos role al query de perfil
const MY_PROFILE = `query {
  myProfile {
    id
    email
    full_name
    profile_picture
    cover_photo
    occupation
    skills
    role
  }
}`;

async function getAuthAndProfile() {
  const hdrs = await nextHeaders();
  const cookieHeader = (await nextCookies()).toString();

  try {
    const authData = await gqlRequest<AuthMeResp>(
      GRAPHQL_ENDPOINT,
      AUTH_ME,
      {},
      hdrs,
      cookieHeader
    );

    let profile: ProfileType["myProfile"] = null;
    try {
      const p = await gqlRequest<ProfileType>(
        GRAPHQL_ENDPOINT,
        MY_PROFILE,
        {},
        hdrs,
        cookieHeader
      );
      profile = p.myProfile ?? null;
    } catch {
      profile = null;
    }

    const isLogged = !!authData?.authMe?.id;
    const authMe = authData?.authMe ?? null;

    return { isLogged, profile, authMe };
  } catch {
    return { isLogged: false, profile: null, authMe: null as AuthMeResp["authMe"] };
  }
}

export default async function Navbar() {
  const { isLogged, profile, authMe } = await getAuthAndProfile();

  // Log de depuración (opcional)
  console.log("Perfil", profile);

  // Rol con fallback: primero profile.role, luego authMe.role
  const resolvedRole = profile?.role ?? authMe?.role ?? "";

  return (
    <div className={styles.navbarMain}>
      <div className={styles.navOptions}>
        <Image
          className={styles.cmeLogo}
          src={CMELOGO}
          alt="CME"
          width={320}
          height={320}
          priority
        />

        <div className={styles.category}>
          <p className={styles.navTitle}>Principal</p>
          <a href="/" className={styles.option}>
            <Image
              className={styles.navIcon}
              src={JobOffersIcon}
              alt="Jobs"
              width={320}
              height={320}
              priority
            />
            Ofertas Laborales
          </a>
        </div>

        <div className={styles.category}>
          <p className={styles.navTitle}>Explorar</p>
          <a href="/search/companies" className={styles.option}>
            <Image
              className={styles.navIcon}
              src={CompanyIcon}
              alt="Companies"
              width={320}
              height={320}
              priority
            />
            Empresas
          </a>
          <a href="/search/users" className={styles.option}>
            <Image
              className={styles.navIcon}
              src={UserIcon}
              alt="Users"
              width={320}
              height={320}
              priority
            />
            Usuarios
          </a>
        </div>

        {isLogged && (
          <>
            <div className={styles.category}>
              <p className={styles.navTitle}>Procesos</p>
              <a href="/applications" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={ActivePositionsIcon}
                  alt="Positions"
                  width={320}
                  height={320}
                  priority
                />
                Posiciones Activas
              </a>
              <a href="/referrals/completed" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={CompletedIcon}
                  alt="Completed"
                  width={320}
                  height={320}
                  priority
                />
                Procesos Completados
              </a>
            </div>

            <div className={styles.category}>
              <p className={styles.navTitle}>Reclutadores</p>
              <a href="#" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={ReferralIcon}
                  alt="Referrals"
                  width={320}
                  height={320}
                  priority
                />
                Mis Referidos
              </a>
              <a href="#" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={ReferralIcon}
                  alt="TopRecruiters"
                  width={320}
                  height={320}
                  priority
                />
                Mejores Reclutadores
              </a>
            </div>

            <div className={styles.category}>
              <p className={styles.navTitle}>Finanzas</p>
              <a href="#" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={BillingIcon}
                  alt="Billing"
                  width={320}
                  height={320}
                  priority
                />
                Resumen
              </a>
            </div>

            <div className={styles.category}>
              <p className={styles.navTitle}>Bandeja de Entrada</p>
              <a href="#" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={NotificationsIcon}
                  alt="Notifications"
                  width={320}
                  height={320}
                  priority
                />
                Notificaciones
              </a>
            </div>
          </>
        )}
      </div>

      <div className={styles.rightHeader}>
        {isLogged ? (
          <ProfileMini
            name={profile?.full_name || profile?.email?.split("@")[0] || "Usuario"}
            email={profile?.email || ""}
            role={resolvedRole}
            imageUrl={profile?.profile_picture || null}
          />
        ) : (
          <div className={styles.authCtas}>
            <Link className={styles.ctaBtn} href="/login">
              Iniciar sesión
            </Link>
            <Link className={styles.ctaBtnOutline} href="/register">
              Registrarme
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
