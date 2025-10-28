import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import styles from "./navbar.module.css";
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
import { getOriginFromHeaders } from "../../lib/getOrigin";

export const dynamic = "force-dynamic";

type CompanyLite = {
  id: string;
  name: string;
};

function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

async function getAuthAndProfile() {
  const hdrs = await nextHeaders();
  const cookies = await nextCookies();
  const cookieHeader = cookies.toString();
  const origin = await getOriginFromHeaders();

  const logout = async () => {
    try {
      await fetch(`${origin}/api/logout`, { method: "POST", cache: "no-store" });
    } catch { }
  };

  try {
    const meRes = await fetch(`${origin}/api/me`, {
      headers: { cookie: cookieHeader, Accept: "application/json", "x-correlation-id": hdrs.get("x-correlation-id") || "" },
      cache: "no-store",
    });
    const me = await meRes.json().catch(() => null);
    const userId: string | null = me?.id ?? me?.user?.id ?? null;
    const roleRaw: string | null = me?.role ?? me?.user?.role ?? null;
    if (!userId) return { isLogged: false, profile: null, authMe: null, adminCompany: null, resolvedRole: "", unreadCount: 0 };

    let profile: any = null;
    try {
      const pRes = await fetch(`${origin}/api/profiles?ids=${encodeURIComponent(userId)}`, {
        headers: { cookie: cookieHeader, Accept: "application/json" },
        cache: "no-store",
      });
      const pdata = await pRes.json().catch(() => null);
      profile = Array.isArray(pdata?.profiles) ? pdata.profiles[0] ?? null : null;
    } catch {
      await logout();
      return { isLogged: false, profile: null, authMe: null, adminCompany: null, resolvedRole: "", unreadCount: 0 };
    }

    const resolvedRole = normalizeRole(profile?.role ?? roleRaw ?? "");
    const isCompanyAdmin = resolvedRole === "company_admin";

    let adminCompany: CompanyLite | null = null;
    if (isCompanyAdmin) {
      try {
        const cRes = await fetch(`${origin}/api/company/search`, {
          method: "POST",
          headers: { "content-type": "application/json", Accept: "application/json", cookie: cookieHeader },
          body: JSON.stringify({ input: { adminId: userId, limit: 1 } }),
          cache: "no-store",
        });
        const cjson = await cRes.json().catch(() => null);
        const first = Array.isArray(cjson?.items) ? cjson.items[0] : null;
        if (first?.id) adminCompany = { id: String(first.id), name: String(first.name ?? "Mi empresa") };
      } catch { }
    }

    let unreadCount = 0;
    try {
      const limit = 100;
      let offset = 0;
      for (let i = 0; i < 5; i++) {
        const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) }).toString();
        const nRes = await fetch(`${origin}/api/notifications?${qs}`, {
          headers: { cookie: cookieHeader, Accept: "application/json" },
          cache: "no-store",
        });
        const njson = await nRes.json().catch(() => null);
        const items: any[] = Array.isArray(njson?.items) ? njson.items : [];
        unreadCount += items.filter((n: any) => !n?.read_at).length;
        if (items.length < limit) break;
        offset += limit;
      }
    } catch { }

    return {
      isLogged: true,
      profile,
      authMe: { id: userId, role: resolvedRole, email: profile?.email ?? "" },
      adminCompany,
      resolvedRole,
      unreadCount,
    };
  } catch {
    await logout();
    return { isLogged: false, profile: null, authMe: null, adminCompany: null, resolvedRole: "", unreadCount: 0 };
  }
}

