import type { NextConfig } from "next";

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
};

export default config;
