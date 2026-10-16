import type { NextConfig } from "next";

/**
 * GitHub Pages serves this project from /khata rather than from the domain
 * root, so the base path is set at build time. Local `next dev` leaves it
 * empty. Set KHATA_BASE_PATH when deploying anywhere else that is not a
 * domain root.
 */
const basePath = process.env.KHATA_BASE_PATH ?? "";

const config: NextConfig = {
  /**
   * Khata deploys as static files. There is no server, no API route and no
   * server component that touches data — every byte the browser renders comes
   * from a query it made to Arkiv itself.
   *
   * This is set deliberately rather than for convenience: with `output:
   * "export"` it is not possible for a backend to sneak in later without
   * someone noticing the build break. The "no indexer" claim is enforced by
   * the build, not by good intentions.
   */
  output: "export",
  reactStrictMode: true,
  basePath,
  images: { unoptimized: true },
  // GitHub Pages serves /leader/ rather than /leader, so emit directories.
  trailingSlash: true,
};

export default config;
