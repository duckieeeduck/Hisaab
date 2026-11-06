import { test, expect } from './preview-fixture';
import type { Page } from '@playwright/test';
import { demoWorks } from '../../src/lib/demo';

const work = {
  ...demoWorks[0],
  id: 'browser-camera-test',
  title: 'Browser-only camera road',
  state: 'Karnataka',
  location: [77.101, 13.34],
  financialYear: '2026-2027',
  demo: false,
};

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/works?**', (route) =>
    route.fulfill({ json: { works: [work], total: 1 } }),
  );
  await page.route(`**/api/v1/works/${work.id}`, (route) => route.fulfill({ json: { work } }));
});

async function mapZoom(page: Page) {
  return Number(await page.locator('[data-zoom]').getAttribute('data-zoom'));
}

async function openProjectFromList(page: Page) {
  await page.goto('/?explore=1');
  await expect(page.locator('[data-zoom]')).toHaveAttribute('data-zoom', /\d/, { timeout: 20000 });
  await page.getByRole('button', { name: 'Explore states and projects' }).click();
  const before = await mapZoom(page);
  await page.getByRole('button', { name: /Browser-only camera road/ }).click();
  await expect.poll(() => mapZoom(page), { timeout: 20000 }).toBeGreaterThan(16);
  return before;
}

test('closing a project returns the map to where the visitor was', async ({ page }) => {
  const before = await openProjectFromList(page);
  await page.getByRole('button', { name: 'Close project receipt' }).click();
  await expect.poll(() => mapZoom(page), { timeout: 20000 }).toBeCloseTo(before, 1);
  // A later state refit would move the map after it first returned.
  await page.waitForTimeout(1500);
  expect(await mapZoom(page)).toBeCloseTo(before, 1);
});

test('the browser Back button also returns the map to where the visitor was', async ({ page }) => {
  const before = await openProjectFromList(page);
  await page.goBack();
  await expect.poll(() => mapZoom(page), { timeout: 20000 }).toBeCloseTo(before, 1);
});

test('closing a project opened from a shared link still focuses its state', async ({ page }) => {
  await page.goto(`/?explore=1&state=29&work=${work.id}`);
  await expect.poll(() => mapZoom(page), { timeout: 20000 }).toBeGreaterThan(16);
  await page.getByRole('button', { name: 'Close project receipt' }).click();
  await expect.poll(() => mapZoom(page), { timeout: 20000 }).toBeLessThan(10);
});
