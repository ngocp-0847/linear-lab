import { defineConfig } from "vitest/config";

// Một cấu hình cho cả monorepo: `npm test` ở gốc chạy hết mọi workspace.
export default defineConfig({
  test: {
    include: ["{apps,packages}/*/src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
