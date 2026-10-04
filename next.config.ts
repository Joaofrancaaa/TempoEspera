import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O MapContainer do Leaflet quebra no double-mount do Strict Mode.
  reactStrictMode: false,
};

export default nextConfig;
