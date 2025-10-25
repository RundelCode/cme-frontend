"use client";
import React, { useEffect, useMemo, useState } from "react";
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ?? "/api/graphql";
import styles from "./updateProfile.module.css";
import { PropagateLoader } from "react-spinners";

async function gql<T>(q: string, variables?: any) {
  const started = Date.now();
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables }),
  });

  const raw = await res.text().catch(() => "");
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { }

  if (!res.ok || json?.errors?.length) {
    console.groupCollapsed(
      `🟥 GraphQL error (${res.status} ${res.statusText}) in ${Date.now() - started}ms`
    );
    console.log("endpoint:", GRAPHQL_ENDPOINT);
    console.log("request.variables:", variables);
    console.log("response.headers:", Object.fromEntries(res.headers.entries()));
    console.log("response.raw:", raw);
    console.log("response.json:", json);
    console.groupEnd();
    throw new Error(
      json?.errors?.map((e: any) => e?.message).filter(Boolean).join(" | ") ||
      json?.message ||
      `No se pudo completar la operación. Revisa los campos e intenta nuevamente. (${res.status})`
    );
  }
  return (json?.data ?? null) as T;
}

/* ========== Queries ========== */
const AUTH_ME = `query { authMe { id email role } }`;

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
      experience { role company start end description }
      education { degree institution start end description }
      cv_url
    }
  }
`;

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
      experience { role company start end description }
      education { degree institution start end description }
      cv_url
    }
  }
`;

/* ========== Tipos ========== */
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
  end?: string;   // YYYY-MM o "present"
  description?: string;
};

type UploadKind = "avatar" | "cover" | "cv";

/* ========== Upload helper (proxy Next) ========== */
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

/* ========== Utils ========== */
const belongsToMe = (url: string | null | undefined, me: string | null) => {
  if (!url || !me) return true;
  const m = url.match(/\/users\/([0-9a-f-]{36})\//i);
  return !m || m[1] === me;
};

const hasContent = (obj: Record<string, unknown>) =>
  Object.values(obj).some(v => typeof v === "string" && v.trim() !== "");

/* Filtra items vacíos; si queda vacío, devuelve undefined para NO enviar el campo */
function normalizeList<T extends Record<string, unknown>>(list: T[] | null | undefined): T[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const cleaned = list
    .map((it) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(it)) {
        if (typeof v === "string") {
          const t = v.trim();
          if (t !== "") out[k] = t;
        }
      }
      return out;
    })
    .filter((it) => hasContent(it)) as T[];
  return cleaned.length ? cleaned : undefined;
}

/* ========== Validaciones suaves ========== */
const reE164 = /^\+[1-9]\d{7,14}$/;          // + y 8–15 dígitos
const reYYYYMM = /^\d{4}-(0[1-9]|1[0-2])$/;   // YYYY-MM

function compareYYYYMM(a: string, b: string) {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return ya * 100 + ma - (yb * 100 + mb);
}

