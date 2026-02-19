import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('theme buttons render', async ({ page }) => {
    for (const label of ['light', 'dark', 'system']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('pricing section shows provider names', async ({ page }) => {
    await expect(page.getByText('Pricing')).toBeVisible();
    await expect(page.getByText('claude-code')).toBeVisible();
    await expect(page.getByText('glm-coding')).toBeVisible();
    await expect(page.getByText('trae-pro')).toBeVisible();
  });
});
