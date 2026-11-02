import type { NextConfig } from "next";

const config: NextConfig = {
  // The service worker must always be fetched fresh, or a stale one can pin
  // an old build to the tablet.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
  // Tablets installed before the hub moved the till to /pos still run the old
  // page until their service worker updates. These keep its sales syncing.
  async rewrites() {
    return [
      { source: "/api/sync", destination: "/api/pos/sync" },
      { source: "/api/login", destination: "/api/pos/login" },
      { source: "/api/logout", destination: "/api/pos/logout" },
    ];
  },
};

export default config;
