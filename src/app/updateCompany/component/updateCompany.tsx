'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './updateCompany.module.css';
import { PropagateLoader } from 'react-spinners';

async function restJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { throw new Error(`${url} devolvió no-JSON: ${raw?.slice(0, 180)}`); }
  if (!res.ok) { throw new Error(json?.error || json?.message || `HTTP ${res.status}`); }
  return json as T;
}

function normalizeRole(role: unknown): string {
  return typeof role === 'string' ? role.trim().toLowerCase() : '';
}

type Me = { id: string; role?: string | null; user?: any };
type CompanyCamel = {
  id: string;
  name: string;
  email: string | null;
  website: string | null;
  description: string | null;
  industry: string | null;
  location: string | null;
  profilePicture: string | null;
  coverPhoto: string | null;
  companyRating: number | null;
  boolVerified: boolean | null;
  subscriptionPlan: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export default function UpdateCompany() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [role, setRole] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : logoUrl || undefined), [logoFile, logoUrl]);
  const coverPreview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : coverUrl || undefined), [coverFile, coverUrl]);

  useEffect(() => {
    (async () => {
      try {
        setAuthLoading(true);
        setAuthErr(null);
        const me = await restJson<Me>('/api/me');
        const id = me?.id ?? me?.user?.id ?? null;
        const r = normalizeRole(me?.user?.role ?? (me as any)?.role ?? '');
        if (!id) throw new Error('No autenticado');
        if (r !== 'company_admin') throw new Error("Solo 'company_admin' puede editar la empresa.");
        setMeId(id);
        setRole(r);
      } catch (e: any) {
        setAuthErr(e?.message ?? 'No autenticado');
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!meId || role !== 'company_admin') return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const search = await restJson<{ items: CompanyCamel[] }>('/api/company/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: { adminId: meId, limit: 1 } }),
        });
        const c = search.items?.[0];
        if (!c?.id) {
          setCompanyId(null);
          setOk(null);
          setErr('No encontramos una empresa asociada. Crea una primero.');
          return;
        }
        setCompanyId(c.id);
        setName(c.name ?? '');
        setEmail(c.email ?? '');
        setWebsite(c.website ?? '');
        setIndustry(c.industry ?? '');
        setLocation(c.location ?? '');
        setDescription(c.description ?? '');
        setLogoUrl(c.profilePicture ?? null);
        setCoverUrl(c.coverPhoto ?? null);
      } catch (e: any) {
        setErr(e?.message ?? 'Error cargando la empresa');
      } finally {
        setLoading(false);
      }
    })();
  }, [meId, role]);

  useEffect(() => {
    return () => {
      try { if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview); } catch { }
      try { if (coverPreview?.startsWith('blob:')) URL.revokeObjectURL(coverPreview); } catch { }
    };
  }, [logoPreview, coverPreview]);

  async function uploadOne(kind: 'avatar' | 'cover', file: File) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const res = await fetch(`/api/uploads/self/${kind}`, { method: 'POST', credentials: 'include', body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.url) throw new Error(json?.error || json?.message || `Fallo subiendo ${kind}`);
    return json.url as string;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      if (!companyId) throw new Error('No hay empresa para editar.');
      if (!name.trim()) throw new Error('El nombre es obligatorio.');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresa un email válido.');

      let newCover = coverUrl;
      let newLogo = logoUrl;
      if (coverFile) newCover = await uploadOne('cover', coverFile);
      if (logoFile) newLogo = await uploadOne('avatar', logoFile);

      const payload = {
        name: name || undefined,
        email: email || undefined,
        website: website || undefined,
        industry: industry || undefined,
        location: location || undefined,
        description: description || undefined,
        profilePicture: newLogo ?? null,
        coverPhoto: newCover ?? null,
        boolVerified: false,
        subscriptionPlan: 'free',
      };

      await restJson(`/api/company/${encodeURIComponent(companyId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setLogoUrl(newLogo ?? null);
      setCoverUrl(newCover ?? null);
      setLogoFile(null);
      setCoverFile(null);
      setOk('Empresa actualizada correctamente.');
    } catch (e: any) {
      setErr(e?.message ?? 'Error actualizando la empresa');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className={styles.loading}>
        <PropagateLoader />
      </div>
    ) as any;
  }
  if (authErr) return <div className={styles.error}>{authErr}</div> as any;
  if (!companyId) return <div className={styles.error}>No encontramos una empresa asociada.</div> as any;

  return (
    <>
      <header className={styles.header}>
        <h3 className={styles.title}>Editar mi empresa</h3>
        <p className={styles.sub}>Actualiza la información básica, logo y portada de tu empresa.</p>
      </header>

      <form onSubmit={onSubmit} className={styles.form}>
        <div className={styles.coverBox}>
          {coverPreview ? <img src={coverPreview} alt="Cover" className={styles.coverImg} /> : <div className={styles.coverPlaceholder}>Imagen de portada</div>}
          <label className={styles.coverBtn}>
            Cambiar portada
            <input type="file" accept="image/*" className={styles.file} onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div className={styles.avatarRow}>
          <div className={styles.avatarWrap}>
            {logoPreview ? <img src={logoPreview} alt="Logo" className={styles.avatar} /> : <div className={styles.avatarFallback} />}
          </div>
          <label className={styles.avatarBtn}>
            Cambiar logo
            <input type="file" accept="image/*" className={styles.file} onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          </label>
          <span className={styles.hint}>PNG/JPG recomendado 512x512+</span>
        </div>

        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label}>Nombre</label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la empresa" required />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="empresa@correo.com" type="email" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Industria</label>
            <input className={styles.input} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Fintech, Retail, etc." />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Ubicación</label>
            <input className={styles.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ciudad, País" />
          </div>

          <div className={styles.fieldWide}>
            <label className={styles.label}>Sitio web</label>
            <input className={styles.input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://tuempresa.com" type="url" />
          </div>

          <div className={styles.fieldWide}>
            <label className={styles.label}>Descripción</label>
            <textarea className={styles.textarea} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe brevemente a tu empresa" />
          </div>
        </div>

        {err && <div className={styles.error}>{err}</div>}
        {ok && <div className={styles.ok}>{ok}</div>}

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn} disabled={saving || !companyId}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={saving}
            onClick={() => {
              setLogoFile(null);
              setCoverFile(null);
              setOk(null);
              setErr(null);
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