export default function UpdateProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Mensajes globales "ligeros"
  const [formError, setFormError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [meId, setMeId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [skillsStr, setSkillsStr] = useState("");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [cvUrl, setCvUrl] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [aboutMe, setAboutMe] = useState("");

  const [experience, setExperience] = useState<ExperienceItem[]>([]);
  const [education, setEducation] = useState<EducationItem[]>([]);

  // Flags de "end = present"
  const [expPresent, setExpPresent] = useState<boolean[]>([]);
  const [eduPresent, setEduPresent] = useState<boolean[]>([]);

  // Errores por fila (inline)
  const [expRowErrors, setExpRowErrors] = useState<string[]>([]);
  const [eduRowErrors, setEduRowErrors] = useState<string[]>([]);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);

  // Previews
  const avatarPreview = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl || undefined),
    [avatarFile, avatarUrl]
  );
  const coverPreview = useMemo(
    () => (coverFile ? URL.createObjectURL(coverFile) : coverUrl || undefined),
    [coverFile, coverUrl]
  );

  /* ========== Carga inicial ========== */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setFormError(null);
        setOk(null);

        const auth = await gql<{ authMe: { id: string } | null }>(AUTH_ME);
        const userId = auth?.authMe?.id ?? null;
        if (!userId) throw new Error("No autenticado");
        setMeId(userId);

        const me = await gql<{ myProfile: any }>(MY_PROFILE);
        const p = me?.myProfile;

        setFullName(p?.full_name ?? "");
        setOccupation(p?.occupation ?? "");
        setSkillsStr(Array.isArray(p?.skills) ? p.skills.join(", ") : "");

        setAvatarUrl(p?.profile_picture ?? null);
        setCoverUrl(p?.cover_photo ?? null);
        setCvUrl(p?.cv_url ?? null);

        setPhone(p?.phone ?? "");
        setAboutMe(p?.about_me ?? "");

        const expList: ExperienceItem[] = Array.isArray(p?.experience) ? p.experience : [];
        const eduList: EducationItem[] = Array.isArray(p?.education) ? p.education : [];

        setExperience(expList);
        setEducation(eduList);

        setExpPresent(expList.map(it => (it.end ?? "").toLowerCase() === "present"));
        setEduPresent(eduList.map(it => (it.end ?? "").toLowerCase() === "present"));

        setExpRowErrors(expList.map(() => ""));
        setEduRowErrors(eduList.map(() => ""));

        if (p?.profile_picture && !belongsToMe(p.profile_picture, userId)) {
          console.warn("⚠️ El avatar actual no pertenece a tu cuenta. Se limpiará si no subes uno nuevo.");
        }
        if (p?.cover_photo && !belongsToMe(p.cover_photo, userId)) {
          console.warn("⚠️ La portada actual no pertenece a tu cuenta. Se limpiará si no subes una nueva.");
        }
        if (p?.cv_url && !belongsToMe(p.cv_url, userId)) {
          console.warn("⚠️ El CV actual no pertenece a tu cuenta. Se limpiará si no subes uno nuevo.");
        }
      } catch (e: any) {
        console.error("🟥 Error cargando perfil:", e);
        setFormError(e?.message ?? "Error");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ========== Helpers listas ========== */
  const addExp = () => {
    setExperience((xs) => [...xs, { role: "", company: "", start: "", end: "", description: "" }]);
    setExpPresent((xs) => [...xs, false]);
    setExpRowErrors((xs) => [...xs, ""]);
  };
  const delExp = (i: number) => {
    setExperience((xs) => xs.filter((_, j) => j !== i));
    setExpPresent((xs) => xs.filter((_, j) => j !== i));
    setExpRowErrors((xs) => xs.filter((_, j) => j !== i));
  };
  const updExp = (i: number, patch: Partial<ExperienceItem>) => {
    setExperience((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  const addEdu = () => {
    setEducation((xs) => [...xs, { degree: "", institution: "", start: "", end: "", description: "" }]);
    setEduPresent((xs) => [...xs, false]);
    setEduRowErrors((xs) => [...xs, ""]);
  };
  const delEdu = (i: number) => {
    setEducation((xs) => xs.filter((_, j) => j !== i));
    setEduPresent((xs) => xs.filter((_, j) => j !== i));
    setEduRowErrors((xs) => xs.filter((_, j) => j !== i));
  };
  const updEdu = (i: number, patch: Partial<EducationItem>) => {
    setEducation((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  // Toggles “presente” SIN usar estado obsoleto
  const toggleExpPresent = (i: number) => {
    setExpPresent(prev => {
      const nx = [...prev];
      const presentNext = !nx[i];
      nx[i] = presentNext;
      setExperience(exp =>
        exp.map((x, j) => j === i ? { ...x, end: presentNext ? "present" : "" } : x)
      );
      return nx;
    });
  };
  const toggleEduPresent = (i: number) => {
    setEduPresent(prev => {
      const nx = [...prev];
      const presentNext = !nx[i];
      nx[i] = presentNext;
      setEducation(edu =>
        edu.map((x, j) => j === i ? { ...x, end: presentNext ? "present" : "" } : x)
      );
      return nx;
    });
  };

  // Validación inline por fila (se ejecuta en submit; no borra el formulario)
  function validateRows() {
    const expErrs = experience.map(() => "");
    const eduErrs = education.map(() => "");

    experience.forEach((it, i) => {
      const s = (it.start ?? "").trim();
      const e = (it.end ?? "").trim();
      if (s && !reYYYYMM.test(s)) {
        expErrs[i] = "“Inicio” debe ser YYYY-MM (ej: 2023-07).";
      } else if (e && !(reYYYYMM.test(e) || /^present$/i.test(e))) {
        expErrs[i] = "“Fin” debe ser YYYY-MM o \"present\".";
      } else if (reYYYYMM.test(s) && reYYYYMM.test(e) && compareYYYYMM(s, e) > 0) {
        expErrs[i] = "“Inicio” no puede ser posterior a “Fin”.";
      }
    });

    education.forEach((it, i) => {
      const s = (it.start ?? "").trim();
      const e = (it.end ?? "").trim();
      if (s && !reYYYYMM.test(s)) {
        eduErrs[i] = "“Inicio” debe ser YYYY-MM (ej: 2023-07).";
      } else if (e && !(reYYYYMM.test(e) || /^present$/i.test(e))) {
        eduErrs[i] = "“Fin” debe ser YYYY-MM o \"present\".";
      } else if (reYYYYMM.test(s) && reYYYYMM.test(e) && compareYYYYMM(s, e) > 0) {
        eduErrs[i] = "“Inicio” no puede ser posterior a “Fin”.";
      }
    });

    setExpRowErrors(expErrs);
    setEduRowErrors(eduErrs);

    const hasAny = [...expErrs, ...eduErrs].some(Boolean);
    return !hasAny;
  }

  /* ========== Submit ========== */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setOk(null);

    try {
      if (!meId) throw new Error("No autenticado");

      // Validación suave
      if (phone.trim() && !reE164.test(phone.trim())) {
        setFormError("El teléfono debe estar en formato internacional E.164, por ejemplo: +573001234567.");
        setSaving(false);
        return;
      }
      if (!validateRows()) {
        setFormError("Corrige los campos indicados.");
        setSaving(false);
        return;
      }

      let newCoverUrl: string | null = coverUrl;
      let newAvatarUrl: string | null = avatarUrl;
      let newCvUrl: string | null = cvUrl;

      // Subidas nuevas
      if (coverFile) {
        const up = await uploadOneShot("cover", coverFile);
        newCoverUrl = up.url;
      }
      if (avatarFile) {
        const up = await uploadOneShot("avatar", avatarFile);
        newAvatarUrl = up.url;
      }
      if (cvFile) {
        if (!/\.pdf$/i.test(cvFile.name)) {
          setFormError("El CV debe ser un archivo PDF.");
          setSaving(false);
          return;
        }
        const up = await uploadOneShot("cv", cvFile);
        newCvUrl = up.url;
      }

      // Ownership checks
      if (newAvatarUrl && !belongsToMe(newAvatarUrl, meId)) newAvatarUrl = null;
      if (newCoverUrl && !belongsToMe(newCoverUrl, meId)) newCoverUrl = null;
      if (newCvUrl && !belongsToMe(newCvUrl, meId)) newCvUrl = null;

      // Normaliza skills -> undefined si vacío
      const skillsArr =
        skillsStr
          ? skillsStr.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined;

      const expClean = normalizeList<ExperienceItem>(experience);
      const eduClean = normalizeList<EducationItem>(education);

      const cleanCvUrl =
        newCvUrl && String(newCvUrl).trim().length > 0 ? newCvUrl : undefined;
        
      if (!newCvUrl) newCvUrl = undefined as any
      

      const input: any = {
        fullName: fullName || undefined,
        occupation: occupation || undefined,
        skills: skillsArr,
        profilePicture: newAvatarUrl ?? undefined,
        coverPhoto: newCoverUrl ?? undefined,
        cvUrl: cleanCvUrl,                  // << NUNCA "", solo URL válida o undefined
        phone: phone || undefined,
        aboutMe: aboutMe || undefined,
        experience: expClean,               // undefined si no hay items
        education: eduClean,                // idem
      };

      console.log("🟨 PATCH updateMyProfile input:", input);
      const resp = await gql<{ updateMyProfile: any }>(UPDATE_MY_PROFILE, { input });
      console.log("🟩 PATCH updateMyProfile resp:", resp?.updateMyProfile);

      setAvatarUrl(newAvatarUrl ?? null);
      setCoverUrl(newCoverUrl ?? null);
      setCvUrl(newCvUrl ?? null);

      setAvatarFile(null);
      setCoverFile(null);
      setCvFile(null);

      setOk("Perfil actualizado correctamente.");
    } catch (e: any) {
      console.error("🟥 Error updateMyProfile:", e);
      setFormError("No se pudo actualizar el perfil. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  /* ========== Render ========== */
  if (loading) {
    return <div className={styles.loading}><PropagateLoader /></div> as any;
  }

  return (
    <>
      <header className={styles.header}>
        <h3 className={styles.title}>Editar mi perfil</h3>
        <p className={styles.sub}>Actualiza tu información básica, imágenes y CV.</p>
      </header>

      <form onSubmit={onSubmit} className={styles.form} noValidate>
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
            <input
              type="file"
              accept="image/*"
              className={styles.file}
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            />
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
            <input
              type="file"
              accept="image/*"
              className={styles.file}
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <span className={styles.hint}>PNG/JPG recomendado 512x512+</span>
        </div>

        {/* Campos básicos */}
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label}>Nombre completo</label>
            <input
              className={styles.input}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Ocupación</label>
            <input
              className={styles.input}
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="Software Engineer"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Teléfono</label>
            <input
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 300 000 0000"
              inputMode="tel"
            />
            <small className={styles.hint}>Formato internacional E.164 (ej: +573001234567)</small>
          </div>

          <div className={styles.fieldWide}>
            <label className={styles.label}>Skills (separadas por coma)</label>
            <input
              className={styles.input}
              value={skillsStr}
              onChange={(e) => setSkillsStr(e.target.value)}
              placeholder="React, NestJS, PostgreSQL"
            />
          </div>

          <div className={styles.fieldWide}>
            <label className={styles.label}>Sobre mí</label>
            <textarea
              className={styles.textarea}
              rows={4}
              value={aboutMe}
              onChange={(e) => setAboutMe(e.target.value)}
              placeholder="Resumen breve de tu perfil"
            />
          </div>
        </div>

        {/* Experiencia */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4>Experiencia</h4>
            <button type="button" className={styles.smallBtn} onClick={addExp}>+ Añadir</button>
          </div>
          {experience.length === 0 && <p className={styles.muted}>Sin registros</p>}
          {experience.map((item, i) => {
            const present = expPresent[i] ?? false;
            const rowErr = expRowErrors[i] ?? "";
            return (
              <div className={styles.card} key={`exp-${i}`}>
                <div className={styles.cardRow}>
                  <input
                    className={styles.input}
                    placeholder="Cargo"
                    value={item.role ?? ""}
                    onChange={(e) => updExp(i, { role: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Empresa"
                    value={item.company ?? ""}
                    onChange={(e) => updExp(i, { company: e.target.value })}
                  />
                </div>
                <div className={styles.cardRow}>
                  <div className={styles.fieldInline}>
                    <label className={styles.smallLabel}>Inicio</label>
                    <input
                      type="month"
                      className={styles.input}
                      value={item.start ?? ""}
                      onChange={(e) => {
                        // value ya viene como YYYY-MM
                        updExp(i, { start: e.target.value });
                      }}
                    />
                  </div>
                  <div className={styles.fieldInline}>
                    <label className={styles.smallLabel}>Fin</label>
                    <input
                      type="month"
                      className={styles.input}
                      value={present ? "" : (reYYYYMM.test(item.end ?? "") ? (item.end ?? "") : "")}
                      disabled={present}
                      onChange={(e) => {
                        const v = e.target.value; // YYYY-MM
                        updExp(i, { end: v });
                      }}
                    />
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={present}
                        onChange={() => toggleExpPresent(i)}
                      />
                      Actualmente trabajo aquí
                    </label>
                  </div>
                </div>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="Descripción"
                  value={item.description ?? ""}
                  onChange={(e) => updExp(i, { description: e.target.value })}
                />
                {rowErr && <div className={styles.rowError}>{rowErr}</div>}
                <div className={styles.rowRight}>
                  <button type="button" className={styles.dangerBtn} onClick={() => delExp(i)}>Eliminar</button>
                </div>
              </div>
            );
          })}
        </section>

        {/* Educación */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4>Educación</h4>
            <button type="button" className={styles.smallBtn} onClick={addEdu}>+ Añadir</button>
          </div>
          {education.length === 0 && <p className={styles.muted}>Sin registros</p>}
          {education.map((item, i) => {
            const present = eduPresent[i] ?? false;
            const rowErr = eduRowErrors[i] ?? "";
            return (
              <div className={styles.card} key={`edu-${i}`}>
                <div className={styles.cardRow}>
                  <input
                    className={styles.input}
                    placeholder="Título/Grado"
                    value={item.degree ?? ""}
                    onChange={(e) => updEdu(i, { degree: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Institución"
                    value={item.institution ?? ""}
                    onChange={(e) => updEdu(i, { institution: e.target.value })}
                  />
                </div>
                <div className={styles.cardRow}>
                  <div className={styles.fieldInline}>
                    <label className={styles.smallLabel}>Inicio</label>
                    <input
                      type="month"
                      className={styles.input}
                      value={item.start ?? ""}
                      onChange={(e) => updEdu(i, { start: e.target.value })}
                    />
                  </div>
                  <div className={styles.fieldInline}>
                    <label className={styles.smallLabel}>Fin</label>
                    <input
                      type="month"
                      className={styles.input}
                      value={present ? "" : (reYYYYMM.test(item.end ?? "") ? (item.end ?? "") : "")}
                      disabled={present}
                      onChange={(e) => updEdu(i, { end: e.target.value })}
                    />
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={present}
                        onChange={() => toggleEduPresent(i)}
                      />
                      Aún cursando
                    </label>
                  </div>
                </div>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="Descripción"
                  value={item.description ?? ""}
                  onChange={(e) => updEdu(i, { description: e.target.value })}
                />
                {rowErr && <div className={styles.rowError}>{rowErr}</div>}
                <div className={styles.rowRight}>
                  <button type="button" className={styles.dangerBtn} onClick={() => delEdu(i)}>Eliminar</button>
                </div>
              </div>
            );
          })}
        </section>

        {/* Banner suave de mensajes */}
        {formError && <div className={styles.error} role="alert">{formError}</div>}
        {ok && <div className={styles.ok} role="status">{ok}</div>}

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
              setFormError(null);
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
