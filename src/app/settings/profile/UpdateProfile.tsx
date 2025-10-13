'use client';
import React, { useEffect, useState } from 'react';
import { uploadAvatarGql, uploadCoverGql } from '.././../../../lib/uploads-client';
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ?? '/api/graphql';
import styles from './updateProfile.module.css'
import { PropagateLoader } from "react-spinners";


async function gql<T>(q: string, variables?: any) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.errors?.[0]?.message ?? `GraphQL failed (${res.status})`);
  }
  return json.data as T;
}

const AUTH_ME = `query { authMe { id email role } }`;
const MY_PROFILE = `query { myProfile { id email full_name profile_picture cover_photo occupation skills role } }`;

const UPDATE_MY_PROFILE = `
  mutation UpdateMyProfile($input: UpdateMyProfileInput!) {
    updateMyProfile(input: $input) {
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

export default function UpdateProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [occupation, setOccupation] = useState('');
  const [skillsStr, setSkillsStr] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // Previews locales
  const avatarPreview = avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl || undefined;
  const coverPreview = coverFile ? URL.createObjectURL(coverFile) : coverUrl || undefined;

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const auth = await gql<{ authMe: { id: string } }>(AUTH_ME);
        if (!auth?.authMe?.id) throw new Error('No autenticado');

        const me = await gql<{ myProfile: any }>(MY_PROFILE);
        const p = me?.myProfile;
        setFullName(p?.full_name ?? '');
        setOccupation(p?.occupation ?? '');
        setSkillsStr((p?.skills ?? []).join(', '));
        setAvatarUrl(p?.profile_picture ?? null);
        setCoverUrl(p?.cover_photo ?? null);
      } catch (e: any) {
        setErr(e?.message ?? 'Error');
      } finally {
        setLoading(false);
      }
    })();
    // revoke previews al desmontar
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
      if (coverPreview?.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
    };
  }, []); // eslint-disable-line

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErr(null);
      setOk(null);

      let newAvatarUrl = avatarUrl;
      let newCoverUrl = coverUrl;

      if (avatarFile) {
        const up = await uploadAvatarGql(avatarFile);
        newAvatarUrl = up?.url ?? null;
      }
      if (coverFile) {
        const up = await uploadCoverGql(coverFile);
        newCoverUrl = up?.url ?? null;
      }

      const input = {
        fullName: fullName || undefined,
        occupation: occupation || undefined,
        skills: skillsStr
          ? skillsStr.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
        profilePicture: newAvatarUrl || undefined,
        coverPhoto: newCoverUrl || undefined,
      };

      await gql(UPDATE_MY_PROFILE, { input });
      setAvatarUrl(newAvatarUrl ?? null);
      setCoverUrl(newCoverUrl ?? null);
      setAvatarFile(null);
      setCoverFile(null);
      setOk('Perfil actualizado correctamente.');
    } catch (e: any) {
      setErr(e?.message ?? 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.loading}><PropagateLoader/></div>;
  if (err && !saving) return <div className={styles.error}>{err}</div>;

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.title}>Editar mi perfil</h3>
        <p className={styles.sub}>Actualiza tu información básica y tus imágenes.</p>
      </header>

      <form onSubmit={onSubmit} className={styles.form}>
        {/* Cover */}
        <div className={styles.coverBox}>
          {coverPreview ? (
            <img src={coverPreview} alt="Cover" className={styles.coverImg} />
          ) : (
            <div className={styles.coverPlaceholder}>Imagen de portada</div>
          )}
          <label className={styles.coverBtn}>
            Cambiar portada
            <input
              type="file"
              accept="image/*"
              className={styles.file}
              onChange={e => setCoverFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {/* Avatar */}
        <div className={styles.avatarRow}>
          <div className={styles.avatarWrap}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className={styles.avatar} />
            ) : (
              <div className={styles.avatarFallback} />
            )}
          </div>
          <label className={styles.avatarBtn}>
            Cambiar avatar
            <input
              type="file"
              accept="image/*"
              className={styles.file}
              onChange={e => setAvatarFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <span className={styles.hint}>PNG/JPG recomendado 512x512+</span>
        </div>

        {/* Campos */}
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label}>Nombre completo</label>
            <input
              className={styles.input}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Ocupación</label>
            <input
              className={styles.input}
              value={occupation}
              onChange={e => setOccupation(e.target.value)}
              placeholder="Software Engineer"
            />
          </div>

          <div className={styles.fieldWide}>
            <label className={styles.label}>Skills (separadas por coma)</label>
            <input
              className={styles.input}
              value={skillsStr}
              onChange={e => setSkillsStr(e.target.value)}
              placeholder="React, NestJS, PostgreSQL"
            />
          </div>
        </div>

        {/* Estados */}
        {err && <div className={styles.error}>{err}</div>}
        {ok && <div className={styles.ok}>{ok}</div>}

        {/* Acciones */}
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={saving}
            onClick={() => {
              setAvatarFile(null);
              setCoverFile(null);
              setOk(null);
              setErr(null);
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
