import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production deployment is on the root path now.
  basePath: "",
  assetPrefix: "",

  // Standalone output for Docker/Cloud Run.
  // Emits a self-contained server.js + only the required node_modules subset.
  // Set DOCKER_BUILD=true in the Dockerfile build stage — never set this locally.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,

  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
      allowedOrigins: ["studio.egonair.com", "egonair-frontend-729286791857.europe-west1.run.app", "localhost:3000"],
    },
  },
};

export default nextConfig;
