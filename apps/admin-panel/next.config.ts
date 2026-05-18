import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // El admin panel solo habla con la API de control plane — no hay rutas API propias
  output: 'standalone',
  // Transpila paquetes del monorepo que usan ESM
  transpilePackages: ['@4nexa/types', '@4nexa/validators'],
};

export default nextConfig;
