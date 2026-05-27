/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  assetPrefix: process.env.ASSET_PREFIX || "",
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "*.devtunnels.ms",
    "*.use2.devtunnels.ms"
  ]
};

export default nextConfig;
