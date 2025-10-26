'use client';

import React, { useState } from 'react';
import styles from './settings.module.css';
import UpdateProfile from './profile/UpdateProfile';

type Props = {};

export default function Client({ }: Props) {
    const [active, setActive] = useState<number>(1);

    return (
        <div className={styles.main}>
            <div className={styles.card}>
                <aside className={styles.settingNav}>
                    <h2 className={styles.navTitle}>Ajustes</h2>

                    <div className={styles.options}>
                        <div className={styles.optionSection}>
                            <p className={styles.sectionLabel}>Perfil</p>

                            <button
                                onClick={() => setActive(1)}
                                className={`${styles.option} ${active === 1 ? styles.optionActive : ''}`}
                            >
                                Editar mi perfil
                            </button>
                        </div>
                    </div>
                </aside>

                <section className={styles.activeOption}>
                    <div className={styles.contentWrap}>
                        {active === 1 && <UpdateProfile />}

                        {active === 2 && <div className={styles.bannerError}>Demo de contenido</div>}
                    </div>
                </section>
            </div>
        </div>
    );
}
