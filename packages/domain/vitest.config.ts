import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 실제 Postgres에 대한 통합 테스트. 마이그레이션은 globalSetup에서 적용한다.
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
  },
});
