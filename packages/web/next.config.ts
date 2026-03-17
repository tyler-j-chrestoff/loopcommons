import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@loopcommons/llm"],
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
};

export default nextConfig;
