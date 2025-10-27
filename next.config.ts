import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'cowwaqkzthppcngogdqm.supabase.co', pathname: '/storage/v1/object/**' },
    ],
  },

}
export default nextConfig;
