module.exports = {
  testMatch: ['<rootDir>/api/**/*.test.js'],
  testEnvironment: 'node',
  testTimeout: 30000,
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/support/jest.setup.js'],
};
