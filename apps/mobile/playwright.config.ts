import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './test/browser', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5180', viewport: { width: 390, height: 844 }, launchOptions: { executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5180', reuseExistingServer: true },
})
