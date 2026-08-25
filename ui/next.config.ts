import type { NextConfig } from "next";

const onGitHubPages = process.env.GITHUB_ACTIONS === "true";
const basePath = onGitHubPages ? "/opentrue-code" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
  images: { unoptimized: true },
};

export default nextConfig;
