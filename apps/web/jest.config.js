/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jest-environment-node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
        jsx: 'react-jsx',
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@osa/validation$': '<rootDir>/node_modules/@osa/validation/src/index.ts',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
}

module.exports = config
