const { defineConfig, devices } = require('@playwright/test');

// Ports are env-driven so the run can be isolated from processes already using 5000/5173:
//   E2E_API_PORT (default 5000), E2E_WEB_PORT (default 5173)
const API_PORT = process.env.E2E_API_PORT || '5000';
const WEB_PORT = process.env.E2E_WEB_PORT || '5173';

module.exports = defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: 'reports/test-results',
  webServer: [
    {
      command: 'node support/start-e2e-backend.js',
      url: `http://localhost:${API_PORT}/health`,
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: `npm --prefix ../frontend run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120000,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${API_PORT}/api` },
    },
  ],
});
