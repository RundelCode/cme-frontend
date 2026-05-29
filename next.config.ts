import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "pvffnzxifmawqusmmbmn.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;