'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const UPLOADS_BASE =
  process.env.NEXT_PUBLIC_UPLOADS_BASE_URL ?? 'http://localhost:3015';

export type UploadResp = { url: string; bucket: string; path: string };

const supabase = createClientComponentClient();

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw new Error(error.message || 'No se pudo obtener la sesión');

  const token = data?.session?.access_token;
  if (!token) throw new Error('No autenticado');
  return token;
}

async function postFormDirect(endpoint: string, file: File): Promise<UploadResp> {
  const token = await getAccessToken();

  const fd = new FormData();
  fd.append('file', file, file.name);

  const res = await fetch(endpoint, {
    method: 'POST',
    body: fd,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });


  let json: any = null;
  try {
    json = await res.json();
  } catch (err) {
  }

  if (!res.ok) {
    const msg =
      json?.message || json?.error || `Upload failed (${res.status} ${res.statusText})`;
    throw new Error(
      typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(', ') : 'Upload failed'
    );
  }

  if (!json?.url || !json?.bucket || !json?.path) {
    throw new Error('Respuesta inválida del servidor de uploads');
  }

  return json as UploadResp;
}

export async function uploadAvatarGql(file: File): Promise<UploadResp> {
  if (!file) throw new Error('Archivo de avatar requerido');
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera 10MB');
  if (!/^image\//.test(file.type)) throw new Error('Formato de imagen inválido');

  const endpoint = `${UPLOADS_BASE}/uploads/self/avatar`;
  return postFormDirect(endpoint, file);
}

export async function uploadCoverGql(file: File): Promise<UploadResp> {
  if (!file) throw new Error('Archivo de portada requerido');
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera 10MB');
  if (!/^image\//.test(file.type)) throw new Error('Formato de imagen inválido');

  const endpoint = `${UPLOADS_BASE}/uploads/self/cover`;
  return postFormDirect(endpoint, file);
} 
 