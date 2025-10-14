export async function gqlUploadMultipart<T>(
  endpoint: string,
  operationName: string,
  mutation: string,
  file: File
) {
  const form = new FormData();
  const operations = JSON.stringify({
    query: mutation,
    operationName,
    variables: { file: null },
  });
  const map = JSON.stringify({ "0": ["variables.file"] });

  form.append('operations', operations);
  form.append('map', map);
  form.append('0', file, (file as any).name || 'upload.bin');

  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });

  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}

  if (!res.ok || json?.errors?.length) {
    const msg = json?.errors?.[0]?.message ?? `Upload failed (${res.status})`;
    throw new Error(msg);
  }
  return json.data as T;
}