export default async function Navbar() {
  const { isLogged, profile, authMe, adminCompany, resolvedRole, unreadCount } = await getAuthAndProfile();
  const isCompanyAdmin = resolvedRole === "company_admin";

  return (
    <div className={styles.navbarMain}>
      <div className={styles.navOptions}>
        <Image className={styles.cmeLogo} src={CMELOGO} alt="CME" width={320} height={320} priority />
        <div className={styles.category}>
          <p className={styles.navTitle}>Principal</p>
          <Link href="/" className={styles.option}>
            <Image className={styles.navIcon} src={JobOffersIcon} alt="Jobs" width={320} height={320} priority />
            Ofertas Laborales
          </Link>
        </div>
        <div className={styles.category}>
          <p className={styles.navTitle}>Explorar</p>
          <Link href="/search/companies" className={styles.option}>
            <Image className={styles.navIcon} src={CompanyIcon} alt="Companies" width={320} height={320} priority />
            Empresas
          </Link>
          <Link href="/search/users" className={styles.option}>
            <Image className={styles.navIcon} src={UserIcon} alt="Users" width={320} height={320} priority />
            Usuarios
          </Link>
        </div>
        {isLogged && (
          <>
            {isCompanyAdmin && (
              <div className={styles.category}>
                <p className={styles.navTitle}>Empresa</p>
                {adminCompany?.id ? (
                  <>
                    <Link href={`/profile/company?id=${adminCompany.id}`} className={styles.option} title={adminCompany.name}>
                      <Image className={styles.navIcon} src={CompanyIcon} alt="Mi empresa" width={320} height={320} priority />
                      Mi empresa
                    </Link>
                    <Link href={`/updateCompany`} className={styles.option} title="Editar empresa">
                      <Image className={styles.navIcon} src={CompanyIcon} alt="Editar empresa" width={320} height={320} priority />
                      Editar empresa
                    </Link>
                    <Link href={`/company/jobs`} className={styles.option} title="Gestionar ofertas">
                      <Image className={styles.navIcon} src={CompanyIcon} alt="Gestionar Ofertas Laborales" width={320} height={320} priority />
                      Gestionar Ofertas
                    </Link>
                  </>
                ) : (
                  <Link href="/createCompany" className={styles.option} title="Crear empresa">
                    <Image className={styles.navIcon} src={CompanyIcon} alt="Crear empresa" width={320} height={320} priority />
                    Crear empresa
                  </Link>
                )}
              </div>
            )}
            {isCompanyAdmin && (
              <div className={styles.category}>
                <p className={styles.navTitle}>Finanzas</p>
                <Link href="/finance" className={styles.option}>
                  <Image className={styles.navIcon} src={BillingIcon} alt="Billing" width={320} height={320} priority />
                  Resumen
                </Link>
              </div>
            )}
            {!isCompanyAdmin && (
              <>
                <div className={styles.category}>
                  <p className={styles.navTitle}>Procesos</p>
                  <Link href="/applications" className={styles.option}>
                    <Image className={styles.navIcon} src={ActivePositionsIcon} alt="Positions" width={320} height={320} priority />
                    Posiciones Activas
                  </Link>
                  <Link href="/referrals/completed" className={styles.option}>
                    <Image className={styles.navIcon} src={CompletedIcon} alt="Completed" width={320} height={320} priority />
                    Procesos Completados
                  </Link>
                </div>
                <div className={styles.category}>
                  <p className={styles.navTitle}>Reclutadores</p>
                  <Link href="/referrals/active" className={styles.option}>
                    <Image className={styles.navIcon} src={ReferralIcon} alt="Referrals" width={320} height={320} priority />
                    Mis Referidos
                  </Link>
                </div>
                <div className={styles.category}>
                  <p className={styles.navTitle}>Finanzas</p>
                  <Link href="/finance/users" className={styles.option}>
                    <Image className={styles.navIcon} src={BillingIcon} alt="Billing" width={320} height={320} priority />
                    Resumen
                  </Link>
                </div>
              </>
            )}
            <div className={styles.category}>
              <p className={styles.navTitle}>Bandeja de Entrada</p>
              <Link href="/notifications" className={styles.option} aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount})` : "Notificaciones"}>
                <span className={styles.iconWithBadge}>
                  <Image className={styles.navIcon} src={NotificationsIcon} alt="Notifications" width={320} height={320} priority />
                  {unreadCount > 0 ? (
                    <span className={styles.badge} aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
                  ) : null}
                </span>
                Notificaciones
              </Link>
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
