/**
 * Проверка комода на секциях: стеклянный фасад, выдвинутые ящики.
 * Запуск: node tools/states-v3.mjs [url]
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
  if ((await locator.count()) === 0) {
    console.log('NOT FOUND:', label);
    problems.push(`нет кнопки «${label}»`);
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
  await page.waitForTimeout(1500);

  await click(page.getByRole('button', { name: 'Комод' }), 'вкладка Комод');
  await shot('v3-01-dresser-sections.png');

  // выдвинуть ящики
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v3-02-drawers-open.png', 1300);
  await click(page.getByRole('button', { name: 'Задвинуть ящики' }), 'Задвинуть ящики');
  await page.waitForTimeout(700);

  // стеклянные двери: ящики и полки должны просвечивать
  await click(page.locator('label.ui-swatch', { hasText: 'Стекло' }), 'фасад Стекло');
  await shot('v3-03-glass-closed.png', 1200);

  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v3-04-glass-drawers-open.png', 1300);

  // открытая ниша: клик по типу секции во второй секции
  const niches = page.getByRole('button', { name: 'Открытая ниша' });
  if ((await niches.count()) > 0) {
    await niches.first().click();
    await shot('v3-05-open-niche.png', 1200);
  } else {
    problems.push('нет типа секции «Открытая ниша»');
  }

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
