/* @ts-check */

/**
 * @type {import('@jest/types').Config.InitialOptions}
 * @see https://jestjs.io/docs/configuration
 */
module.exports = {
  preset: 'ts-jest',
  displayName: 'fsmoothy',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: './coverage',
  reporters: ['default'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
};
