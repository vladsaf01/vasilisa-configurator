/**
 * Проверка выдвижных ящиков: полый корпус с дном, автооткрытие дверей,
 * сообщение о перекрытии створками-купе и быстрое исправление на распашные.
 * Запуск: node tools/states-v4.mjs [url]
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

const noticeText = async () => {
  const note = page.locator('.stage-note');
  if ((await note.count()) === 0) return null;
  return (await note.first().innerText()).replace(/\s+/g, ' ').trim();
};

const toastText = async () => {
  const toast = page.locator('.toast.is-visible');
  if ((await toast.count()) === 0) return null;
  return (await toast.first().innerText()).replace(/\s+/g, ' ').trim();
};

const wardrobeState = (sections, doors = 'sliding') => ({
  product: 'wardrobe',
  wardrobe: {
    width: 2000,
    height: 2600,
    depth: 600,
    doors,
    plinth: 100,
    backPanel: true,
    body: 'white',
    facade: 'same',
    lighting: true,
    mezzanine: false,
    sections,
  },
});

try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. Шкаф по умолчанию: створки-купе, ящики в средней секции.
  console.log('\n--- шкаф: купе + ящики в середине ---');
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v4-01-wardrobe-blocked.png', 1500);
  console.log('notice:', await noticeText());
  console.log('toast:', await toastText());
  if ((await noticeText()) === null) problems.push('нет сообщения о перекрытии створками');

  // 2. Быстрое исправление: распашные двери, ящики должны выехать.
  console.log('\n--- распашные двери ---');
  if (await click(page.locator('.stage-note-btn'), 'Распашные двери')) {
    await shot('v4-02-wardrobe-hinged.png', 1600);
    console.log('notice after fix:', await noticeText());
    console.log('toast after fix:', await toastText());
  }

  // 3. Купе, но ящики в правой секции — створки собираются слева, ящики доступны.
  console.log('\n--- купе + ящики справа ---');
  await page.evaluate((state) => {
    localStorage.setItem('vasilisa.configurator.v2', JSON.stringify(state));
  }, wardrobeState([
    { shelves: 4, rod: true, drawers: 0 },
    { shelves: 4, rod: true, drawers: 0 },
    { shelves: 2, rod: false, drawers: 3 },
  ]));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v4-03-wardrobe-clear.png', 1500);
  console.log('notice:', await noticeText());
  if ((await noticeText()) !== null) problems.push('ящики в открытой секции считаются перекрытыми');

  // 4. Распашные двери: ящики в середине должны открыться после створок.
  console.log('\n--- распашные двери + ящики в середине ---');
  await page.evaluate((state) => {
    localStorage.setItem('vasilisa.configurator.v2', JSON.stringify(state));
  }, wardrobeState([
    { shelves: 4, rod: true, drawers: 0 },
    { shelves: 2, rod: false, drawers: 3 },
    { shelves: 4, rod: true, drawers: 0 },
  ], 'hinged'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v4-04-wardrobe-hinged-middle.png', 1700);
  console.log('notice:', await noticeText());
  if ((await noticeText()) !== null) problems.push('распашные двери считаются перекрытием');

  // 4a. Закрытие дверей при открытых ящиках: сначала задвигаются ящики.
  console.log('\n--- закрываем двери при открытых ящиках ---');
  await click(page.getByRole('button', { name: 'Закрыть двери' }), 'Закрыть двери');
  await shot('v4-08-wardrobe-close-order.png', 1100);
  console.log('toast:', await toastText());
  const drawersButton = page.getByRole('button', { name: 'Открыть ящики' });
  console.log('ящики задвинуты:', (await drawersButton.count()) > 0);

  // 4b. Купе, ящики справа: двери собираются слева, ящики доступны.
  console.log('\n--- купе + ящики справа: крупный план ---');
  await page.evaluate((state) => {
    localStorage.setItem('vasilisa.configurator.v2', JSON.stringify(state));
  }, wardrobeState([
    { shelves: 4, rod: true, drawers: 0 },
    { shelves: 4, rod: true, drawers: 0 },
    { shelves: 2, rod: false, drawers: 3 },
  ]));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await page.waitForTimeout(1500);
  const wardrobeStage = page.locator('.stage-body');
  await wardrobeStage.screenshot({ path: path.join(outDir, 'v4-09-wardrobe-drawers-close.png') });
  console.log('shot v4-09-wardrobe-drawers-close.png');

  // 4c. Купе, ящики слева: двери должны собраться справа.
  console.log('\n--- купе + ящики слева ---');
  await page.evaluate((state) => {
    localStorage.setItem('vasilisa.configurator.v2', JSON.stringify(state));
  }, wardrobeState([
    { shelves: 2, rod: false, drawers: 3 },
    { shelves: 4, rod: true, drawers: 0 },
    { shelves: 4, rod: true, drawers: 0 },
  ]));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v4-10-wardrobe-left.png', 1600);
  console.log('notice:', await noticeText());
  if ((await noticeText()) !== null) problems.push('ящики слева считаются перекрытыми');

  // 5. Комод: полые ящики с дном.
  console.log('\n--- комод: полые ящики ---');
  await click(page.getByRole('button', { name: 'Комод' }), 'вкладка Комод');
  await page.waitForTimeout(700);
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v4-05-dresser-drawers.png', 1400);
  const stage = page.locator('.stage-body');
  await stage.screenshot({ path: path.join(outDir, 'v4-06-dresser-drawers-close.png') });
  console.log('shot v4-06-dresser-drawers-close.png');

  // 6. Комод со стеклянным фасадом: видно полые ящики внутри.
  console.log('\n--- комод: стекло + ящики ---');
  await click(page.getByRole('button', { name: 'Задвинуть ящики' }), 'Задвинуть ящики');
  await page.waitForTimeout(600);
  await click(page.locator('label.ui-swatch', { hasText: 'Стекло' }), 'фасад Стекло');
  await page.waitForTimeout(900);
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v4-07-dresser-glass-drawers.png', 1400);

  if (errors.length > 0) {
    console.log('\nCONSOLE ERRORS:');
    for (const error of errors) console.log(' -', error);
  } else {
    console.log('\nno console errors');
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
