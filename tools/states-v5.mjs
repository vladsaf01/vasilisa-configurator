/**
 * Проверка распашных створок: у каждой секции свой проём между стенками,
 * на него ставится 1 створка (одиночная дверь) или 2 (двойная, каждая — половина).
 * Запуск: node tools/states-v5.mjs [url]
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

const state = (width, sections, doors = 'hinged') => ({
  product: 'wardrobe',
  wardrobe: {
    width,
    height: 2600,
    depth: 600,
    doors,
    plinth: 100,
    backPanel: true,
    body: 'white',
    facade: 'glass',
    lighting: false,
    mezzanine: false,
    sections,
  },
});

const setState = async (value) => {
  await page.evaluate((s) => {
    localStorage.setItem('vasilisa.configurator.v2', JSON.stringify(s));
  }, value);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
};

const doorLayout = async () =>
  page.evaluate(async () => {
    const wardrobe = await import('/src/lib/model.ts');
    const layoutModule = await import('/src/lib/layout.ts');
    const params = wardrobe.normalizeParams(JSON.parse(localStorage.getItem('vasilisa.configurator.v2')).wardrobe);
    const layout = layoutModule.buildLayout(params);
    const sections = layout.sections.map((s) => ({
      index: s.index + 1,
      width: Math.round(s.width),
      doors: layout.doors
        .filter((leaf) => leaf.section === s.index)
        .map((leaf) => ({
          leaf: leaf.leaf,
          width: Math.round(leaf.x1 - leaf.x0),
          hinge: leaf.leaf === 0 ? 'left wall' : 'right wall',
          x0: Math.round(leaf.x0),
          x1: Math.round(leaf.x1),
        })),
    }));
    return { sections, totalDoors: layout.doors.length };
  });

const checkPerSection = (layout, label) => {
  for (const section of layout.sections) {
    const count = section.doors.length;
    if (count !== 1 && count !== 2) {
      problems.push(`${label}: секция ${section.index} — ${count} створок, ожидали 1 или 2`);
      continue;
    }
    const expected = section.width / count;
    for (const door of section.doors) {
      if (Math.abs(door.width - expected) > 1) {
        problems.push(
          `${label}: секция ${section.index} — створка ${door.width} мм ≠ ${Math.round(expected)} мм`,
        );
      }
    }
  }
  console.log(label, JSON.stringify(layout.sections, null, 2));
};

try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());

  // 1. 4000 мм, 3 секции: в каждой секции 2 створки (по половине проёма).
  await setState(state(4000, [
    { shelves: 3, rod: true, drawers: 0 },
    { shelves: 4, rod: false, drawers: 0 },
    { shelves: 3, rod: true, drawers: 0 },
  ]));
  const wide = await doorLayout();
  console.log('всего створок:', wide.totalDoors);
  checkPerSection(wide, '4000');
  await shot('v5-01-hinged-4000-closed.png');
  await click(page.getByRole('button', { name: 'Открыть двери' }), 'Открыть двери');
  await shot('v5-02-hinged-4000-open.png', 1300);

  // 2. 1200 мм, 3 секции: в каждой секции одна створка во весь проём.
  await setState(state(1200, [
    { shelves: 3, rod: true, drawers: 0 },
    { shelves: 4, rod: false, drawers: 0 },
    { shelves: 3, rod: true, drawers: 0 },
  ]));
  const narrow = await doorLayout();
  console.log('всего створок:', narrow.totalDoors);
  checkPerSection(narrow, '1200');
  await shot('v5-03-hinged-1200-closed.png');

  // 2a. Ручной выбор: у секции 1 включаем две створки вместо одной.
  const section1 = page.getByRole('group', { name: 'Створки, секция 1' });
  if ((await section1.count()) === 0) {
    problems.push('нет переключателя «Створки» у секции 1');
  } else {
    await section1.getByRole('button', { name: 'Две' }).click();
    await page.waitForTimeout(700);
    const manual = await doorLayout();
    const sec1 = manual.sections[0];
    console.log('секция 1 после выбора «Две»:', JSON.stringify(sec1));
    if (sec1.doors.length !== 2) problems.push('секция 1: выбор «Две» не дал две створки');
    const expected = sec1.width / 2;
    for (const door of sec1.doors) {
      if (Math.abs(door.width - expected) > 1) problems.push('секция 1: створка не равна половине проёма');
    }
    await shot('v5-05-hinged-two-doors-section.png');
  }

  // 3. 2000 мм, 3 секции, ящики в середине: двери открываются, ящики выезжают.
  await setState(state(2000, [
    { shelves: 4, rod: true, drawers: 0 },
    { shelves: 2, rod: false, drawers: 3 },
    { shelves: 4, rod: true, drawers: 0 },
  ]));
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v5-04-hinged-drawers.png', 1800);
  const note = page.locator('.stage-note');
  if ((await note.count()) > 0) problems.push('распашные двери ошибочно считаются перекрытием');

  // 5. Купе 2360, 2 секции, ящики во второй: створки уходят влево, ящики доступны.
  console.log('\n--- купе 2360: ящики во второй секции ---');
  await setState(state(2360, [
    { shelves: 4, rod: true, drawers: 0 },
    { shelves: 2, rod: false, drawers: 3 },
  ], 'sliding'));
  await shot('v5-08-kupe-2360-closed.png');
  const kupeGeometry = await page.evaluate(async () => {
    const wardrobe = await import('/src/lib/model.ts');
    const layoutModule = await import('/src/lib/layout.ts');
    const params = wardrobe.normalizeParams(JSON.parse(localStorage.getItem('vasilisa.configurator.v2')).wardrobe);
    const layout = layoutModule.buildLayout(params);
    return {
      innerX0: layout.inner.x0,
      innerX1: layout.inner.x1,
      doors: layout.doors.map((leaf) => ({
        x0: Math.round(leaf.x0),
        x1: Math.round(leaf.x1),
        width: Math.round(leaf.x1 - leaf.x0),
      })),
    };
  });
  console.log('купе, закрытые створки:', JSON.stringify(kupeGeometry, null, 2));
  for (const door of kupeGeometry.doors) {
    if (door.x0 < kupeGeometry.innerX0 - 0.5 || door.x1 > kupeGeometry.innerX1 + 0.5) {
      problems.push(`купе: створка выходит за боковину (${door.x0}…${door.x1}, проём ${kupeGeometry.innerX0}…${kupeGeometry.innerX1})`);
    }
  }
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await shot('v5-06-kupe-2360-drawers.png', 1700);
  const kupeNote = page.locator('.stage-note');
  if ((await kupeNote.count()) > 0) {
    problems.push(`купе 2360: ящики ошибочно перекрыты («${await kupeNote.first().innerText()}»)`);
  }
  const sideButton = page.getByRole('button', { name: /Створки (влево|вправо)/ });
  console.log('кнопка створок:', (await sideButton.count()) > 0 ? await sideButton.first().innerText() : 'нет');
  if ((await sideButton.count()) === 0) problems.push('нет кнопки сдвига створок');

  // 5a. Сдвигаем створки к другой стороне — вторая секция закрывается, появляется предупреждение.
  await sideButton.first().click();
  await page.waitForTimeout(1200);
  await shot('v5-07-kupe-side-switch.png');
  console.log('notice после сдвига:', (await kupeNote.count()) > 0 ? await kupeNote.first().innerText() : 'нет');

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
