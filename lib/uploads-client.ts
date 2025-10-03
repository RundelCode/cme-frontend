// lib/uploads-client.ts
import { gqlUploadMultipart } from './gql-upload';

const UP_ENDPOINT = process.env.NEXT_PUBLIC_UPLOADS_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

export const UPLOADS_GQL_PROXY =
    process.env.NEXT_PUBLIC_UPLOADS_GQL_PROXY || '/api/uploads/graphql';

export function uploadAvatarGql(file: File) {
    const mutation = `mutation UploadAvatar($file: Upload!) {
    uploadAvatar(file: $file) { url path }
  }`;
    return gqlUploadMultipart<{ uploadAvatar: { url: string; path: string } }>(
        UP_ENDPOINT,
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
        UP_ENDPOINT,
        'UploadCover',
        mutation,
        file
    ).then(r => r.uploadCover);
}
