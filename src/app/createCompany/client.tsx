"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./createCompany.module.css";
import { useRouter } from "next/navigation";

type UploadKind = "avatar" | "cover";

async function uploadSelf(kind: UploadKind, file: File) {
  console.log("[uploadSelf] 🚀 Iniciando subida", {
    kind,
    name: file?.name,
    size: file?.size,
    type: file?.type,
  });

  const fd = new FormData();
  fd.append("file", file, file.name);

  const res = await fetch(`/api/uploads/self/${kind}`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });

  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }

  console.log("[uploadSelf] 📥 Respuesta del servidor", {
    status: res.status,
    ok: res.ok,
    raw,
    json,
  });

  if (!res.ok || !json?.url) throw new Error(json?.error || `Fallo subiendo ${kind}`);

  console.log("[uploadSelf] ✅ URL generada correctamente", {
    kind,
    url: json.url,
    bucket: json.bucket,
    path: json.path,
  });

  return json as { url: string; bucket: string; path: string };
}


type CreateCompanyPayload = {
  name: string;
  email: string;
  website?: string;
  description?: string;
  industry?: string;
  location?: string;
  profilePicture?: string;
  coverPhoto?: string;
  subscriptionPlan?: "free" | "basic" | "pro";
  boolVerified?: boolean;
};

