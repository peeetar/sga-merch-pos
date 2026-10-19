import type { NextConfig } from "next";

const config: NextConfig = {
  // The service worker must always be fetched fresh, or a stale one can pin
  // an old build to the tablet.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
};

export default config;
