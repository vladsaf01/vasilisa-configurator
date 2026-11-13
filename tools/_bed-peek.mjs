/** Временный просмотр кровати (удаляется после проверки). */
import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (name, wait = 900) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('shot', name);
};

try {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Кровать', exact: true }).click();
  await page.waitForTimeout(1400);
  const pre = await page.evaluate(() => ({
    price: document.querySelector('.ui-price-value')?.textContent,
    head: document.querySelector('.ui-head-sub')?.textContent,
    meta: document.querySelector('.ui-price-meta')?.textContent,
  }));
  console.log('DEFAULT', JSON.stringify(pre));
  await shot('tmp-bed-01', 600);
  await page.getByRole('button', { name: 'Сбоку', exact: true }).click();
  await shot('tmp-bed-02', 1000);
  await page.getByRole('button', { name: '3/4', exact: true }).click();
  await page.getByRole('button', { name: 'Угловая', exact: true }).click();
  await shot('tmp-bed-03', 1500);
  await page.getByRole('button', { name: 'Открыть ящики' }).click();
  await shot('tmp-bed-04', 1300);
  const info = await page.evaluate(() => ({
    panel: document.querySelector('.panel')?.innerText.slice(0, 900),
    price: document.querySelector('.ui-price-value')?.textContent,
  }));
  console.log(JSON.stringify(info, null, 1));
} catch (error) {
  console.log('EXCEPTION:', error.message);
} finally {
  console.log('errors:', JSON.stringify(errors));
  await context.close().catch(() => {});
  process.exit(0);
}
