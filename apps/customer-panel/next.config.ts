import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@4nexa/types', '@4nexa/validators'],
};

export default nextConfig;
