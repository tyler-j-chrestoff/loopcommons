import type { NextConfig } from "next";
import { execSync } from "child_process";

const commitSha = process.env.NEXT_PUBLIC_BUILD_COMMIT
  || (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();

const nextConfig: NextConfig = {
  transpilePackages: ["@loopcommons/llm"],
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: commitSha,
  },
};

export default nextConfig;
