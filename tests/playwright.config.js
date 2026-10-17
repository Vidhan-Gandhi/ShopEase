const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: 'reports/test-results',
  webServer: [
    {
      command: 'node support/start-e2e-backend.js',
      url: 'http://localhost:5000/health',
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: 'npm --prefix ../frontend run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      timeout: 120000,
      reuseExistingServer: false,
      env: { VITE_API_URL: 'http://localhost:5000/api' },
    },
  ],
});