export default function Client() {
  const router = useRouter();

  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authErr, setAuthErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/me", { credentials: "include", cache: "no-store" });
        const me = await meRes.json().catch(() => null);
        console.log("[createCompany] /api/me", { status: meRes.status, ok: meRes.ok, me });
        const roles: string[] = []
          .concat(me?.role || [])
          .concat(me?.user?.role || [])
          .concat(Array.isArray(me?.roles) ? me.roles : [])
          .concat(Array.isArray(me?.user?.roles) ? me.user.roles : []);
        const roleStrs = roles.map((r) => String(r).trim().toLowerCase());
        const flags = [me?.is_company_admin, me?.user?.is_company_admin].some(Boolean);
        const aliases = new Set(["company_admin", "companyadmin", "employer", "company-owner", "company_owner", "org_admin", "employer_admin"]);
        const hit = roleStrs.some((r) => aliases.has(r));
        setIsCompanyAdmin(Boolean(flags || hit));
        if (!(flags || hit)) setAuthErr("Solo los usuarios con rol 'company_admin' pueden crear empresas.");
      } catch (e) {
        console.error("[createCompany] auth error", e);
        setAuthErr("No autenticado");
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const [form, setForm] = useState<CreateCompanyPayload>({
    name: "",
    email: "",
    website: "",
    description: "",
    industry: "",
    location: "",
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : undefined), [logoFile]);
  const coverPreview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : undefined), [coverFile]);

  useEffect(() => {
    return () => {
      try { if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview); } catch { }
      try { if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview); } catch { }
    };
  }, [logoPreview, coverPreview]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);

  const onChange =
    (key: keyof CreateCompanyPayload) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value =
          e.currentTarget.type === "number"
            ? (e.currentTarget as HTMLInputElement).valueAsNumber
            : e.currentTarget.type === "checkbox"
              ? (e.currentTarget as HTMLInputElement).checked
              : e.currentTarget.value;
        setForm((f) => ({ ...f, [key]: value as any }));
      };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (!isCompanyAdmin) { setError("No tienes permisos para crear empresas."); return; }
    if (!form.name?.trim()) { setError("El campo 'Nombre' es obligatorio."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || "")) { setError("Ingresa un email válido."); return; }

    setLoading(true);
    try {
      let coverUrl: string | undefined;
      let logoUrl: string | undefined;

      if (coverFile) {
        console.log("[createCompany] uploading cover...");
        const up = await uploadSelf("cover", coverFile);
        coverUrl = up.url;
        console.log("[createCompany] cover uploaded", { coverUrl });
      }
      if (logoFile) {
        console.log("[createCompany] uploading avatar...");
        const up = await uploadSelf("avatar", logoFile);
        logoUrl = up.url;
        console.log("[createCompany] avatar uploaded", { logoUrl });
      }

      const payload: CreateCompanyPayload = {
        name: form.name.trim(),
        email: form.email.trim(),
        website: form.website?.trim() || undefined,
        description: form.description?.trim() || undefined,
        industry: form.industry?.trim() || undefined,
        location: form.location?.trim() || undefined,
        profilePicture: logoUrl || undefined,
        coverPhoto: coverUrl || undefined,
        subscriptionPlan: "free",
        boolVerified: false,
      };

      console.log("[createCompany] request payload -> /api/company/create", payload);

      const res = await fetch("/api/company/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
      console.log("[createCompany] response /api/company/create", { status: res.status, ok: res.ok, raw, json });
      if (!res.ok) throw new Error(json?.error || "No se pudo crear la empresa");

      setCreated(json.company);
      setShowModal(true);
    } catch (err: any) {
      console.error("[createCompany] submit error", err);
      setError(err?.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function handleModalAccept() {
    setShowModal(false);
    router.push("/");
  }

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.formCard}>
          <h2 className={styles.title}>Crear empresa</h2>
          <p className={styles.subtitle}>Completa los datos de tu empresa.</p>

          {authLoading ? <div className={styles.statusNote}>Cargando…</div> : authErr ? <div className={styles.statusError}>{authErr}</div> : null}

          <form onSubmit={handleSubmit} className={styles.formGrid} aria-disabled={!isCompanyAdmin}>
            <div className={styles.coverBlock}>
              <div className={styles.cover} aria-hidden="true">
                {coverPreview ? <img src={coverPreview} alt="Cover preview" className={styles.coverImg} /> : <span className={styles.coverText}>Imagen de portada</span>}
              </div>
              <input type="file" accept="image/*" className={styles.fileInput} onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} disabled={!isCompanyAdmin} aria-label="Subir portada" />
            </div>

            <div className={styles.logoRow}>
              <div className={styles.logoWrapper}>
                {logoPreview ? <img src={logoPreview} alt="Logo preview" className={styles.logoPreview} /> : <div className={styles.logoPlaceholder} />}
              </div>
              <div className={styles.logoActions}>
                <label className={styles.small}>Logo / foto de perfil</label>
                <input type="file" accept="image/*" className={styles.fileInput} onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} disabled={!isCompanyAdmin} aria-label="Subir logo" />
                <span className={styles.helperText}>PNG/JPG recomendado 512x512+</span>
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Nombre *</label>
              <input className={styles.input} placeholder="Nombre de tu empresa" value={form.name} onChange={onChange("name")} required disabled={!isCompanyAdmin} />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Email *</label>
              <input className={styles.input} placeholder="ejemplo@gmail.com" value={form.email} onChange={onChange("email")} type="email" required disabled={!isCompanyAdmin} />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Sitio web</label>
              <input className={styles.input} placeholder="https://ejemplo.com" value={form.website || ""} onChange={onChange("website")} type="url" disabled={!isCompanyAdmin} />
            </div>

            <div className={styles.twoCols}>
              <div className={styles.formField}>
                <label className={styles.label}>Industria</label>
                <input className={styles.input} placeholder="Industria" value={form.industry || ""} onChange={onChange("industry")} disabled={!isCompanyAdmin} />
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Ubicación</label>
                <input className={styles.input} placeholder="Ciudad, País" value={form.location || ""} onChange={onChange("location")} disabled={!isCompanyAdmin} />
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Descripción</label>
              <textarea className={styles.textarea} placeholder="Describe tu empresa" value={form.description || ""} onChange={onChange("description")} rows={4} disabled={!isCompanyAdmin} />
            </div>

            {error && <div className={styles.statusError}>{error}</div>}
            {created && !showModal && <div className={styles.statusOk}><b>Empresa creada:</b> {created.name} (ID: {created.id})</div>}

            <div className={styles.actions}>
              <button className={styles.primaryBtn} disabled={loading || !isCompanyAdmin} type="submit">{loading ? "Creando…" : "Crear empresa"}</button>
              <button className={styles.secundaryBtn} type="button" disabled={loading} onClick={() => {
                setForm({ name: "", email: "", website: "", description: "", industry: "", location: "" });
                setError(null); setCreated(null); setLogoFile(null); setCoverFile(null);
              }}>Limpiar</button>
            </div>
          </form>
        </div>
      </div>

      {showModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>¡Empresa creada!</h3>
            <p className={styles.modalBody}>{created?.name ? <>La empresa <b>{created.name}</b> se creó correctamente.</> : "La empresa se creó correctamente."}</p>
            <div className={styles.modalActions}>
              <button className={styles.primaryBtn} onClick={handleModalAccept}>Aceptar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
