/**
 * Демо-кадры конструктора для показа: базовый шкаф, открытые двери,
 * зеркальные двери-купе на роликах, другой декор и мобильная версия.
 * Запуск: node tools/states.mjs [url]
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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (name, wait = 900) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('shot', name);
};

const clickAny = async (locators, label) => {
  for (const locator of locators) {
    const count = await locator.count();
    if (count > 0) {
      await locator.first().click();
      console.log('clicked', label);
      return true;
    }
  }
  console.log('NOT FOUND:', label);
  return false;
};

try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);

  // 1. Базовый вид: купе, белый корпус — закрытые двери
  await shot('state-01-default-closed.png');

  // 2. Он же с открытыми дверями
  await clickAny([page.getByRole('button', { name: 'Открыть двери' })], 'Открыть двери');
  await shot('state-02-default-open.png', 1100);

  // 3. Зеркальные двери-купе: закрыть двери, выбрать фасад «Зеркало»
  await clickAny([page.getByRole('button', { name: 'Закрыть двери' })], 'Закрыть двери');
  await page.waitForTimeout(700);
  await clickAny(
    [
      page.locator('label.ui-swatch', { hasText: 'Зеркало' }),
      page.getByRole('radio', { name: 'Зеркало' }),
      page.getByText('Зеркало', { exact: true }),
    ],
    'фасад Зеркало',
  );
  await shot('state-03-mirror-closed.png', 1200);

  // 4. Зеркальные двери-купе с открытыми дверями
  await clickAny([page.getByRole('button', { name: 'Открыть двери' })], 'Открыть двери');
  await shot('state-04-mirror-open.png', 1200);

  // 5. Другой декор: дуб + купе, двери закрыты, ракурс спереди
  await clickAny([page.getByRole('button', { name: 'Закрыть двери' })], 'Закрыть двери');
  await clickAny(
    [
      page.locator('label.ui-swatch', { hasText: 'Дуб' }),
      page.getByRole('radio', { name: 'Дуб' }),
    ],
    'корпус Дуб',
  );
  await clickAny(
    [
      page.locator('label.ui-swatch', { hasText: 'В цвет корпуса' }),
      page.getByRole('radio', { name: 'В цвет корпуса' }),
    ],
    'фасад в цвет корпуса',
  );
  await clickAny([page.getByRole('button', { name: 'Спереди', exact: true })], 'ракурс Спереди');
  await shot('state-05-oak-front.png', 1200);

  // 6. Мобильная версия
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await shot('state-06-mobile.png', 600);

  if (errors.length > 0) {
    console.log('CONSOLE ERRORS:');
    for (const error of errors) console.log(' -', error);
  } else {
    console.log('no console errors');
  }
} catch (error) {
  console.log('EXCEPTION:', error.message);
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
}
process.exit(process.exitCode ?? 0);
