import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* type errors fail the build — the codebase is kept tsc-clean */
  reactStrictMode: false,
};

export default nextConfig;
