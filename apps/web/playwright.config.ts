import { defineConfig, devices } from '@playwright/test';

const PORT = 3200;

/**
 * E2E 테스트: 프로덕션 빌드를 dev 인증 모드로 띄워 실제 DB에 대해 실행한다.
 * 사전 조건: DATABASE_URL의 DB에 마이그레이션 적용, `pnpm build` 완료.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: { AUTH_MODE: 'dev', ALLOW_DEV_AUTH: '1', DEV_AUTH_SECRET: 'e2e-secret' },
  },
});
