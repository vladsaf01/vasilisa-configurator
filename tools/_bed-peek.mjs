/** Временный быстрый просмотр кровати (удаляется после проверки). */
import { chromium } from 'playwright-core';

const url = 'http://127.0.0.1:5174';
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
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Кровать', exact: true }).click();
  await shot('peek2-01-default', 1600);

  await page.getByRole('button', { name: 'Открыть ящики' }).click();
  await shot('peek2-02-drawers', 1300);
  await page.getByRole('button', { name: 'Задвинуть ящики' }).click();
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: 'Спереди', exact: true }).click();
  await shot('peek2-03-front', 1000);
  await page.getByRole('button', { name: 'Сбоку', exact: true }).click();
  await shot('peek2-04-side', 1000);
  await page.getByRole('button', { name: '3/4', exact: true }).click();
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'Угловая', exact: true }).click();
  await shot('peek2-05-corner', 1500);

  await page.getByRole('button', { name: 'Подиум', exact: true }).click();
  await shot('peek2-06-podium', 1500);

  await page.getByRole('button', { name: 'Двуспальная', exact: true }).click();
  await shot('peek2-07-double', 1500);

  await page.getByRole('button', { name: 'Как на фото', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Слева', exact: true }).click();
  await shot('peek2-08-wave-left', 1600);

  const info = await page.evaluate(() => ({
    title: document.title,
    canvas: (() => {
      const c = document.querySelector('canvas');
      return c ? `${c.width}x${c.height}` : null;
    })(),
    price: document.querySelector('.ui-price-value')?.textContent,
  }));
  console.log(JSON.stringify(info));
} catch (error) {
  console.log('EXCEPTION:', error.message);
} finally {
  console.log('errors:', JSON.stringify(errors));
  await context.close().catch(() => {});
  process.exit(0);
}
