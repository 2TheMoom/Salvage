/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exclude contracts-hardhat from Next.js build
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig