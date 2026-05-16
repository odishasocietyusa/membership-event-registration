import type { NextConfig } from 'next';
import type { Configuration } from 'webpack';

const nextConfig: NextConfig = {
  webpack: (config: Configuration, { nextRuntime }: { nextRuntime?: string }) => {
    if (nextRuntime === 'edge') {
      config.resolve = config.resolve ?? {}
      config.resolve.alias = {
        ...(config.resolve.alias as Record<string, string>),
        '@supabase/realtime-js': false,
      }
    }
    return config
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
