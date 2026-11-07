import type { NextConfig } from "next";

// The app runs entirely in the browser, so it is built as a static site (`out/`) that any static
// host can serve. Set NEXT_PUBLIC_BASE_PATH when it lives under a sub-path, such as GitHub Pages.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
};

export default nextConfig;
