import type { NextConfig } from "next";
const allowedOrigin = process.env.ALLOWED_DEV_ORIGIN;

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: allowedOrigin ? [allowedOrigin] : [],
  experimental: {
    agentFeedback: true,
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  devIndicators: false
};

export default nextConfig;
