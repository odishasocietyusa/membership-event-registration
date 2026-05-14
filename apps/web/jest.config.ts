import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jest-environment-node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Use CommonJS for jest compatibility
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@prisma/client$': '<rootDir>/node_modules/.prisma/client',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
}

export default config
