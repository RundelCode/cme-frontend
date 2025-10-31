'use client';

import { useEffect, useState } from 'react';
import styles from './navbar.module.css';

export default function NavToggle() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        document.body.classList.toggle('nav-open', open);

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        const onResize = () => {
            if (window.innerWidth >= 1024) setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('resize', onResize);
        return () => {
            document.body.classList.remove('nav-open');
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onResize);
        };
    }, [open]);

    return (
        <>
            <button
                type="button"
                className={styles.burgerBtn}
                aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={open}
                aria-controls="app-sidebar"
                onClick={() => setOpen(v => !v)}
            >
                <span className={styles.burgerBar} />
                <span className={styles.burgerBar} />
                <span className={styles.burgerBar} />
            </button>

            <div
                className={styles.navOverlay}
                aria-hidden={open ? 'false' : 'true'}
                onClick={() => setOpen(false)}
            />
        </>
    );
}
