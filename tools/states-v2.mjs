/**
 * Демо-кадры двух изделий: встроенный шкаф и комод.
 * Запуск: node tools/states-v2.mjs [url]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5174';
const outDir = path.resolve('shots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

const errors = [];
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (name, wait = 900) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('shot', name);
};

const click = async (locator, label) => {
  const count = await locator.count();
  if (count === 0) {
    console.log('NOT FOUND:', label);
    problems.push(`не найдена кнопка «${label}»`);
    return false;
  }
  await locator.first().click();
  console.log('clicked', label);
  return true;
};

try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);

  await shot('v2-01-wardrobe.png');
  const body = (await page.locator('body').innerText()).replace(/[\u00a0\u2009\u202f]/g, ' ').toLowerCase();
  if (!body.includes('2 000 × 2 600 × 600 мм')) problems.push('стартовые габариты шкафа не 2000×2600×600');

  // комод
  await click(page.getByRole('button', { name: 'Комод' }), 'Комод');
  await page.waitForTimeout(900);
  const dresserText = (await page.locator('body').innerText()).replace(/[\u00a0\u2009\u202f]/g, ' ');
  if (!dresserText.includes('1 200 × 800 × 450 мм')) problems.push(`комод не стартует с 1200×800×450: ${dresserText.slice(0, 120)}`);
  await shot('v2-02-dresser.png');

  await click(page.getByRole('button', { name: 'С дверцами', exact: true }), 'пресет «С дверцами»');
  await shot('v2-03-dresser-wide.png', 1100);

  await click(page.getByRole('button', { name: 'Цоколь', exact: true }), 'основание «Цоколь»');
  await click(page.getByRole('button', { name: 'Кнопка', exact: true }), 'ручки «Кнопка»');
  await shot('v2-04-dresser-plinth-knobs.png', 1100);

  // обратно в шкаф
  await click(page.getByRole('button', { name: 'Встроенный шкаф' }), 'Встроенный шкаф');
  await page.waitForTimeout(800);
  await click(page.getByRole('button', { name: 'Открыть двери' }), 'Открыть двери');
  await shot('v2-05-wardrobe-open.png', 1100);

  // мобильный комод
  await click(page.getByRole('button', { name: 'Комод' }), 'Комод');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1100);
  await shot('v2-06-dresser-mobile.png', 700);

  const metrics = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    inner: window.innerWidth,
    panelOverflow: (() => {
      const panel = document.querySelector('.panel');
      return panel ? panel.scrollWidth - panel.clientWidth : -1;
    })(),
  }));
  if (metrics.bodyWidth > metrics.inner + 1) problems.push(`мобильный: горизонтальный скролл (${metrics.bodyWidth} > ${metrics.inner})`);
  if (metrics.panelOverflow > 1) problems.push(`мобильный: панель переполнена (${metrics.panelOverflow})`);

  if (errors.length > 0) {
    console.log('CONSOLE ERRORS:');
    for (const error of errors) console.log(' -', error);
  } else {
    console.log('no console errors');
  }
} catch (error) {
  problems.push(`исключение: ${error.message}`);
  console.log('EXCEPTION:', error.message);
} finally {
  await page.close().catch(() => {});
}

console.log('\nИТОГ:', problems.length === 0 && errors.length === 0 ? 'всё ок' : 'есть замечания');
for (const problem of problems) console.log(' -', problem);
process.exit(problems.length === 0 && errors.length === 0 ? 0 : 1);
