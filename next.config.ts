import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages serves this app as static files. All durable application
  // data already lives in IndexedDB, so no server runtime is required.
  output: "export",
};

export default nextConfig;
