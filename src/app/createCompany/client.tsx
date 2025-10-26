"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./createCompany.module.css";
import { useRouter } from "next/navigation";

const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ?? "/api/graphql";

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

type UploadKind = "avatar" | "cover";

async function uploadSelf(kind: UploadKind, file: File) {
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
    throw new Error(msg);
  }
  if (!json?.url) throw new Error(`Respuesta inválida al subir ${kind}`);
  return json as { url: string; bucket: string; path: string };
}

type CreateCompanyPayload = {
  name: string;
  email: string;
  website?: string;
  description?: string;
  industry?: string;
  location?: string;
  subscriptionPlan?: "FREE";
  companyRating?: number;
  boolVerified?: boolean;
  verifiedAt?: string | null;
  profilePicture?: string | null;
  coverPhoto?: string | null;  
  adminId?: string;            
};

export default function Client() {
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setAuthLoading(true);
        const me = await gql<{ authMe: { id: string; role: string | null } }>(AUTH_ME);
        const r = me?.authMe?.role ?? null;
        const uid = me?.authMe?.id ?? null;
        setRole(r);
        setUserId(uid);
        if ((r ?? "").toLowerCase() !== "company_admin") {
          setAuthErr("Solo los usuarios con rol 'company_admin' pueden crear empresas.");
        }
      } catch (e: any) {
        setAuthErr(e?.message ?? "No autenticado");
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const isCompanyAdmin = useMemo(() => (role ?? "").toLowerCase() === "company_admin", [role]);

  const [form, setForm] = useState<CreateCompanyPayload>({
    name: "",
    email: "",
    website: "",
    description: "",
    industry: "",
    location: "",
    subscriptionPlan: "FREE",
    companyRating: 0,
    boolVerified: false,
    verifiedAt: null,
    profilePicture: null,
    coverPhoto: null,
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : undefined), [logoFile]);
  const coverPreview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : undefined), [coverFile]);

  useEffect(() => () => {
    try { if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview); } catch { }
    try { if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview); } catch { }
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

    if (!isCompanyAdmin) {
      setError("No tienes permisos para crear empresas.");
      return;
    }
    if (!userId) {
      setError("No se pudo identificar al administrador (userId). Vuelve a iniciar sesión.");
      return;
    }
    if (!form.name?.trim()) {
      setError("El campo 'name' es obligatorio");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || "")) {
      setError("Ingresa un email válido");
      return;
    }

    setLoading(true);
    try {
      let coverUrl: string | undefined;
      let logoUrl: string | undefined;

      if (coverFile) {
        const up = await uploadSelf("cover", coverFile);
        coverUrl = up.url;
      }
      if (logoFile) {
        const up = await uploadSelf("avatar", logoFile);
        logoUrl = up.url;
      }

      const payload: CreateCompanyPayload = {
        name: form.name.trim(),
        email: form.email.trim(),
        website: form.website?.trim() || undefined,
        description: form.description?.trim() || undefined,
        industry: form.industry?.trim() || undefined,
        location: form.location?.trim() || undefined,
        subscriptionPlan: "FREE",
        companyRating: 0,
        boolVerified: false,
        verifiedAt: undefined,
        profilePicture: logoUrl ?? undefined,
        coverPhoto: coverUrl ?? undefined,
        adminId: userId,
      };

      const res = await fetch("/api/company/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "No se pudo crear la empresa");

      setCreated(json.company);
      setShowModal(true);
    } catch (err: any) {
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

          {authLoading ? (
            <div className={styles.statusNote}>Cargando…</div>
          ) : authErr ? (
            <div className={styles.statusError}>{authErr}</div>
          ) : null}

          <form onSubmit={handleSubmit} className={styles.formGrid} aria-disabled={!isCompanyAdmin}>
            <div className={styles.coverBlock}>
              <div className={styles.cover} aria-hidden="true">
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover preview" className={styles.coverImg} />
                ) : (
                  <span className={styles.coverText}>Imagen de portada</span>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                disabled={!isCompanyAdmin}
                aria-label="Subir portada"
              />
            </div>

            <div className={styles.logoRow}>
              <div className={styles.logoWrapper}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className={styles.logoPreview} />
                ) : (
                  <div className={styles.logoPlaceholder} />
                )}
              </div>
              <div className={styles.logoActions}>
                <label className={styles.small}>Logo / foto de perfil</label>
                <input
                  type="file"
                  accept="image/*"
                  className={styles.fileInput}
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  disabled={!isCompanyAdmin}
                  aria-label="Subir logo"
                />
                <span className={styles.helperText}>PNG/JPG recomendado 512x512+</span>
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Nombre *</label>
              <input
                className={styles.input}
                placeholder="Nombre de tu empresa"
                value={form.name}
                onChange={onChange("name")}
                required
                disabled={!isCompanyAdmin}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Email *</label>
              <input
                className={styles.input}
                placeholder="ejemplo@gmail.com"
                value={form.email}
                onChange={onChange("email")}
                type="email"
                required
                disabled={!isCompanyAdmin}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Sitio web</label>
              <input
                className={styles.input}
                placeholder="https://ejemplo.com"
                value={form.website || ""}
                onChange={onChange("website")}
                type="url"
                disabled={!isCompanyAdmin}
              />
            </div>

            <div className={styles.twoCols}>
              <div className={styles.formField}>
                <label className={styles.label}>Industria</label>
                <input
                  className={styles.input}
                  placeholder="Industria a la que pertenece tu empresa"
                  value={form.industry || ""}
                  onChange={onChange("industry")}
                  disabled={!isCompanyAdmin}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Ubicación</label>
                <input
                  className={styles.input}
                  placeholder="Ciudad, País"
                  value={form.location || ""}
                  onChange={onChange("location")}
                  disabled={!isCompanyAdmin}
                />
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Descripción</label>
              <textarea
                className={styles.textarea}
                placeholder="Describe tu empresa"
                value={form.description || ""}
                onChange={onChange("description")}
                rows={4}
                disabled={!isCompanyAdmin}
              />
            </div>

            {error && <div className={styles.statusError}>{error}</div>}
            {created && !showModal && (
              <div className={styles.statusOk}>
                <b>Empresa creada:</b> {created.name} (ID: {created.id})
              </div>
            )}

            <div className={styles.actions}>
              <button className={styles.primaryBtn} disabled={loading || !isCompanyAdmin} type="submit">
                {loading ? "Creando…" : "Crear empresa"}
              </button>
              <button
                className={styles.secundaryBtn}
                type="button"
                disabled={loading}
                onClick={() => {
                  setForm({
                    name: "",
                    email: "",
                    website: "",
                    description: "",
                    industry: "",
                    location: "",
                    subscriptionPlan: "FREE",
                    companyRating: 0,
                    boolVerified: false,
                    verifiedAt: null,
                    profilePicture: null,
                    coverPhoto: null,
                  });
                  setError(null);
                  setCreated(null);
                  setLogoFile(null);
                  setCoverFile(null);
                }}
              >
                Limpiar
              </button>
            </div>
          </form>
        </div>
      </div>

      {showModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>¡Empresa creada!</h3>
            <p className={styles.modalBody}>
              {created?.name ? (
                <>La empresa <b>{created.name}</b> se creó correctamente.</>
              ) : (
                "La empresa se creó correctamente."
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
