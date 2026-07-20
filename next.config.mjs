// Static export for GitHub Pages. The deploy workflow sets PAGES_BASE_PATH
// to "/<repo-name>" automatically (or "" for a *.github.io repo).
const basePath = process.env.PAGES_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  trailingSlash: true, // emits folder/index.html so plain Apache hosting serves clean URLs
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
