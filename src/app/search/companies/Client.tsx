"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import styles from "./company.module.css";
import { PropagateLoader } from "react-spinners";
import { searchCompanies } from "../../../../lib/company-client";
import { Company } from "../../../../lib/company-types";
import ProfilePlaceholder from "../../../../public/images/placeholders/company.png";

function initials(name?: string | null) {
    if (!name) return "•";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "•";
}

function Stars({ value, max = 5 }: { value?: number | null; max?: number }) {
    if (value == null || Number.isNaN(value)) return null;
    const rating = Math.min(max, Math.max(0, Number(value)));
    const rounded = Math.round(rating);
    return (
        <div className={styles.rating}>
            {Array.from({ length: max }, (_, i) => (
                <span key={i} aria-hidden>
                    {i + 1 <= rounded ? "★" : "☆"}
                </span>
            ))}
            <span className={styles.ratingNumber}>({rating.toFixed(1)})</span>
        </div>
    );
}

export default function CompanySearchClient() {
    const [q, setQ] = useState("");
    const [items, setItems] = useState<Company[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const run = async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await searchCompanies({ q, sortBy: "RATING", order: "DESC", limit: 20 });
            setItems(res);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        run();
    }, []);

    const placeholderSrc =
        (ProfilePlaceholder as unknown as { src: string }).src ?? "/images/placeholders/company.png";

    const results = useMemo(() => items ?? [], [items]);

    return (
        <div className={styles.page}>
            <div className={styles.main}>
                <header className={styles.pageHeader}>
                    <h1 className={styles.title}>Empresas</h1>
                </header>

                <form
                    className={styles.searchBar}
                    onSubmit={(e) => {
                        e.preventDefault();
                        run();
                    }}
                >
                    <input
                        className={styles.searchInput}
                        placeholder="Buscar empresas…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    <button className={styles.searchBtn} type="submit">
                        Buscar
                    </button>
                </form>

                {err && <div className={styles.error}>{err}</div>}

                {loading ? (
                    <div className={styles.loading}>
                        <PropagateLoader />
                    </div>
                ) : (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Resultados</h2>
                        {results.length === 0 ? (
                            <div className={styles.empty}>Sin resultados</div>
                        ) : (
                            <ul className={styles.list}>
                                {results.map((c) => {
                                    const src = c.profilePicture || placeholderSrc;
                                    return (
                                        <li className={styles.cardItem} key={c.id}>
                                            <Link href={`/profiles/companies?id=${c.id}`} className={styles.cardLink}>
                                                <div className={styles.media}>
                                                    {c.profilePicture ? (
                                                        <Image
                                                            className={styles.avatarImg}
                                                            src={src}
                                                            alt={c.name}
                                                            width={56}
                                                            height={56}
                                                            priority
                                                        />
                                                    ) : (
                                                        <div className={styles.avatarFallback}>{initials(c.name)}</div>
                                                    )}
                                                </div>

                                                <div className={styles.content}>
                                                    <div className={styles.rowTop}>
                                                        <div className={styles.companyBlock}>
                                                            <div className={styles.companyName}>
                                                                {c.name}
                                                                {c.boolVerified && <span className={styles.verifiedStar}>★</span>}
                                                            </div>
                                                            <div className={styles.companySub}>
                                                                {c.industry ?? "—"} • {c.location ?? "—"}
                                                            </div>
                                                        </div>
                                                        <Stars value={Number(c.companyRating)} />
                                                    </div>
                                                </div>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
