import createMDX from '@next/mdx'
import type { NextConfig } from 'next';

const withMDX = createMDX({})

const PROGRAMS_SLUGS = [
  'classified',
  'drama-festival',
  'health-wellness',
  'higher-education',
  'library',
  'networking',
  'nilachakra',
  'odia-learning',
  'odisha-development',
  'odissi-music',
  'sampark-dori',
  'womens-forum',
]

const nextConfig: NextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  async redirects() {
    return [
      ...PROGRAMS_SLUGS.map((slug) => ({
        source: `/activities/${slug}`,
        destination: `/programs/${slug}`,
        permanent: true,
      })),
      {
        source: '/about/contact',
        destination: '/',
        permanent: true,
      },
      {
        source: '/about/committees',
        destination: '/programs/osa-committees',
        permanent: true,
      },
    ]
  },
  webpack: (config, { nextRuntime }: { nextRuntime?: string }) => {
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

export default withMDX(nextConfig);
