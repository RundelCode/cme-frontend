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
                {/* Sidebar */}
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

                            <button
                                onClick={() => setActive(2)}
                                className={`${styles.option} ${active === 2 ? styles.optionActive : ''}`}
                            >
                                Prueba
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Pane derecho */}
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
