const { defineConfig, devices } = require('@playwright/test');
const API_PORT = process.env.E2E_API_PORT || '5000';
const WEB_PORT = process.env.E2E_WEB_PORT || '5173';

// Documentation screenshots only (not tests). Run: npm run screenshots
module.exports = defineConfig({
  testDir: './screenshots',
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 300000,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${WEB_PORT}` },
  outputDir: 'reports/screenshots-results',
  webServer: [
    { command: 'node support/start-e2e-backend.js', url: `http://localhost:${API_PORT}/health`, timeout: 120000, reuseExistingServer: false },
    {
      command: `npm --prefix ../frontend run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120000,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${API_PORT}/api` },
    },
  ],
});
