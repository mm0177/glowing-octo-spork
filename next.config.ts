import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence Turbopack root-detection warning (workspace has multiple lockfiles)
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
