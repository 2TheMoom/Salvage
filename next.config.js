/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exclude contracts-hardhat from Next.js build
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    config.externals = config.externals || []
    return config
  },
}

module.exports = nextConfig