'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import styles from './navbar.module.css';
import Link from 'next/link';

type Props = {
  name: string;
  email: string;
  imageUrl: string | null;
};

export default function ProfileMini({ name, email, imageUrl }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const doLogout = async () => {
    try {
      const res = await fetch('/api/logout', { method: 'POST' });
      if (!res.ok) throw new Error('logout_failed');
      window.location.href = '/login';
    } catch (e) {
      console.error('logout error', e);
      window.location.reload();
    }
  };

  const truncateMiddle = (s: string, max = 26) => {
    if (s.length <= max) return s;
    const keep = Math.max(4, Math.floor((max - 1) / 2));
    return s.slice(0, keep) + '…' + s.slice(-keep);
  };

  return (
    <div className={styles.profileMiniWrap}>
      <div className={styles.profileMini}>
        <div className={styles.avatar}>
          {imageUrl ? (
            <Image src={imageUrl} alt={name} width={40} height={40} className={styles.avatarImg} />
          ) : (
            <div className={styles.avatarFallback}>{initials(name)}</div>
          )}
        </div>

        <div className={styles.profileText}>
          <div className={styles.profileName}>{name}</div>
          <a className={styles.profileEmail} href={`mailto:${email}`} title={email}>
            {truncateMiddle(email)}
          </a>
        </div>

        <button
          ref={btnRef}
          className={styles.kebab}
          aria-label="Más opciones"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          ⋮
        </button>
      </div>

      {open && (
        <div ref={popRef} className={styles.profileMenu} role="menu">
          <div className={styles.profileMenuItems}>
            <Link href="/mi-perfil" className={styles.menuItem} role="menuitem">Ver perfil</Link>
            <Link href="/ajustes" className={styles.menuItem} role="menuitem">Ajustes</Link>
          </div>

          <div className={styles.menuDivider} />
          <button onClick={doLogout} className={styles.menuItemDanger} role="menuitem">
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}
