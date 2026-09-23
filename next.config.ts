import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project — there's an unrelated stray
  // package-lock.json in the user's home directory that Next.js otherwise
  // picks up as a false-positive monorepo root.
  turbopack: {
    root: path.join(__dirname),
  },
  // The lab moved under Bikit Pro on 2026-09-23. Old addresses live in
  // browser histories and in the owner's notes; they keep working.
  async redirects() {
    return [
      { source: "/labs/imu", destination: "/pro", permanent: true },
      {
        source: "/labs/imu/:path*",
        destination: "/pro/sessoes/:path*",
        permanent: true,
      },
      { source: "/labs/sensor", destination: "/pro/sensor", permanent: true },
    ];
  },
};

export default nextConfig;
