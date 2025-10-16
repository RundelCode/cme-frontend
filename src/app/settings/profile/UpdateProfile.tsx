"use client";
import React, { useEffect, useMemo, useState } from "react";
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ?? "/api/graphql";
import styles from "./updateProfile.module.css";
import { PropagateLoader } from "react-spinners";

async function gql<T>(q: string, variables?: any) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors?.length) {
    console.error("🟥 GraphQL error:", json);
    throw new Error(json?.errors?.[0]?.message ?? `GraphQL failed (${res.status})`);
  }
  return json.data as T;
}

const AUTH_ME = `query { authMe { id email role } }`;

// ✅ Pide subcampos para experience y education
const MY_PROFILE = `
  query {
    myProfile {
      id
      email
      full_name
      profile_picture
      cover_photo
      occupation
      skills
      role
      phone
      about_me
      experience {
        role
        company
        start
        end
        description
      }
      education {
        degree
        institution
        start
        end
        description
      }
      cv_url
    }
  }
`;

// ✅ También aquí devuelve subcampos
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
      phone
      about_me
      experience {
        role
        company
        start
        end
        description
      }
      education {
        degree
        institution
        start
        end
        description
      }
      cv_url
    }
  }
`;

// ---- Tipos ligeros para experiencia/educación ----
export type ExperienceItem = {
  role?: string;
  company?: string;
  start?: string; // YYYY-MM
  end?: string;   // YYYY-MM o "present"
  description?: string;
};
export type EducationItem = {
  degree?: string;
  institution?: string;
  start?: string; // YYYY-MM
  end?: string;   // YYYY-MM
  description?: string;
};

type UploadKind = "avatar" | "cover" | "cv";

async function uploadOneShot(kind: UploadKind, file: File) {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await fetch(`/api/uploads/self/${kind}`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.error ||
      (json?.message && (Array.isArray(json.message) ? json.message.join(", ") : json.message)) ||
      `Fallo subiendo ${kind} (${res.status})`;
    console.error("🟥 uploadOneShot error:", { kind, json });
    throw new Error(msg);
  }
  console.log("🟩 uploadOneShot ok:", { kind, json });
  return json as { url: string; bucket: string; path: string };
}

export default function UpdateProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [skillsStr, setSkillsStr] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  // ---- nuevos campos ----
  const [phone, setPhone] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [experience, setExperience] = useState<ExperienceItem[]>([]);
  const [education, setEducation] = useState<EducationItem[]>([]);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);

  // Previews
  const avatarPreview = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl || undefined), [avatarFile, avatarUrl]);
  const coverPreview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : coverUrl || undefined), [coverFile, coverUrl]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const auth = await gql<{ authMe: { id: string } }>(AUTH_ME);
        if (!auth?.authMe?.id) throw new Error("No autenticado");

        const me = await gql<{ myProfile: any }>(MY_PROFILE);
        const p = me?.myProfile;
        console.log("🟦 CARGA myProfile:", p);

        setFullName(p?.full_name ?? "");
        setOccupation(p?.occupation ?? "");
        setSkillsStr((p?.skills ?? []).join(", "));
        setAvatarUrl(p?.profile_picture ?? null);
        setCoverUrl(p?.cover_photo ?? null);

        setPhone(p?.phone ?? "");
        setAboutMe(p?.about_me ?? "");
        setCvUrl(p?.cv_url ?? null);
        setExperience(Array.isArray(p?.experience) ? p.experience : []);
        setEducation(Array.isArray(p?.education) ? p.education : []);
      } catch (e: any) {
        console.error("🟥 Error cargando perfil:", e);
        setErr(e?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      try {
        if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
        if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
      } catch { }
    };
  }, []); // no dependas de previews para evitar recargas

  const addExp = () => setExperience((xs) => [...xs, { role: "", company: "", start: "", end: "", description: "" }]);
  const delExp = (i: number) => setExperience((xs) => xs.filter((_, j) => j !== i));
  const updExp = (i: number, patch: Partial<ExperienceItem>) => setExperience((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const addEdu = () => setEducation((xs) => [...xs, { degree: "", institution: "", start: "", end: "", description: "" }]);
  const delEdu = (i: number) => setEducation((xs) => xs.filter((_, j) => j !== i));
  const updEdu = (i: number, patch: Partial<EducationItem>) => setEducation((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setOk(null);

    try {
      // 1) Subidas
      let newCoverUrl = coverUrl;
      let newAvatarUrl = avatarUrl;
      let newCvUrl = cvUrl;

      if (coverFile) {
        const up = await uploadOneShot("cover", coverFile);
        if (!up?.url) throw new Error("No se pudo subir la portada");
        newCoverUrl = up.url;
      }
      if (avatarFile) {
        const up = await uploadOneShot("avatar", avatarFile);
        if (!up?.url) throw new Error("No se pudo subir el avatar");
        newAvatarUrl = up.url;
      }
      if (cvFile) {
        if (!/\.pdf$/i.test(cvFile.name)) throw new Error("El CV debe ser PDF");
        const up = await uploadOneShot("cv", cvFile);
        if (!up?.url) throw new Error("No se pudo subir el CV");
        newCvUrl = up.url;
      }

      // 2) Construir input (si quieres “limpiar”, envía [] en lugar de undefined)
      const input: any = {
        fullName: fullName || undefined,
        occupation: occupation || undefined,
        skills: skillsStr ? skillsStr.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        profilePicture: newAvatarUrl || undefined,
        coverPhoto: newCoverUrl || undefined,
        phone: phone || undefined,
        aboutMe: aboutMe || undefined,
        cvUrl: newCvUrl || undefined,
        experience: Array.isArray(experience) ? experience : [],
        education: Array.isArray(education) ? education : [],
      };

      console.log("🟨 PATCH updateMyProfile input:", input);

      const resp = await gql<{ updateMyProfile: any }>(UPDATE_MY_PROFILE, { input });
      console.log("🟩 PATCH updateMyProfile resp:", resp?.updateMyProfile);

      // 3) Sync estado local
      setAvatarUrl(newAvatarUrl ?? null);
      setCoverUrl(newCoverUrl ?? null);
      setCvUrl(newCvUrl ?? null);
      setAvatarFile(null);
      setCoverFile(null);
      setCvFile(null);
      setOk("Perfil actualizado correctamente.");
    } catch (e: any) {
      console.error("🟥 Error updateMyProfile:", e);
      setErr(e?.message ?? "Error actualizando el perfil");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.loading}><PropagateLoader /></div> as any;
  if (err && !saving) return <div className={styles.error}>{err}</div> as any;

  return (
    <>
      <header className={styles.header}>
        <h3 className={styles.title}>Editar mi perfil</h3>
        <p className={styles.sub}>Actualiza tu información básica, imágenes y CV.</p>
      </header>

      <form onSubmit={onSubmit} className={styles.form}>
        {/* Cover */}
        <div className={styles.coverBox}>
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPreview} alt="Cover" className={styles.coverImg} />
          ) : (
            <div className={styles.coverPlaceholder}>Imagen de portada</div>
          )}
          <label className={styles.coverBtn}>
            Cambiar portada
            <input type="file" accept="image/*" className={styles.file} onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        {/* Avatar */}
        <div className={styles.avatarRow}>
          <div className={styles.avatarWrap}>
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Avatar" className={styles.avatar} />
            ) : (
              <div className={styles.avatarFallback} />
            )}
          </div>
          <label className={styles.avatarBtn}>
            Cambiar avatar
            <input type="file" accept="image/*" className={styles.file} onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
          </label>
          <span className={styles.hint}>PNG/JPG recomendado 512x512+</span>
        </div>

        {/* Campos básicos */}
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label}>Nombre completo</label>
            <input className={styles.input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Ocupación</label>
            <input className={styles.input} value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Software Engineer" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Teléfono</label>
            <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300 000 0000" />
          </div>

          <div className={styles.fieldWide}>
            <label className={styles.label}>Skills (separadas por coma)</label>
            <input className={styles.input} value={skillsStr} onChange={(e) => setSkillsStr(e.target.value)} placeholder="React, NestJS, PostgreSQL" />
          </div>

          <div className={styles.fieldWide}>
            <label className={styles.label}>Sobre mí</label>
            <textarea className={styles.textarea} rows={4} value={aboutMe} onChange={(e) => setAboutMe(e.target.value)} placeholder="Resumen breve de tu perfil" />
          </div>
        </div>

        {/* Experiencia */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4>Experiencia</h4>
            <button type="button" className={styles.smallBtn} onClick={addExp}>+ Añadir</button>
          </div>
          {experience.length === 0 && <p className={styles.muted}>Sin registros</p>}
          {experience.map((item, i) => (
            <div className={styles.card} key={`exp-${i}`}>
              <div className={styles.cardRow}>
                <input className={styles.input} placeholder="Cargo" value={item.role ?? ""} onChange={(e) => updExp(i, { role: e.target.value })} />
                <input className={styles.input} placeholder="Empresa" value={item.company ?? ""} onChange={(e) => updExp(i, { company: e.target.value })} />
              </div>
              <div className={styles.cardRow}>
                <input className={styles.input} placeholder="Inicio (YYYY-MM)" value={item.start ?? ""} onChange={(e) => updExp(i, { start: e.target.value })} />
                <input className={styles.input} placeholder="Fin (YYYY-MM o present)" value={item.end ?? ""} onChange={(e) => updExp(i, { end: e.target.value })} />
              </div>
              <textarea className={styles.textarea} rows={3} placeholder="Descripción" value={item.description ?? ""} onChange={(e) => updExp(i, { description: e.target.value })} />
              <div className={styles.rowRight}>
                <button type="button" className={styles.dangerBtn} onClick={() => delExp(i)}>Eliminar</button>
              </div>
            </div>
          ))}
        </section>

        {/* Educación */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4>Educación</h4>
            <button type="button" className={styles.smallBtn} onClick={addEdu}>+ Añadir</button>
          </div>
          {education.length === 0 && <p className={styles.muted}>Sin registros</p>}
          {education.map((item, i) => (
            <div className={styles.card} key={`edu-${i}`}>
              <div className={styles.cardRow}>
                <input className={styles.input} placeholder="Título/Grado" value={item.degree ?? ""} onChange={(e) => updEdu(i, { degree: e.target.value })} />
                <input className={styles.input} placeholder="Institución" value={item.institution ?? ""} onChange={(e) => updEdu(i, { institution: e.target.value })} />
              </div>
              <div className={styles.cardRow}>
                <input className={styles.input} placeholder="Inicio (YYYY-MM)" value={item.start ?? ""} onChange={(e) => updEdu(i, { start: e.target.value })} />
                <input className={styles.input} placeholder="Fin (YYYY-MM)" value={item.end ?? ""} onChange={(e) => updEdu(i, { end: e.target.value })} />
              </div>
              <textarea className={styles.textarea} rows={3} placeholder="Descripción" value={item.description ?? ""} onChange={(e) => updEdu(i, { description: e.target.value })} />
              <div className={styles.rowRight}>
                <button type="button" className={styles.dangerBtn} onClick={() => delEdu(i)}>Eliminar</button>
              </div>
            </div>
          ))}
        </section>

        {/* CV */}
        <section className={styles.section}>
          <h4 className={styles.mb8}>Currículum (PDF)</h4>
          <div className={styles.cardRow}>
            <input type="file" accept="application/pdf" className={styles.file} onChange={(e) => setCvFile(e.target.files?.[0] ?? null)} />
            {cvUrl && (
              <a className={styles.link} href={cvUrl} target="_blank" rel="noreferrer">Ver CV actual</a>
            )}
          </div>
        </section>

        {/* Estados */}
        {err && <div className={styles.error}>{err}</div>}
        {ok && <div className={styles.ok}>{ok}</div>}

        {/* Acciones */}
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={saving}
            onClick={() => {
              setAvatarFile(null);
              setCoverFile(null);
              setCvFile(null);
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
