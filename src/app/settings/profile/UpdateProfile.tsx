'use client';

import React, { useEffect, useState } from 'react';
import { uploadAvatarGql, uploadCoverGql } from '.././../../../lib/uploads-client';

const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ?? '/api/graphql';

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
    const [err, setErr] = useState<string | null>(null);

    const [fullName, setFullName] = useState('');
    const [occupation, setOccupation] = useState('');
    const [skillsStr, setSkillsStr] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);

    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);

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
    }, []);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            setErr(null);

            let newAvatarUrl = avatarUrl;
            let newCoverUrl = coverUrl;

            if (avatarFile) {
                const up = await uploadAvatarGql(avatarFile);
                console.log('[UpdateProfile] avatar upload result:', up);
                newAvatarUrl = up?.url ?? null;
            }

            if (coverFile) {
                const up = await uploadCoverGql(coverFile);
                console.log('[UpdateProfile] cover upload result:', up);
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
            // opcional: refrescar datos o mostrar éxito
        } catch (e: any) {
            setErr(e?.message ?? 'Error');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <p>Cargando…</p>;
    if (err) return <p style={{ color: 'red' }}>{err}</p>;

    return (
        <form onSubmit={onSubmit}>
            <h2>Actualizar perfil</h2>

            <label>Nombre completo</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} />

            <label>Ocupación</label>
            <input value={occupation} onChange={e => setOccupation(e.target.value)} />

            <label>Skills (separadas por coma)</label>
            <input value={skillsStr} onChange={e => setSkillsStr(e.target.value)} />

            <label>Avatar (solo sube si cambias)</label>
            <input type="file" accept="image/*" onChange={e => setAvatarFile(e.target.files?.[0] ?? null)} />
            {avatarUrl && <p>Actual: {avatarUrl}</p>}

            <label>Cover (solo sube si cambias)</label>
            <input type="file" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] ?? null)} />
            {coverUrl && <p>Actual: {coverUrl}</p>}

            <button type="submit">Guardar</button>
        </form>
    );
}
