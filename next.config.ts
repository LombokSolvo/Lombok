import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Phone testing: `npm run dev` listens on the whole network, but Next's dev server refuses to serve its JavaScript to any
// address that is not localhost, so a phone opening http://<your-mac>:3000 gets the page but no taps work. Allow this
// machine's own network addresses. Only used by `next dev`; builds and the live site ignore it.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((n): n is NonNullable<typeof n> => !!n && n.family === "IPv4" && !n.internal)
  .map((n) => n.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  // The private deployment's switch, also known in the browser (src/lib/personal.ts). Inlined at build time.
  env: { SOLVO_PERSONAL: process.env.SOLVO_PERSONAL ?? "", SOLVO_COACH_REAL: process.env.SOLVO_COACH_REAL ?? "" },
  /* config options here */
  cacheComponents: true,
  // The service worker file must never be served from a cache, or phones keep running an old one. Allow it to control the whole site.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
