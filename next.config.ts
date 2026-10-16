import type { NextConfig } from "next";

const config: NextConfig = {
  // Khata has no server-side data layer by design: every read goes from the
  // browser straight to the Arkiv RPC. Nothing here needs a Node runtime.
  reactStrictMode: true,
};

export default config;
