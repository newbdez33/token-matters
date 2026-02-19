import { test, expect } from '@playwright/test';

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics');
  });

  test('granularity buttons render', async ({ page }) => {
    for (const label of ['daily', 'weekly', 'monthly']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('selecting a period shows stats', async ({ page }) => {
    // Wait for the select to appear
    const select = page.locator('select').first();
    await expect(select).toBeVisible();

    // Pick the first (most recent) non-empty option
    const options = select.locator('option:not([value=""])');
    const count = await options.count();
    if (count > 0) {
      const value = await options.first().getAttribute('value');
      await select.selectOption(value!);

      // Stats should appear
      const tokenNumber = page.locator('p.text-2xl, p.text-3xl').first();
      await expect(tokenNumber).toBeVisible({ timeout: 10_000 });
    }
  });

  test('trend chart renders SVG when period has multiple days', async ({ page }) => {
    // Switch to weekly for multi-day trend
    await page.getByRole('button', { name: 'weekly' }).click();

    const select = page.locator('select').first();
    await expect(select).toBeVisible();

    const options = select.locator('option:not([value=""])');
    const count = await options.count();
    if (count > 0) {
      const value = await options.first().getAttribute('value');
      await select.selectOption(value!);

      // Recharts renders an SVG
      const svg = page.locator('.recharts-responsive-container svg');
      await expect(svg).toBeVisible({ timeout: 10_000 });
    }
  });
});
