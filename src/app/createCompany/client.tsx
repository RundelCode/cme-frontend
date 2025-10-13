'use client';

import React, { useState } from 'react';
import styles from './createCompany.module.css';
import { useRouter } from 'next/navigation';

type Props = {};

type CreateCompanyPayload = {
  name: string;
  email: string;
  website?: string;
  description?: string;
  industry?: string;
  location?: string;
  subscriptionPlan?: 'FREE';
  companyRating?: number;
  boolVerified?: boolean;
  verifiedAt?: string | null;
  profilePicture?: string | null;
  coverPhoto?: string | null;
};

export default function Client({}: Props) {
  const router = useRouter();

  const [form, setForm] = useState<CreateCompanyPayload>({
    name: '',
    email: '',
    website: '',
    description: '',
    industry: '',
    location: '',
    subscriptionPlan: 'FREE',
    companyRating: 0,
    boolVerified: false,
    verifiedAt: null,
    profilePicture: null,
    coverPhoto: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);

  const onChange =
    (key: keyof CreateCompanyPayload) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value =
        e.currentTarget.type === 'number'
          ? (e.currentTarget as HTMLInputElement).valueAsNumber
          : e.currentTarget.type === 'checkbox'
          ? (e.currentTarget as HTMLInputElement).checked
          : e.currentTarget.value;

      setForm((f) => ({ ...f, [key]: value as any }));
    };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);

    if (!form.name?.trim()) {
      setError("El campo 'name' es obligatorio");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || '')) {
      setError('Ingresa un email válido');
      return;
    }

    setLoading(true);
    try {
      const payload: CreateCompanyPayload = {
        name: form.name.trim(),
        email: form.email.trim(),
        website: form.website?.trim() || undefined,
        description: form.description?.trim() || undefined,
        industry: form.industry?.trim() || undefined,
        location: form.location?.trim() || undefined,
        subscriptionPlan: 'FREE',
        companyRating: 0,
        boolVerified: false,
        verifiedAt: undefined,
        profilePicture: undefined,
        coverPhoto: undefined,
      };

      const res = await fetch('/api/company/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: payload }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'No se pudo crear la empresa');

      setCreated(json.company);
      setShowModal(true);
    } catch (err: any) {
      setError(err?.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }

  function handleModalAccept() {
    setShowModal(false);
    router.push('/');
  }

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.formCard}>
          <h2 className={styles.title}>Crear empresa</h2>
          <p className={styles.subtitle}>
            Completa los datos de tu empresa.
          </p>

          <form onSubmit={handleSubmit} className={styles.formGrid}>
            {/* Portada: caja visual + input debajo (no encima) */}
            <div className={styles.coverBlock}>
              <div className={styles.cover} aria-hidden="true">
                <span className={styles.coverText}>Imagen de portada (pendiente)</span>
              </div>
              <input
                type="file"
                accept="image/*"
                disabled
                className={styles.fileInput}
                title="Upload pendiente"
              />
            </div>

            {/* Logo y selector, en fila clara */}
            <div className={styles.logoRow}>
              <div className={styles.logoWrapper}>
                <div className={styles.logoPlaceholder} />
              </div>
              <div className={styles.logoActions}>
                <label className={styles.small}>Logo / foto de perfil</label>
                <input
                  type="file"
                  accept="image/*"
                  disabled
                  className={styles.fileInput}
                  title="Upload pendiente"
                />
                <span className={styles.helperText}>Upload pendiente de conexión.</span>
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Nombre *</label>
              <input
                className={styles.input}
                placeholder="Nombre de tu empresa"
                value={form.name}
                onChange={onChange('name')}
                required
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Email *</label>
              <input
                className={styles.input}
                placeholder="ejemplo@gmail.com"
                value={form.email}
                onChange={onChange('email')}
                type="email"
                required
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Sitio web</label>
              <input
                className={styles.input}
                placeholder="https://ejemplo.com"
                value={form.website || ''}
                onChange={onChange('website')}
                type="url"
              />
            </div>

            <div className={styles.twoCols}>
              <div className={styles.formField}>
                <label className={styles.label}>Industria</label>
                <input
                  className={styles.input}
                  placeholder="Industria a la que pertenece tu empresa" 
                  value={form.industry || ''}
                  onChange={onChange('industry')}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Ubicación</label>
                <input
                  className={styles.input}
                  placeholder="Ciudad, País"
                  value={form.location || ''}
                  onChange={onChange('location')}
                />
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Descripción</label>
              <textarea
                className={styles.textarea}
                placeholder="Describe tu empresa"
                value={form.description || ''}
                onChange={onChange('description')}
                rows={4}
              />
            </div>

            {error && <div className={styles.statusError}>{error}</div>}
            {created && !showModal && (
              <div className={styles.statusOk}>
                <b>Empresa creada:</b> {created.name} (ID: {created.id})
              </div>
            )}

            <div className={styles.actions}>
              <button className={styles.primaryBtn} disabled={loading} type="submit">
                {loading ? 'Creando…' : 'Crear empresa'}
              </button>
              <button
                className={styles.secundaryBtn}
                type="button"
                disabled={loading}
                onClick={() => {
                  setForm({
                    name: '',
                    email: '',
                    website: '',
                    description: '',
                    industry: '',
                    location: '',
                    subscriptionPlan: 'FREE',
                    companyRating: 0,
                    boolVerified: false,
                    verifiedAt: null,
                    profilePicture: null,
                    coverPhoto: null,
                  });
                  setError(null);
                  setCreated(null);
                }}
              >
                Limpiar
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal de éxito */}
      {showModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>¡Empresa creada!</h3>
            <p className={styles.modalBody}>
              {created?.name ? (
                <>
                  La empresa <b>{created.name}</b> se creó correctamente.
                </>
              ) : (
                'La empresa se creó correctamente.'
              )}
            </p>
            <div className={styles.modalActions}>
              <button className={styles.primaryBtn} onClick={handleModalAccept}>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
