/**
 * Проверка тумбы и открывания дверей комода/тумбы.
 * Запуск: node tools/states-v6.mjs [url]
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
    problems.push(`нет кнопки «${label}»`);
    console.log('NOT FOUND:', label);
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

  // 1. Тумба
  await click(page.getByRole('button', { name: 'Тумба' }), 'вкладка Тумба');
  await shot('v6-01-tumba.png', 1500);
  const heading = (await page.locator('.ui-head-title, h2').first().innerText().catch(() => '')).trim();
  console.log('заголовок панели:', heading);

  const tumbaDocs = await page.evaluate(async () => {
    const tumba = await import('/src/lib/tumba.ts');
    const quote = await import('/src/lib/quote.ts');
    const st = JSON.parse(localStorage.getItem('vasilisa.configurator.v2'));
    const p = tumba.normalizeTumbaParams(st.tumba);
    const layout = tumba.buildTumbaLayout(p);
    const price = tumba.calcTumbaPrice(p, layout);
    const text = quote.buildTumbaQuoteText(p, layout, price);
    const csv = quote.tumbaSpecCsv(p, layout);
    return {
      price: price.total,
      firstLine: text.split('\n')[0],
      sectionsLine: text.split('\n')[2],
      csvLines: csv.split('\r\n').length,
      doors: layout.doors.length,
      drawers: layout.drawerFronts.length,
    };
  });
  console.log('тумба, заявка/CSV:', JSON.stringify(tumbaDocs));
  if (tumbaDocs.price <= 0) problems.push('тумба: цена не посчиталась');
  if (!tumbaDocs.firstLine.includes('Тумба')) problems.push('тумба: заявка без названия изделия');
  if (tumbaDocs.csvLines < 5) problems.push('тумба: пустая спецификация');

  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v6-02-tumba-drawers.png', 1400);

  await click(page.getByRole('button', { name: 'Открыть двери' }), 'Открыть двери');
  await shot('v6-03-tumba-doors.png', 1300);

  // 2. Комод с открыванием дверей
  await click(page.getByRole('button', { name: 'Комод' }), 'вкладка Комод');
  await page.waitForTimeout(700);
  await click(page.getByRole('button', { name: 'Открыть двери' }), 'Открыть двери (комод)');
  await shot('v6-04-dresser-doors.png', 1300);

  // 3. Комод 600 мм: «дверь + ящики», 6 ящиков не помещаются — число должно ужаться.
  console.log('\n--- комод: дверь + ящики, 6 не помещаются ---');
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('vasilisa.configurator.v2') || '{}');
    st.product = 'dresser';
    st.dresser = {
      width: 1600,
      height: 600,
      depth: 450,
      sections: [
        { kind: 'drawers', drawers: 2, shelves: 0 },
        { kind: 'drawers', drawers: 2, shelves: 0 },
        { kind: 'doorDrawers', drawers: 6, shelves: 0 },
      ],
      base: 'legs',
      baseHeight: 200,
      body: 'white',
      facade: 'same',
      backPanel: true,
      handles: 'knob',
    };
    localStorage.setItem('vasilisa.configurator.v2', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const drawersInfo = await page.evaluate(async () => {
    const dresser = await import('/src/lib/dresser.ts');
    const st = JSON.parse(localStorage.getItem('vasilisa.configurator.v2'));
    const p = dresser.normalizeDresserParams(st.dresser);
    const layout = dresser.buildDresserLayout(p);
    const section = p.sections[2];
    const sectionLayout = layout.sections[2];
    return {
      requested: 6,
      normalized: section.drawers,
      drawn: sectionLayout.drawers.length,
      max: dresser.maxDoorDrawers(p),
      panelText: document.querySelector('.ui-sec-foot .ui-sub-value')?.textContent ?? '',
    };
  });
  console.log('ящики в третьей секции:', JSON.stringify(drawersInfo));
  if (drawersInfo.normalized !== drawersInfo.drawn || drawersInfo.drawn > drawersInfo.max) {
    problems.push('число ящиков в панели и 3D расходится');
  }
  await shot('v6-05-dresser-drawer-cap.png', 700);

  console.log('\nCONSOLE ERRORS:', errors.length ? errors : 'нет');
} catch (error) {
  problems.push(`исключение: ${error.message}`);
  console.log('EXCEPTION:', error.message);
} finally {
  await page.close().catch(() => {});
}

console.log('\nИТОГ:', problems.length === 0 && errors.length === 0 ? 'всё ок' : 'есть замечания');
for (const problem of problems) console.log(' -', problem);
process.exit(problems.length === 0 && errors.length === 0 ? 0 : 1);
