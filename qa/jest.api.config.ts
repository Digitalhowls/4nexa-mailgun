import type { Config } from 'jest';

const config: Config = {
  displayName: 'qa:api',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/api/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: { '^@qa/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 30_000,
  verbose: true,
  globalSetup: '<rootDir>/src/api/_global-setup.ts',
};

export default config;
