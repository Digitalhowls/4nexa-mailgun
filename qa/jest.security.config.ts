import type { Config } from 'jest';

const config: Config = {
  displayName: 'qa:security',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/security/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: { '^@qa/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 15_000,
  verbose: true,
  globalSetup: '<rootDir>/src/api/_global-setup.ts',
};

export default config;
