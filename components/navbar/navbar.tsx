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
    role?: string | null;
  } | null;
};
type CompanyLite = {
  id: string;
  name: string;
  profilePicture?: string | null;
  coverPhoto?: string | null;
  companyRating?: number | null;
};

const AUTH_ME = `query { authMe { id email role } }`;
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
const COMPANY_BY_ADMIN = `query ($adminId: ID!) {
  companyByAdmin(adminId: $adminId) {
    id
    name
    profilePicture
    coverPhoto
    companyRating
  }
}`;

// Normaliza el rol
function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

async function getAuthAndProfile() {
  const hdrs = await nextHeaders();
  const cookieHeader = (await nextCookies()).toString();

  try {
    // 1) Sesión
    const authData = await gqlRequest<AuthMeResp>(
      GRAPHQL_ENDPOINT,
      AUTH_ME,
      {},
      hdrs,
      cookieHeader
    );
    const isLogged = !!authData?.authMe?.id;
    const authMe = authData?.authMe ?? null;

    // 2) Perfil (opcional)
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

    // 3) Rol resuelto
    const rawRole = profile?.role ?? authMe?.role ?? "";
    const resolvedRole = normalizeRole(rawRole);
    const isCompanyAdmin = resolvedRole === "company_admin";

    // 4) Si es admin de empresa, consultar su empresa por adminId (authMe.id)
    let adminCompany: CompanyLite | null = null;
    if (isCompanyAdmin && authMe?.id) {
      try {
        const resp = await gqlRequest<{ companyByAdmin: CompanyLite | null }>(
          GRAPHQL_ENDPOINT,
          COMPANY_BY_ADMIN,
          { adminId: authMe.id },
          hdrs,
          cookieHeader
        );
        adminCompany = resp?.companyByAdmin ?? null;
      } catch {
        adminCompany = null;
      }
    }

    return { isLogged, profile, authMe, adminCompany, resolvedRole };
  } catch {
    return {
      isLogged: false,
      profile: null,
      authMe: null as AuthMeResp["authMe"],
      adminCompany: null as CompanyLite | null,
      resolvedRole: "" as string,
    };
  }
}

export default async function Navbar() {
  const { isLogged, profile, authMe, adminCompany, resolvedRole } =
    await getAuthAndProfile();
  const isCompanyAdmin = resolvedRole === "company_admin";

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
          <Link href="/" className={styles.option}>
            <Image
              className={styles.navIcon}
              src={JobOffersIcon}
              alt="Jobs"
              width={320}
              height={320}
              priority
            />
            Ofertas Laborales
          </Link>
        </div>

        <div className={styles.category}>
          <p className={styles.navTitle}>Explorar</p>
          <Link href="/search/companies" className={styles.option}>
            <Image
              className={styles.navIcon}
              src={CompanyIcon}
              alt="Companies"
              width={320}
              height={320}
              priority
            />
            Empresas
          </Link>
          <Link href="/search/users" className={styles.option}>
            <Image
              className={styles.navIcon}
              src={UserIcon}
              alt="Users"
              width={320}
              height={320}
              priority
            />
            Usuarios
          </Link>
        </div>

        {isLogged && (
          <>
            <div className={styles.category}>
              <p className={styles.navTitle}>Procesos</p>
              <Link href="/applications" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={ActivePositionsIcon}
                  alt="Positions"
                  width={320}
                  height={320}
                  priority
                />
                Posiciones Activas
              </Link>
              <Link href="/referrals/completed" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={CompletedIcon}
                  alt="Completed"
                  width={320}
                  height={320}
                  priority
                />
                Procesos Completados
              </Link>
            </div>

            {/* Empresa: SOLO para company_admin, usando companyByAdmin(adminId) */}
            {isCompanyAdmin && (
              <div className={styles.category}>
                <p className={styles.navTitle}>Empresa</p>

                {adminCompany?.id ? (
                  <>
                    <Link
                      href={`/profile/company?id=${adminCompany.id}`}
                      className={styles.option}
                      title={adminCompany.name}
                    >
                      <Image
                        className={styles.navIcon}
                        src={CompanyIcon}
                        alt="Mi empresa"
                        width={320}
                        height={320}
                        priority
                      />
                      Mi empresa
                    </Link>

                    <Link
                      href={`/updateCompany`}
                      className={styles.option}
                      title="Editar empresa"
                    >
                      <Image
                        className={styles.navIcon}
                        src={CompanyIcon}
                        alt="Editar empresa"
                        width={320}
                        height={320}
                        priority
                      />
                      Editar empresa
                    </Link>
                    <Link
                      href={`/company/jobs`}
                      className={styles.option}
                      title="Gestionar ofertas"
                    >
                      <Image
                        className={styles.navIcon}
                        src={CompanyIcon}
                        alt="Gestionar Ofertas Laborales"
                        width={320}
                        height={320}
                        priority
                      />
                      Gestionar Ofertas
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/createCompany"
                    className={styles.option}
                    title="Crear empresa"
                  >
                    <Image
                      className={styles.navIcon}
                      src={CompanyIcon}
                      alt="Crear empresa"
                      width={320}
                      height={320}
                      priority
                    />
                    Crear empresa
                  </Link>
                )}
              </div>
            )}

            {/* Reclutadores: oculto para company_admin */}
            {!isCompanyAdmin && (
              <div className={styles.category}>
                <p className={styles.navTitle}>Reclutadores</p>
                <Link href="#" className={styles.option}>
                  <Image
                    className={styles.navIcon}
                    src={ReferralIcon}
                    alt="Referrals"
                    width={320}
                    height={320}
                    priority
                  />
                  Mis Referidos
                </Link>
                <Link href="#" className={styles.option}>
                  <Image
                    className={styles.navIcon}
                    src={ReferralIcon}
                    alt="TopRecruiters"
                    width={320}
                    height={320}
                    priority
                  />
                  Mejores Reclutadores
                </Link>
              </div>
            )}

            <div className={styles.category}>
              <p className={styles.navTitle}>Finanzas</p>
              <Link href="#" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={BillingIcon}
                  alt="Billing"
                  width={320}
                  height={320}
                  priority
                />
                Resumen
              </Link>
            </div>

            <div className={styles.category}>
              <p className={styles.navTitle}>Bandeja de Entrada</p>
              <Link href="#" className={styles.option}>
                <Image
                  className={styles.navIcon}
                  src={NotificationsIcon}
                  alt="Notifications"
                  width={320}
                  height={320}
                  priority
                />
                Notificaciones
              </Link>
            </div>
          </>
        )}
      </div>

      <div className={styles.rightHeader}>
        {isLogged ? (
          <ProfileMini
            name={
              profile?.full_name ||
              profile?.email?.split("@")[0] ||
              "Usuario"
            }
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
