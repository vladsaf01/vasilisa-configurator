/**
 * Смоук-проверка конструктора в живом браузере через CDP 9222.
 * Запуск: node tools/smoke.mjs [url]
 * Проверяет: загрузку без ошибок консоли, смену пресетов, цену, переключение
 * дверей, «Открыть двери», мобильную вёрстку, горизонтальный скролл, скачивание CSV.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
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

const norm = (s) => s.replace(/[\u00a0\u2009\u202f]/g, ' ').toLowerCase();
const bodyText = async () => norm(await page.locator('body').innerText());
const check = (cond, label) => {
  if (!cond) problems.push(label);
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}`);
};
const shot = async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('shot', name);
};

try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const initial = await bodyText();
  check(initial.includes('2 000 × 2 600 × 600 мм'), 'стартовые габариты 2000×2600×600');
  check(/105\s?\d{3}\s?₽/.test(initial), 'стартовая цена ≈105 000 ₽');
  check(initial.includes('секции'), 'панель загрузилась');

  await page.getByRole('button', { name: 'Гардеробная', exact: true }).first().click();
  await page.waitForTimeout(500);
  check((await bodyText()).includes('2 800 × 2 600 × 600 мм'), 'пресет «Гардеробная» применяет 2800×2600×600');

  await page.getByRole('button', { name: 'Открытый', exact: true }).first().click();
  await page.waitForTimeout(600);
  check((await bodyText()).includes('1 600 × 2 200 × 400 мм'), 'пресет «Открытый» применяет 1600×2200×400');
  check((await page.getByRole('button', { name: 'Открыть двери' }).count()) === 0, 'для «Без дверей» нет кнопки открывания');
  await shot('demo-open-shelves.png');

  await page.getByRole('button', { name: 'Спальня', exact: true }).first().click();
  await page.waitForTimeout(600);
  await shot('demo-3d-closed.png');

  const openBtn = page.getByRole('button', { name: 'Открыть двери' });
  check((await openBtn.count()) === 1, 'есть кнопка «Открыть двери» для купе');
  if ((await openBtn.count()) === 1) {
    await openBtn.click();
    await page.waitForTimeout(1200);
    check((await page.getByRole('button', { name: 'Закрыть двери' }).count()) === 1, 'кнопка переключается в «Закрыть двери»');
    await shot('demo-3d-open.png');
  }

  await page.getByRole('button', { name: 'Спереди', exact: true }).click();
  await page.waitForTimeout(1000);
  await shot('demo-3d-front.png');
  await page.getByRole('button', { name: '3/4', exact: true }).click();
  await page.waitForTimeout(700);

  check((await page.getByRole('tab', { name: 'Чертёж' }).count()) === 0, 'таба «Чертёж» нет');

  const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.getByRole('button', { name: 'Спецификация CSV' }).click();
  const download = await downloadPromise;
  check(Boolean(download), 'скачивается CSV-спецификация');
  if (download) {
    const file = await download.path();
    const text = readFileSync(file, 'utf8');
    check(text.split('\n').length > 5, 'CSV содержит строки деталей');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const metrics = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    panelOverflow: (() => {
      const panel = document.querySelector('.panel');
      return panel ? panel.scrollWidth - panel.clientWidth : -1;
    })(),
    inner: window.innerWidth,
  }));
  check(metrics.bodyWidth <= metrics.inner + 1, `мобильный: нет горизонтального скролла body (${metrics.bodyWidth} ≤ ${metrics.inner})`);
  check(metrics.panelOverflow <= 1, `мобильный: панель без переполнения (${metrics.panelOverflow})`);
  await shot('demo-mobile.png');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  await shot('demo-desktop.png');

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
if (problems.length > 0) {
  console.log('ПРОБЛЕМЫ:');
  for (const problem of problems) console.log(' -', problem);
}
process.exit(problems.length === 0 && errors.length === 0 ? 0 : 1);
