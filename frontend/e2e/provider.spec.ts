import { test, expect } from '@playwright/test';

test.describe('Provider detail', () => {
  test('clicking a provider navigates to detail page', async ({ page }) => {
    await page.goto('/');

    // Click first provider link
    const providerLink = page.locator('a[href^="/token-matters/providers/"]').first();
    await expect(providerLink).toBeVisible();
    await providerLink.click();

    // Should be on detail page
    await expect(page.locator('h1')).toBeVisible();
    // Totals section renders
    await expect(page.getByText('Totals')).toBeVisible();
    // Token number visible
    const tokenNumber = page.locator('p.text-2xl, p.text-3xl').first();
    await expect(tokenNumber).toBeVisible();
  });

  test('back link works', async ({ page }) => {
    await page.goto('/');

    const providerLink = page.locator('a[href^="/token-matters/providers/"]').first();
    await expect(providerLink).toBeVisible();
    await providerLink.click();

    // Click back link
    const backLink = page.locator('a[href="/token-matters/"]', { hasText: 'Dashboard' });
    await expect(backLink).toBeVisible();
    await backLink.click();

    // Should be back on dashboard
    await expect(page.locator('h2').first()).toContainText(/Last (7|30) Days/);
  });
});
