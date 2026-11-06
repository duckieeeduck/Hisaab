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
const otherStateWork = {
  ...work,
  id: 'browser-camera-other-state',
  title: 'Browser-only other state road',
  state: 'Maharashtra',
  location: [73.8, 18.5],
};
const unlocatedWork = {
  ...work,
  id: 'browser-camera-unlocated',
  title: 'Browser-only unlocated road',
  location: null,
};

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/works?**', (route) =>
    route.fulfill({ json: { works: [work, unlocatedWork], total: 2 } }),
  );
  for (const record of [work, otherStateWork, unlocatedWork])
    await page.route(`**/api/v1/works/${record.id}`, (route) =>
      route.fulfill({ json: { work: record } }),
    );
});

async function mapCamera(page: Page) {
  const map = page.locator('[data-zoom]');
  const [lng, lat] = (await map.getAttribute('data-center'))!.split(',').map(Number);
  return {
    zoom: Number(await map.getAttribute('data-zoom')),
    lng,
    lat,
    pitch: Number(await map.getAttribute('data-pitch')),
  };
}

// Leaves the default India view, so a reset to that view cannot pass as a return.
async function moveMapThenOpenList(page: Page) {
  await page.goto('/?explore=1');
  await expect(page.locator('[data-zoom]')).toHaveAttribute('data-zoom', /\d/, { timeout: 20000 });
  const start = await mapCamera(page);
  await page.locator('.mapboxgl-canvas').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await mapCamera(page)).lng).toBeGreaterThan(start.lng + 0.5);
  await page.keyboard.press('Equal');
  await expect.poll(async () => (await mapCamera(page)).zoom).toBeGreaterThan(start.zoom + 0.5);
  const moved = await mapCamera(page);
  await page.getByRole('button', { name: 'Explore states and projects' }).click();
  return moved;
}

async function openProject(page: Page, title: RegExp) {
  await page.getByRole('button', { name: title }).click();
  await expect(page.getByRole('button', { name: 'Close project receipt' })).toBeVisible();
}

async function expectMapAtProject(page: Page) {
  await expect
    .poll(async () => (await mapCamera(page)).zoom, { timeout: 20000 })
    .toBeGreaterThan(16);
}

async function expectCameraReturnedTo(page: Page, before: Awaited<ReturnType<typeof mapCamera>>) {
  await expect
    .poll(async () => (await mapCamera(page)).zoom, { timeout: 20000 })
    .toBeCloseTo(before.zoom, 1);
  // A later state refit would move the map after it first returned.
  await page.waitForTimeout(1500);
  const after = await mapCamera(page);
  expect(after.zoom).toBeCloseTo(before.zoom, 1);
  expect(after.lng).toBeCloseTo(before.lng, 1);
  expect(after.lat).toBeCloseTo(before.lat, 1);
  expect(after.pitch).toBeCloseTo(before.pitch, 0);
}

async function visit(page: Page, url: string) {
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

test('closing a project returns the map to where the visitor was', async ({ page }) => {
  const before = await moveMapThenOpenList(page);
  await openProject(page, /Browser-only camera road/);
  await expectMapAtProject(page);
  await page.getByRole('button', { name: 'Close project receipt' }).click();
  await expectCameraReturnedTo(page, before);
});

test('the browser Back button also returns the map to where the visitor was', async ({ page }) => {
  const before = await moveMapThenOpenList(page);
  await openProject(page, /Browser-only camera road/);
  await expectMapAtProject(page);
  await page.goBack();
  await expectCameraReturnedTo(page, before);
});

test('closing a project with no location leaves the map where it was', async ({ page }) => {
  const before = await moveMapThenOpenList(page);
  await openProject(page, /Browser-only unlocated road/);
  await page.getByRole('button', { name: 'Close project receipt' }).click();
  await expect(page.getByRole('button', { name: 'Close project receipt' })).toHaveCount(0);
  await expectCameraReturnedTo(page, before);
});

test('choosing a state after two projects focuses that state', async ({ page }) => {
  const before = await moveMapThenOpenList(page);
  await openProject(page, /Browser-only camera road/);
  await expectMapAtProject(page);
  await visit(page, `/?explore=1&state=27&work=${otherStateWork.id}`);
  await expect
    .poll(async () => (await mapCamera(page)).lng, { timeout: 20000 })
    .toBeCloseTo(otherStateWork.location[0], 0);
  await visit(page, '/state/29?explore=1');
  await expect.poll(async () => (await mapCamera(page)).zoom, { timeout: 20000 }).toBeLessThan(10);
  await page.waitForTimeout(1500);
  expect((await mapCamera(page)).zoom).toBeGreaterThan(before.zoom + 0.5);
});

test('closing a project opened from a shared link still focuses its state', async ({ page }) => {
  await page.goto(`/?explore=1&state=29&work=${work.id}`);
  await expectMapAtProject(page);
  await page.getByRole('button', { name: 'Close project receipt' }).click();
  await expect.poll(async () => (await mapCamera(page)).zoom, { timeout: 20000 }).toBeLessThan(10);
});
