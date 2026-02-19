import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows period heading and token count', async ({ page }) => {
    const heading = page.locator('h2').first();
    await expect(heading).toContainText(/Last (7|30) Days/);

    // Large token number is visible
    const heroNumber = page.locator('p.text-3xl, p.text-4xl').first();
    await expect(heroNumber).toBeVisible();
    await expect(heroNumber).not.toHaveText('0');
  });

  test('provider table has rows', async ({ page }) => {
    // Wait for provider breakdown to render
    const providerLinks = page.locator('a[href^="/token-matters/providers/"]');
    await expect(providerLinks.first()).toBeVisible();
    expect(await providerLinks.count()).toBeGreaterThan(0);
  });

  test('7d/30d toggle works', async ({ page }) => {
    const btn30d = page.getByRole('button', { name: '30d' });
    await btn30d.click();
    await expect(page.locator('h2').first()).toContainText('Last 30 Days');

    const btn7d = page.getByRole('button', { name: '7d' });
    await btn7d.click();
    await expect(page.locator('h2').first()).toContainText('Last 7 Days');
  });

  test('Today section renders', async ({ page }) => {
    const todayHeading = page.getByText('Today', { exact: true });
    await expect(todayHeading).toBeVisible();
  });
});
