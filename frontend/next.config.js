// frontend/next.config.js
// Minimal Next.js configuration. `reactStrictMode` helps surface
// bugs early. Production build is gzipped and SWC-minified.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
};

module.exports = nextConfig;
