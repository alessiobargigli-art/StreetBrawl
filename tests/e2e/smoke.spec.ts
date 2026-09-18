import { test, expect, type Page } from '@playwright/test';

async function enterWithoutAudio(page: Page) {
  await page.route('**/audio/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'CONTINUA SENZA AUDIO' })).toBeVisible();
  await page.getByRole('button', { name: 'CONTINUA SENZA AUDIO' }).click();
  await expect(page.getByRole('button', { name: 'GIOCA SOLO' })).toBeVisible();
}

async function useLocalWorker(page: Page) {
  await page.addInitScript(() => localStorage.setItem('streetbrawl-coop-endpoint', 'http://127.0.0.1:8787'));
}

test('solo: menu -> character -> opening -> gameplay -> menu -> new game', async ({ page }) => {
  await enterWithoutAudio(page);
  await page.getByRole('button', { name: 'GIOCA SOLO' }).click();
  await expect(page.getByRole('heading', { name: 'GIOCA SOLO' })).toBeVisible();
  await page.locator('[data-solo-character="alex"]').click();
  await expect(page.locator('.story-overlay')).toBeVisible();
  await page.locator('.story-overlay button').click();
  await expect(page.locator('#game')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'MENU', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GIOCA SOLO' })).toBeVisible();
  await page.getByRole('button', { name: 'GIOCA SOLO' }).click();
  await expect(page.getByRole('heading', { name: 'GIOCA SOLO' })).toBeVisible();
});

test('co-op: two independent browser contexts reach authoritative opening and gameplay', async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await useLocalWorker(pa); await useLocalWorker(pb);
  await enterWithoutAudio(pa); await enterWithoutAudio(pb);

  await pa.getByRole('button', { name: 'CO-OP ONLINE' }).click();
  await pa.getByRole('button', { name: 'CREA STANZA' }).click();
  await expect(pa.locator('.room-line strong')).toHaveText(/[A-Z2-9]{6}/);
  const room = (await pa.locator('.room-line strong').textContent())!.trim();

  await pb.getByRole('button', { name: 'CO-OP ONLINE' }).click();
  await pb.locator('#coop-code').fill(room);
  await pb.getByRole('button', { name: 'ENTRA' }).click();
  await expect(pb.locator('.room-line strong')).toHaveText(room);

  await pa.locator('[data-character="alex"]').click();
  await pb.locator('[data-character="matt"]').click();
  await pa.getByRole('button', { name: 'PRONTO' }).click();
  await pb.getByRole('button', { name: 'PRONTO' }).click();
  await expect(pa.getByRole('button', { name: 'START' })).toBeEnabled();
  await pa.getByRole('button', { name: 'START' }).click();

  await expect(pa.locator('.story-overlay')).toBeVisible({ timeout: 20_000 });
  await expect(pb.locator('.story-overlay')).toBeVisible({ timeout: 20_000 });
  await pa.locator('.story-overlay button').click();
  await pb.locator('.story-overlay button').click();
  await expect(pa.locator('#game')).toBeVisible({ timeout: 20_000 });
  await expect(pb.locator('#game')).toBeVisible({ timeout: 20_000 });
  await a.close(); await b.close();
});
