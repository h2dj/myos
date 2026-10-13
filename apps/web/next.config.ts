import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@myos/core', '@myos/domain', '@myos/db'],
};

export default nextConfig;
