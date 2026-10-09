import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
