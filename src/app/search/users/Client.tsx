"use client";

import { useEffect, useState } from "react";
import styles from "./users.module.css";
import Image from "next/image";
import UserIcon from "../../../../public/images/icons/Nav/Users.png";
import SearchIcon from "../../../../public/images/icons/search.png";
import { PropagateLoader } from "react-spinners";
import ProfilePlaceholder from "../../../../public/images/placeholders/company.png";
import { UserProfile } from "../../../../lib/profile-types";
import { searchProfiles } from "../../../../lib/profile-client";
import Link from "next/link";

function renderStars(value: number | null | undefined, max = 5) {
    if (value == null) return null;
    const rating = Math.min(5, Math.max(0, value));
    const rounded = Math.round(rating);
    const stars = [];
    for (let i = 1; i <= max; i++) {
        stars.push(<span key={i}>{i <= rounded ? "★" : "☆"}</span>);
    }
    return (
        <>
            {stars}
            <span className={styles.ratingNumber}>({rating.toFixed(1)})</span>
        </>
    );
}

export default function UserSearchClient() {
    const [q, setQ] = useState("");
    const [items, setItems] = useState<UserProfile[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const run = async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await searchProfiles({
                q,
                sortBy: "REPUTATION",
                order: "DESC",
                limit: 20,
            });
            setItems(res);
        } catch (e: any) {
            setErr(e?.message ?? "Error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        run();
    }, []);

    return (
        <div className={styles.main}>
            <div className={styles.blueLine} />

            <div className={styles.title}>
                <Image
                    className={styles.companyIcon}
                    src={UserIcon}
                    alt="Users"
                    width={320}
                    height={320}
                    priority
                />
                <h2>Usuarios</h2>
            </div>

            <form
                className={styles.searchForm}
                onSubmit={(e) => {
                    e.preventDefault();
                    run();
                }}
            >
                <div className={styles.searchInput}>
                    <Image
                        src={SearchIcon}
                        alt="Search"
                        className={styles.searchIcon}
                        width={16}
                        height={16}
                    />
                    <input
                        type="text"
                        placeholder="Buscar usuarios..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        className={styles.searchField}
                    />
                </div>
                <button type="submit" className={styles.submitButton}>
                    Buscar
                </button>
            </form>


            {loading ? (
                <div className={styles.loader}>
                    <PropagateLoader />
                </div>
            ) : (
                <ul className={styles.results}>
                    {items?.map((u) => (
                        <Link href={`/profiles/users?id=${u.id}`} key={u.id} className={styles.card}>
                            <Image
                                className={styles.profilePicture}
                                src={u.profile_picture || ProfilePlaceholder}
                                alt={u.full_name ?? u.email}
                                width={100}
                                height={100}
                                priority
                            />

                            <div className={styles.profileInfo}>
                                <div className={styles.profileTitle}>
                                    {u.full_name ?? u.email}
                                </div>

                                <div>
                                    {u.occupation ?? "—"} · {u.role ?? "—"} ({u.status ?? "—"})
                                </div>

                                {u.reputation_score != null && (
                                    <div className={styles.rating}>
                                        {renderStars(u.reputation_score)}
                                    </div>
                                )}
                            </div>
                        </Link>
                    ))}
                </ul>
            )}
            {err && <p>{err}</p>}

        </div>
    );
}
