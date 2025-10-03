// lib/gql-upload.ts
export async function gqlUploadMultipart<T>(
  endpoint: string,
  operationName: string,           // 'uploadAvatar' | 'uploadCover'
  mutation: string,                // ej: `mutation UploadAvatar($file: Upload!) { uploadAvatar(file: $file) { url path } }`
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
  form.append('0', file, file.name);

  // LOGS
  console.log('[upload] endpoint=', endpoint);
  console.log('[upload] opName=', operationName);
  console.log('[upload] file name/size/type=', file.name, file.size, file.type);

  const res = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'apollo-require-preflight': 'true',
      'x-apollo-operation-name': operationName,
    } as any,
    body: form,
  });

  const text = await res.text();
  console.log('[upload] status=', res.status);
  console.log('[upload] raw response=', text);

  let json: any = {};
  try { json = JSON.parse(text); } catch {}

  if (!res.ok || json?.errors?.length) {
    const msg = json?.errors?.[0]?.message ?? `Upload failed (${res.status})`;
    throw new Error(msg);
  }
  return json.data as T;
}
