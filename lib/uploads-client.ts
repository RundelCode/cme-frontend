import { gqlUploadMultipart } from './gql-upload';

export const UPLOADS_GQL_PROXY =
  process.env.NEXT_PUBLIC_UPLOADS_GQL_PROXY || '/api/uploads/graphql';

export function uploadAvatarGql(file: File) {
  const mutation = `mutation UploadAvatar($file: Upload!) {
    uploadAvatar(file: $file) { url path }
  }`;
  return gqlUploadMultipart<{ uploadAvatar: { url: string; path: string } }>(
    UPLOADS_GQL_PROXY,  // <— aquí
    'UploadAvatar',
    mutation,
    file
  ).then(r => r.uploadAvatar);
}

export function uploadCoverGql(file: File) {
  const mutation = `mutation UploadCover($file: Upload!) {
    uploadCover(file: $file) { url path }
  }`;
  return gqlUploadMultipart<{ uploadCover: { url: string; path: string } }>(
    UPLOADS_GQL_PROXY,  // <— aquí
    'UploadCover',
    mutation,
    file
  ).then(r => r.uploadCover);
}
