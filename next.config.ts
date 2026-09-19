import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Old nested path → stable local student login URL
      { source: "/student/login", destination: "/student-login", permanent: false },
    ];
  },
  async rewrites() {
    return [
      // UI is Next only (:3000). Flask :5050 is API — never rewrite to HTML /login.
      { source: "/api/:path*", destination: "http://127.0.0.1:5050/api/:path*" },
      // Legacy lab UI prefix (same upstream API)
      { source: "/lab/api/:path*", destination: "http://127.0.0.1:5050/api/:path*" },
    ];
  },
  async headers() {
    return [
      {
        source: "/lab/api/me",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private",
          },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/me",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private",
          },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/lab/api/chat-api",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-transform" },
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
      {
        source: "/api/chat-api",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-transform" },
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
    ];
  },
};

export default nextConfig;
