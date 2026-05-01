import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  // App.vue나 index.html에 정의된 실제 타이틀에 맞춰 확인 (여기서는 Authori 포함 여부)
  await expect(page).toHaveTitle(/Authori/i);
});
