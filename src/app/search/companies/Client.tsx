"use client";

import { useEffect, useState } from "react";
import { searchCompanies } from "../../../../lib/company-client";
import { Company } from "../../../../lib/company-types";
import styles from './company.module.css'
import Image from "next/image";
import CompanyIcon from '../../../../public/images/icons/Nav/Companies.png'
import SearchIcon from '../../../../public/images/icons/search.png'
import { PropagateLoader } from "react-spinners";
import ProfilePlaceholder from '.././../../../public/images/placeholders/company.png'
import Link from "next/link";


function renderStars(rating: number, max = 5) {
    const stars = [];
    const rounded = Math.round(rating);
    for (let i = 1; i <= max; i++) {
        if (i <= rounded) {
            stars.push(<span key={i}>★</span>);
        } else {
            stars.push(<span key={i}>☆</span>);
        }
    }
    return stars;
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
            const res = await searchCompanies({
                q,
                sortBy: "RATING",
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
                    src={CompanyIcon}
                    alt="Jobs"
                    width={320}
                    height={320}
                    priority
                />
                <h2>Empresas</h2>
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
                        placeholder="Buscar empresas..."
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
                <div className={styles.loader}><PropagateLoader></PropagateLoader></div>
            ) : (
                <ul className={styles.results}>
                    {items?.map((c) => (

                        <Link href={`/profiles/companies?id=${c.id}`} key={c.id} className={styles.card}>
                            <Image
                                className={styles.profilePicture}
                                src={c.profilePicture || ProfilePlaceholder}
                                alt={c.name}
                                width={100}
                                height={100}
                                priority
                            />

                            <div className={styles.profileInfo}>
                                <div className={styles.profileTitle}>
                                    {c.name}
                                    {c.boolVerified && (
                                        <span className={styles.verifiedStar}>★</span>
                                    )}
                                </div>

                                <div>
                                    {c.industry ?? "—"} · {c.location ?? "—"}
                                </div>

                                {c.companyRating != null && (
                                    <div className={styles.rating}>
                                        {renderStars(c.companyRating)}
                                        <span className={styles.ratingNumber}>
                                            ({c.companyRating.toFixed(1)})
                                        </span>
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
