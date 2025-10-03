import Image from "next/image";
import Link from "next/link";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import Navbar from "../../../../components/navbar/navbar";
import styles from "./userProfile.module.css";
import { gqlRequest } from "../../../../lib/gql";

export const dynamic = "force-dynamic";

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT!;

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

type ProfileByIdQuery = { profile: Profile | null };

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
                        <p>Verifica que el perfil sea público.</p>
                        <div className={styles.actions}>
                            <Link className={styles.ctaBtn} href="/search/users">
                                Volver
                            </Link>
                        </div>
                    </div>
                )}

                {id && profile && (
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
                                <div className={styles.meta}>
                                    <span className={styles.email}>{profile.email}</span>
                                    {profile.role && <span className={styles.role}> · {profile.role}</span>}
                                </div>
                                {profile.occupation && (
                                    <div className={styles.occupation}>{profile.occupation}</div>
                                )}
                            </div>
                        </div>

                        <div className={styles.section}>
                            <h3>Skills</h3>
                            {profile.skills?.length ? (
                                <ul className={styles.skills}>
                                    {profile.skills.map((s) => (
                                        <li key={s} className={styles.skill}>
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className={styles.muted}>Este usuario aún no ha añadido skills.</p>
                            )}
                        </div>

                        <div className={styles.section}>
                            <h3>Detalles</h3>
                            <dl className={styles.detailList}>
                                <div className={styles.detailRow}>
                                    <dt>Email</dt>
                                    <dd>{profile.email}</dd>
                                </div>
                                <div className={styles.detailRow}>
                                    <dt>Ocupación</dt>
                                    <dd>{profile.occupation ?? "—"}</dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
