/**
 * QA-проверка кровати — четвёртого изделия конструктора «Василиса».
 *
 * Запуск: node tools/bed-states.mjs [url]
 * Подключение: playwright-core + chromium.connectOverCDP('http://127.0.0.1:9222')
 * (дев-сервер должен быть уже запущен на 5174).
 *
 * Что проверяется: старт без ошибок консоли, переключение на кровать, состав
 * панели и цена, ракурсы и пресеты, открывание ящиков, типы изголовья,
 * CSV-спецификация, копирование конфигурации, мобильная вёрстка 390×844,
 * персистентность после reload и регрессия шкафа/комода/тумбы.
 * Скриншоты пишутся в shots/bed-*.png.
 *
 * Только чтение/проверка: src/ не меняется.
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

/** Собираемые ошибки консоли и исключения страницы (с меткой шага). */
const errors = [];
const problems = [];
const results = [];
let stage = 'старт';

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[${stage}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[${stage}] pageerror: ${e.message}`));

/* ---------- Вспомогательные функции ---------- */

const norm = (s) => String(s ?? '').replace(/[\u00a0\u2009\u202f]/g, ' ').toLowerCase();
const normSp = (s) => String(s ?? '').replace(/[\u00a0\u2009\u202f]/g, ' ');

const check = (cond, label, detail = '') => {
  const ok = Boolean(cond);
  results.push({ stage, label, ok, detail });
  if (!ok) problems.push(`[${stage}] ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};

const shot = async (name, wait = 900) => {
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('shot  ', name);
};

const click = async (locator, label) => {
  const target = locator.first();
  if ((await target.count()) === 0) {
    check(false, `кнопка «${label}» существует`);
    return false;
  }
  await target.click();
  console.log('click ', label);
  return true;
};

const bodyText = async () => norm(await page.locator('body').innerText());
const panelText = async () => norm(await page.locator('.panel').innerText());
const headDims = async () =>
  (await page.locator('.ui-head-dims').first().innerText().catch(() => '')).trim();
const priceValue = async () =>
  (await page.locator('.ui-price-value').first().innerText().catch(() => '')).trim();
const title = async () => page.title();

const canvasInfo = () =>
  page.evaluate(() => {
    const root = document.querySelector('.scene-root');
    const canvas = document.querySelector('.scene-canvas');
    if (!canvas) {
      return {
        exists: false,
        rootW: root ? Math.round(root.clientWidth) : 0,
        rootH: root ? Math.round(root.clientHeight) : 0,
      };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      exists: true,
      width: canvas.width,
      height: canvas.height,
      cssW: Math.round(rect.width),
      cssH: Math.round(rect.height),
      rootW: root ? Math.round(root.clientWidth) : 0,
      rootH: root ? Math.round(root.clientHeight) : 0,
    };
  });

const canvasOk = async (label) => {
  const info = await canvasInfo();
  check(
    info.exists && info.cssW > 0 && info.cssH > 0 && info.width > 0 && info.height > 0,
    `${label}: canvas есть и ненулевой`,
    JSON.stringify(info),
  );
  return info;
};

const errorsSince = (before) => errors.slice(before);

const checkNoErrorsSince = (before, label) => {
  const added = errorsSince(before);
  check(added.length === 0, `${label}: без новых ошибок консоли`, added.join(' || '));
  return added;
};

/** Блоки панели по заголовкам .ui-block-title. */
const blockTitles = async () =>
  (await page.locator('.ui-block-title').allInnerTexts()).map((t) => t.trim());

const clickSegment = async (group, option, label) => {
  const groupLocator = page.getByRole('group', { name: group, exact: true });
  if ((await groupLocator.count()) === 0) {
    check(false, `группа «${group}» существует`, label ?? '');
    return false;
  }
  const button = groupLocator.getByRole('button', { name: option, exact: true });
  if ((await button.count()) === 0) {
    check(false, `в группе «${group}» есть «${option}»`);
    return false;
  }
  await button.first().click();
  console.log(`click  ${group} → ${option}`);
  return true;
};

/** Первое найденное имя группы из списка кандидатов (подписи могли поменяться). */
const findGroup = async (names) => {
  for (const name of names) {
    if ((await page.getByRole('group', { name, exact: true }).count()) > 0) return name;
  }
  return null;
};

/**
 * Клик по сегменту с терпимостью к переименованию: перебираем сначала группы,
 * внутри них — варианты подписи. Так скрипт переживает правки текстов панели.
 */
const clickAnySegment = async (groupNames, optionNames, label) => {
  for (const group of groupNames) {
    const groupLocator = page.getByRole('group', { name: group, exact: true });
    if ((await groupLocator.count()) === 0) continue;
    for (const option of optionNames) {
      const button = groupLocator.getByRole('button', { name: option, exact: true });
      if ((await button.count()) === 0) continue;
      await button.first().click();
      console.log(`click  ${group} → ${option}`);
      return { group, option };
    }
  }
  check(false, `не найдена кнопка «${label ?? optionNames[0]}»`, `группы: ${groupNames.join(' / ')}`);
  return null;
};

const activeProduct = async () =>
  page.evaluate(() => {
    const active = document.querySelector('.ui-product-switch-btn.is-active');
    return active ? active.getAttribute('aria-label') : null;
  });

const storedState = () =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('vasilisa.configurator.v2') || 'null');
    } catch {
      return null;
    }
  });

/* ---------- Прогон ---------- */

try {
  /* ===== 1. Старт ===== */
  stage = '1 старт';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  check(errors.length === 0, 'старт: ошибок консоли нет', errors.join(' || '));
  check((await title()).toLowerCase().includes('шкаф'), 'старт: изделие по умолчанию — шкаф', await title());
  await canvasOk('старт');

  /* ===== 2. Переключение на кровать и состав панели ===== */
  stage = '2 кровать';
  const errorsBeforeBed = errors.length;
  await click(page.getByRole('button', { name: 'Кровать', exact: true }), 'Кровать');
  await page.waitForTimeout(900);

  const bedTitle = await title();
  check(
    norm(bedTitle).includes('кроват'),
    `document.title про кровать (фактически: ${bedTitle})`,
    bedTitle,
  );
  const bedPanel = await panelText();
  check(bedPanel.includes('ваша кровать'), 'на панели заголовок «Ваша кровать»');

  const expectedBlocks = [
    'Готовые варианты',
    'Спальное место',
    'Изголовье',
    'Ящики',
    'Ручки',
    'Основание',
    'Материалы',
    'Скоро в конструкторе',
    'Итого',
    'Отправить заявку',
  ];
  const titles = await blockTitles();
  for (const expected of expectedBlocks) {
    check(
      titles.some((t) => norm(t) === norm(expected)),
      `блок панели «${expected}»`,
      titles.join(' | '),
    );
  }
  check(
    !titles.some((t) => norm(t) === 'дополнительно'),
    'блока «Дополнительно» нет (опция ДВП убрана)',
    titles.join(' | '),
  );

  /* ===== 2b. Геометрия изголовья: низкая спинка-полка + высокая стенка ===== */
  stage = '2b геометрия';
  const geo = await page.evaluate(async () => {
    try {
      const bed = await import('/src/lib/bed.ts');
      const state = JSON.parse(localStorage.getItem('vasilisa.configurator.v2') || 'null');
      const params = bed.normalizeBedParams(state ? state.bed : undefined);
      const layout = bed.buildBedLayout(params);
      const parts = bed.buildBedParts(params, layout);
      return {
        params,
        height: layout.height,
        totalHeight: layout.totalHeight,
        back: layout.headboard.back,
        side: layout.headboard.side,
        sideLen: layout.sideLen,
        drawerCount: layout.drawerFronts.length,
        parts: parts.map((part) => ({
          role: part.role,
          label: part.label,
          plane: part.profilePlane ?? null,
          points: part.profile ? part.profile.length : 0,
          shape: part.shape ?? 'box',
        })),
      };
    } catch (error) {
      return { error: String(error) };
    }
  });
  check(!geo.error, 'модель кровати импортируется для проверки', String(geo.error ?? ''));
  if (!geo.error) {
    console.log('геометрия по умолчанию:', JSON.stringify({
      height: geo.height,
      totalHeight: geo.totalHeight,
      back: geo.back,
      side: geo.side,
      sideLen: geo.sideLen,
      params: {
        headboard: geo.params.headboard,
        headboardHeight: geo.params.headboardHeight,
        wallSide: geo.params.wallSide,
        wallHeight: geo.params.wallHeight,
        wallLength: geo.params.wallLength,
      },
    }));
    check(geo.back && geo.back.y1 > geo.height, 'спинка-полка выше столешницы', JSON.stringify(geo.back));
    check(
      geo.side && geo.side.y1 - geo.height >= 100,
      'стенка по длине выше столешницы минимум на 100 мм',
      JSON.stringify(geo.side),
    );
    check(
      geo.side && geo.side.z1 - geo.side.z0 >= 600,
      'длина стенки не меньше 600 мм',
      geo.side ? `${geo.side.z1 - geo.side.z0}` : 'стенки нет',
    );
    check(
      geo.side && geo.side.x1 <= geo.params.width / 2 + 1 && geo.side.x0 >= -geo.params.width / 2 - 1,
      'стенка не выходит за габарит кровати',
      geo.side ? `x ${geo.side.x0}…${geo.side.x1}` : 'стенки нет',
    );
    const roles = geo.parts.map((part) => part.role);
    check(
      roles.includes('headboard') && roles.includes('headboardSide'),
      'в деталях есть и спинка-полка, и стенка',
      roles.join(', '),
    );
    const shelfPart = geo.parts.find((part) => part.role === 'headboard');
    check(
      shelfPart && shelfPart.plane === 'xy' && shelfPart.points >= 4,
      'спинка-полка — выдавленный профиль',
      JSON.stringify(shelfPart ?? null),
    );
    const wallPart = geo.parts.find((part) => part.role === 'headboardSide');
    check(
      wallPart && wallPart.plane === 'zy' && wallPart.points >= 10,
      'стенка — выдавленный профиль со скруглением (точек профиля ≥ 10)',
      JSON.stringify(wallPart ?? null),
    );
    const partLabels = [...new Set(geo.parts.map((part) => part.label))];
    console.log('детали кровати:', partLabels.join(', '));
    check(
      partLabels.includes('Спинка-полка') && partLabels.includes('Стенка по длине'),
      'в деталях есть «Спинка-полка» и «Стенка по длине»',
      partLabels.join(', '),
    );
    check(geo.drawerCount === 2, 'по умолчанию 2 фасада ящиков', String(geo.drawerCount));
  }

  /* ===== 2c. Факты модели: дефолт, пресеты, цена ===== */
  stage = '2c факты модели';
  const facts = await page.evaluate(async () => {
    try {
      const bed = await import('/src/lib/bed.ts');
      const describe = (rawParams) => {
        const params = bed.normalizeBedParams(rawParams);
        const layout = bed.buildBedLayout(params);
        const parts = bed.buildBedParts(params, layout);
        const wall = parts.find((part) => part.role === 'headboardSide');
        const shelf = parts.find((part) => part.role === 'headboard');
        const price = bed.calcBedPrice(params, layout);
        return {
          params: {
            width: params.width,
            length: params.length,
            height: params.height,
            headboard: params.headboard,
            headboardHeight: params.headboardHeight,
            wallSide: params.wallSide,
            wallHeight: params.wallHeight,
            wallLength: params.wallLength,
            drawers: params.drawers,
            base: params.base,
            baseHeight: params.baseHeight,
            body: params.body,
            deck: params.deck,
            handles: params.handles,
          },
          sideLen: layout.sideLen,
          totalHeight: layout.totalHeight,
          drawerFronts: layout.drawerFronts.length,
          hasWall: Boolean(layout.headboard.side),
          wallProfilePlane: wall ? wall.profilePlane : null,
          wallProfilePoints: wall && wall.profile ? wall.profile.length : 0,
          shelfProfilePlane: shelf ? shelf.profilePlane : null,
          price: {
            total: price.total,
            goods: price.goods,
            assembly: price.assembly,
            delivery: price.delivery,
          },
        };
      };
      return {
        default: describe(bed.BED_DEFAULT),
        presets: bed.BED_PRESETS.map((preset) => ({
          id: preset.id,
          label: preset.label,
          facts: describe(bed.applyBedPreset(bed.BED_DEFAULT, preset.patch)),
        })),
      };
    } catch (error) {
      return { error: String(error) };
    }
  });
  check(!facts.error, 'факты модели (bed.ts) доступны', String(facts.error ?? ''));
  if (!facts.error) {
    const d = facts.default;
    const eq = (left, right) => left === right;
    console.log('дефолт модели:', JSON.stringify({ params: d.params, price: d.price, sideLen: d.sideLen }));
    check(eq(d.params.width, 900) && eq(d.params.length, 2000), 'дефолт: 900 × 2 000 мм', `${d.params.width} × ${d.params.length}`);
    check(eq(d.params.height, 450), 'дефолт: каркас 450 мм', `${d.params.height}`);
    check(eq(d.params.headboard, 'wave') && eq(d.params.headboardHeight, 240), 'дефолт: «волна» + спинка-полка 240 мм', `${d.params.headboard} / ${d.params.headboardHeight}`);
    check(
      eq(d.params.wallSide, 'left') && eq(d.params.wallHeight, 400) && eq(d.params.wallLength, 1800),
      'дефолт: стенка слева 1 800 × 400 мм',
      `${d.params.wallSide} ${d.params.wallLength} × ${d.params.wallHeight}`,
    );
    check(d.sideLen <= d.params.length - 200 + 0.5, 'длина стенки ≤ длина кровати − 200 мм', `${d.sideLen} ≤ ${d.params.length - 200}`);
    check(eq(d.drawerFronts, 2), 'дефолт: 2 фасада ящиков', `${d.drawerFronts}`);
    check(eq(d.params.base, 'plinth') && eq(d.params.baseHeight, 60), 'дефолт: цоколь 60 мм', `${d.params.base} ${d.params.baseHeight}`);
    check(
      eq(d.params.body, 'white') && eq(d.params.deck, 'oak') && eq(d.params.handles, 'cutout'),
      'дефолт: белый корпус + дуб, вырез в фасаде',
      `${d.params.body} / ${d.params.deck} / ${d.params.handles}`,
    );
    check(
      d.wallProfilePlane === 'zy' && d.wallProfilePoints >= 10,
      'дефолт: скруглённый торец стенки (профиль zy, ≥ 10 точек)',
      `${d.wallProfilePlane} / ${d.wallProfilePoints}`,
    );
    check(d.price.total === 34600, 'дефолт: цена модели 34 600 ₽', `${d.price.total}`);
    check(
      d.price.goods === 25592 && d.price.assembly === 5500 && d.price.delivery === 3500,
      'дефолт: изделие 25 592 + монтаж 5 500 + доставка 3 500',
      `${d.price.goods} + ${d.price.assembly} + ${d.price.delivery}`,
    );

    const presetExpected = [
      { id: 'photo', label: 'Как на фото', width: 900, length: 2000, height: 450, headboard: 'wave', wallSide: 'left', wallHeight: 400, wallLength: 1800, drawerFronts: 2, base: 'plinth', baseHeight: 60, wallPoints: 'arc' },
      { id: 'single', label: 'Односпальная', width: 900, length: 2000, height: 450, headboard: 'straight', drawerFronts: 2, base: 'legs', baseHeight: 80, wall: false },
      { id: 'corner', label: 'Угловая', width: 1200, length: 2000, height: 460, headboard: 'corner', headboardHeight: 260, wallSide: 'left', wallHeight: 440, wallLength: 1600, drawerFronts: 3, base: 'plinth', baseHeight: 80, wallPoints: 'straight' },
      { id: 'double', label: 'Двуспальная', width: 1600, length: 2000, headboard: 'straight', headboardHeight: 280, drawerFronts: 4, base: 'legs', baseHeight: 100, wall: false },
      { id: 'podium', label: 'Подиум', width: 1200, length: 2000, headboard: 'none', drawerFronts: 3, base: 'plinth', baseHeight: 60, wall: false },
    ];
    const presetById = Object.fromEntries(facts.presets.map((row) => [row.id, row.facts]));
    for (const expected of presetExpected) {
      const preset = presetById[expected.id];
      if (!preset) {
        check(false, `пресет «${expected.label}» есть в модели`);
        continue;
      }
      const actual = { ...preset.params, drawerFronts: preset.drawerFronts };
      const mismatches = Object.entries(expected)
        .filter(([key]) => !['id', 'label', 'wall', 'wallPoints'].includes(key))
        .filter(([key, value]) => actual[key] !== value)
        .map(([key, value]) => `${key}: ${JSON.stringify(actual[key])} ≠ ${JSON.stringify(value)}`);
      check(mismatches.length === 0, `пресет «${expected.label}»: параметры совпадают`, mismatches.join('; '));
      if (expected.wall === false) {
        check(preset.hasWall === false, `пресет «${expected.label}»: стенки нет`, String(preset.hasWall));
      } else if (preset.hasWall) {
        check(
          preset.sideLen <= preset.params.length - 200 + 0.5,
          `пресет «${expected.label}»: длина стенки ≤ длина − 200`,
          `${preset.sideLen} ≤ ${preset.params.length - 200}`,
        );
        if (expected.wallPoints === 'arc') {
          check(
            preset.wallProfilePlane === 'zy' && preset.wallProfilePoints >= 10,
            `пресет «${expected.label}»: торец стенки скруглён`,
            `${preset.wallProfilePlane} / ${preset.wallProfilePoints}`,
          );
        } else if (expected.wallPoints === 'straight') {
          check(
            preset.wallProfilePlane === 'zy' && preset.wallProfilePoints === 4,
            `пресет «${expected.label}»: торец стенки прямой`,
            `${preset.wallProfilePlane} / ${preset.wallProfilePoints}`,
          );
        }
      } else {
        check(false, `пресет «${expected.label}»: стенка не построена`);
      }
    }
  }

  const bedDims = await headDims();
  const bedPriceText = await priceValue();
  const bedPriceNum = Number(bedPriceText.replace(/[^\d]/g, ''));
  check(/₽/.test(bedPriceText), 'в панели есть цена в ₽', bedPriceText);
  check(bedPriceNum > 20000, 'цена кровати > 20 000 ₽', `${bedPriceText} → ${bedPriceNum}`);
  check(
    normSp(bedPriceText) === '34 600 ₽',
    'цена в панели по умолчанию 34 600 ₽',
    JSON.stringify(bedPriceText),
  );
  check(
    (await page.getByRole('switch', { name: 'Задняя стенка ДВП' }).count()) === 0,
    'переключателя «Задняя стенка ДВП» нет',
  );
  const bedSub = (
    await page.locator('.ui-head-sub').first().innerText().catch(() => '')
  ).trim();
  console.log('габариты кровати (панель):', bedDims, '|', bedSub);
  console.log('цена кровати по умолчанию:', bedPriceText);
  check(
    normSp(bedDims).includes('900 × 2 000'),
    'габариты кровати по умолчанию 900 × 2 000 мм',
    bedDims,
  );

  await canvasOk('кровать');
  const bedCanvas = await canvasInfo();

  /* ===== 3. Скриншоты состояний 1440×900 ===== */
  stage = '3 скриншоты';
  await shot('bed-01-default.png', 900);

  await click(page.getByRole('button', { name: 'Спереди', exact: true }), 'Спереди');
  await page.waitForTimeout(900);
  const activeView = async () =>
    (await page.locator('.seg-btn.is-active').first().innerText().catch(() => '')).trim();
  check((await activeView()) === 'Спереди', 'ракурс «Спереди» активен', await activeView());
  await shot('bed-02-front.png', 0);

  await click(page.getByRole('button', { name: 'Сбоку', exact: true }), 'Сбоку');
  await page.waitForTimeout(900);
  check((await activeView()) === 'Сбоку', 'ракурс «Сбоку» активен', await activeView());
  await shot('bed-03-side.png', 0);

  // Возвращаем 3/4 — ящики видны под углом.
  await click(page.getByRole('button', { name: '3/4', exact: true }), '3/4');
  await page.waitForTimeout(700);

  const errorsBeforeDrawers = errors.length;
  await click(page.getByRole('button', { name: 'Открыть ящики' }), 'Открыть ящики');
  await page.waitForTimeout(1400);
  check(
    (await page.getByRole('button', { name: 'Задвинуть ящики' }).count()) === 1,
    'кнопка переключилась в «Задвинуть ящики»',
  );
  checkNoErrorsSince(errorsBeforeDrawers, 'открывание ящиков');
  await shot('bed-04-drawers.png', 0);

  // Закрываем ящики, чтобы пресеты снимались в базовом виде.
  await click(page.getByRole('button', { name: 'Задвинуть ящики' }), 'Задвинуть ящики');
  await page.waitForTimeout(1200);

  const presetShot = async (preset, file) => {
    const before = errors.length;
    await click(page.getByRole('button', { name: preset, exact: true }), `пресет ${preset}`);
    await page.waitForTimeout(700);
    checkNoErrorsSince(before, `пресет «${preset}»`);
    await shot(file, 200);
  };

  await presetShot('Как на фото', 'bed-05-photo.png');
  await presetShot('Угловая', 'bed-06-corner.png');
  await presetShot('Подиум', 'bed-07-podium.png');
  await presetShot('Двуспальная', 'bed-08-double.png');

  // bed-09: вернуть «Как на фото», затем сторона стенки «Слева».
  await click(page.getByRole('button', { name: 'Как на фото', exact: true }), 'Как на фото');
  await page.waitForTimeout(600);
  const sideGroup = await findGroup(['Сторона стенки', 'Сторона изголовья']);
  check(Boolean(sideGroup), 'у «волны» есть группа выбора стороны стенки', String(sideGroup));
  if (sideGroup) {
    // Проверяем само переключение: справа, затем обратно на «Слева».
    const rightClick = await clickAnySegment([sideGroup], ['Справа'], 'Справа');
    await page.waitForTimeout(700);
    if (rightClick) {
      const pressedRight = await page
        .getByRole('group', { name: sideGroup, exact: true })
        .getByRole('button', { name: 'Справа', exact: true })
        .getAttribute('aria-pressed');
      check(pressedRight === 'true', 'сторона стенки переключается на «Справа»', String(pressedRight));
      check((await panelText()).includes('справа'), 'подпись панели показывает стенку справа');
    }
    const sideClick = await clickAnySegment([sideGroup], ['Слева'], 'Слева');
    await page.waitForTimeout(900);
    if (sideClick) {
      const pressed = await page
        .getByRole('group', { name: sideGroup, exact: true })
        .getByRole('button', { name: 'Слева', exact: true })
        .getAttribute('aria-pressed');
      check(pressed === 'true', 'сторона стенки «Слева» выбрана', String(pressed));
      check((await panelText()).includes('слева'), 'подпись панели показывает стенку слева');
    }
  }
  await shot('bed-09-wave-left.png', 0);

  /* ===== 4. Типы изголовья ===== */
  stage = '4 изголовье';
  // Новые подписи — первыми, старые оставлены на случай откатов правки.
  const headboardVariants = [
    ['Спинка-полка', 'Прямая спинка'],
    ['Без изголовья'],
    ['Угловая: спинка + стенка', 'Угловая спинка'],
    ['Угловая «волна»'],
  ];
  for (const names of headboardVariants) {
    const before = errors.length;
    const clicked = await clickAnySegment(['Тип изголовья'], names, names[0]);
    await page.waitForTimeout(800);
    if (!clicked) continue;
    await canvasOk(`изголовье «${clicked.option}»`);
    checkNoErrorsSince(before, `изголовье «${clicked.option}»`);
    const pressed = await page
      .getByRole('group', { name: 'Тип изголовья', exact: true })
      .getByRole('button', { name: clicked.option, exact: true })
      .getAttribute('aria-pressed');
    check(pressed === 'true', `изголовье «${clicked.option}» выбрано`, String(pressed));
    const expectSide = clicked.option.includes('Угловая');
    const currentSideGroup = await findGroup(['Сторона стенки', 'Сторона изголовья']);
    check(
      Boolean(currentSideGroup) === expectSide,
      `сторона стенки ${expectSide ? 'есть' : 'скрыта'} для «${clicked.option}»`,
      String(currentSideGroup),
    );
    if (expectSide) {
      check(
        (await page.getByLabel('Длина стенки').count()) > 0,
        `для «${clicked.option}» есть поле «Длина стенки»`,
      );
      check(
        (await page.getByLabel('Высота стенки').count()) > 0,
        `для «${clicked.option}» есть поле «Высота стенки»`,
      );
    }
  }

  /* ===== 5. CSV-спецификация ===== */
  stage = '5 CSV';
  // Детерминированно возвращаем стартовую конфигурацию («Как на фото»).
  await click(page.getByRole('button', { name: 'Как на фото', exact: true }), 'Как на фото');
  await page.waitForTimeout(700);

  const errorsBeforeCsv = errors.length;
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await click(page.getByRole('button', { name: 'Спецификация CSV' }), 'Спецификация CSV');
  const download = await downloadPromise;
  check(Boolean(download), 'скачивается CSV-спецификация');
  let csvRows = 0;
  let csvLines = [];
  if (download) {
    const file = await download.path();
    const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    csvLines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    csvRows = csvLines.length - 1;
    const detailLabels = csvLines.slice(1).map((line) => line.split(';')[1]);
    console.log('CSV: строк данных =', csvRows, '| первая строка:', csvLines[0]);
    console.log('CSV: названия деталей:', detailLabels.join(', '));
    check(csvRows > 8, 'CSV: строк деталей > 8', `строк данных ${csvRows}`);
    check(
      detailLabels.includes('Фасад ящика с вырезом'),
      'CSV: есть «Фасад ящика с вырезом»',
      detailLabels.join(', '),
    );
    check(
      detailLabels.some((label) => label === 'Спинка-полка' || label === 'Стенка по длине' || label === 'Изголовье'),
      'CSV: есть деталь изголовья (спинка-полка / стенка)',
      detailLabels.join(', '),
    );
  }
  checkNoErrorsSince(errorsBeforeCsv, 'CSV');

  /* ===== 6. Копирование конфигурации ===== */
  stage = '6 копирование';
  const errorsBeforeCopy = errors.length;
  const copyClicked = await click(
    page.getByRole('button', { name: 'Скопировать конфигурацию' }),
    'Скопировать конфигурацию',
  );
  await page.waitForTimeout(800);
  if (copyClicked) {
    const copyBtnText = (
      await page
        .locator('.ui-actions-row')
        .getByRole('button')
        .nth(1)
        .innerText()
        .catch(() => '')
    ).trim();
    console.log('кнопка копирования после клика:', copyBtnText);
    checkNoErrorsSince(errorsBeforeCopy, 'копирование');
  }

  /* ===== 7. Мобильная вёрстка 390×844 ===== */
  stage = '7 мобильный';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const mobile = await page.evaluate(() => {
    const panel = document.querySelector('.panel');
    const switchRoot = document.querySelector('.ui-product-switch');
    const buttons = Array.from(document.querySelectorAll('.ui-product-switch-btn'));
    return {
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      panelScrollWidth: panel ? panel.scrollWidth : -1,
      panelClientWidth: panel ? panel.clientWidth : -1,
      switchScrollWidth: switchRoot ? switchRoot.scrollWidth : -1,
      switchClientWidth: switchRoot ? switchRoot.clientWidth : -1,
      buttonCount: buttons.length,
      buttons: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.getAttribute('aria-label'),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
    };
  });
  console.log('mobile metrics:', JSON.stringify(mobile));
  check(
    mobile.bodyScrollWidth <= mobile.innerWidth + 1,
    'мобильный: нет горизонтального скролла body',
    `${mobile.bodyScrollWidth} ≤ ${mobile.innerWidth}`,
  );
  check(
    mobile.docScrollWidth <= mobile.innerWidth + 1,
    'мобильный: нет горизонтального скролла документа',
    `${mobile.docScrollWidth} ≤ ${mobile.innerWidth}`,
  );
  check(
    mobile.panelScrollWidth - mobile.panelClientWidth <= 1,
    'мобильный: панель без горизонтального переполнения',
    `${mobile.panelScrollWidth - mobile.panelClientWidth}`,
  );
  check(mobile.buttonCount === 4, 'мобильный: в переключателе 4 изделия', String(mobile.buttonCount));
  const buttonsFit = mobile.buttons.every(
    (b) => b.width > 0 && b.height > 0 && b.left >= -1 && b.right <= mobile.innerWidth + 1,
  );
  check(buttonsFit, 'мобильный: кнопки переключателя влезают по ширине', JSON.stringify(mobile.buttons));
  check(
    mobile.switchScrollWidth - mobile.switchClientWidth <= 1,
    'мобильный: переключатель без переполнения',
    `${mobile.switchScrollWidth - mobile.switchClientWidth}`,
  );
  // Для скриншота возвращаем панель и страницу в начало — видно переключатель 4 изделий.
  await page.evaluate(() => {
    const panel = document.querySelector('.panel');
    if (panel) panel.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  await shot('bed-11-mobile.png', 200);

  /* ===== 8. Персистентность: «Двуспальная» + reload ===== */
  stage = '8 персистентность';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(700);
  await click(page.getByRole('button', { name: 'Двуспальная', exact: true }), 'Двуспальная');
  await page.waitForTimeout(800);
  const doubleDims = await headDims();
  check(
    normSp(doubleDims).includes('1 600 × 2 000') || normSp(doubleDims).includes('1 600'),
    'после пресета «Двуспальная» ширина 1600',
    doubleDims,
  );
  const stateBeforeReload = await storedState();
  check(stateBeforeReload?.product === 'bed', 'в localStorage product=bed', String(stateBeforeReload?.product));
  check(stateBeforeReload?.bed?.width === 1600, 'в localStorage bed.width=1600', String(stateBeforeReload?.bed?.width));

  const errorsBeforeReload = errors.length;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check(
    norm(await title()).includes('кроват'),
    `после reload title про кровать (фактически: ${await title()})`,
    await title(),
  );
  check((await panelText()).includes('ваша кровать'), 'после reload панель «Ваша кровать»');
  check((await activeProduct()) === 'Кровать', 'после reload активно изделие «Кровать»', String(await activeProduct()));
  const reloadDims = await headDims();
  check(
    normSp(reloadDims).includes('1 600 × 2 000') || normSp(reloadDims).includes('1 600'),
    'после reload ширина 1600 сохранилась',
    reloadDims,
  );
  const stateAfterReload = await storedState();
  check(stateAfterReload?.product === 'bed', 'после reload localStorage product=bed', String(stateAfterReload?.product));
  check(stateAfterReload?.bed?.width === 1600, 'после reload localStorage bed.width=1600', String(stateAfterReload?.bed?.width));
  checkNoErrorsSince(errorsBeforeReload, 'персистентность/reload');
  await shot('bed-15-persist-double.png', 300);

  /* ===== 9. Регрессия старых изделий ===== */
  stage = '9 регрессия';
  const regressions = [
    { name: 'Встроенный шкаф', heading: 'Ваш шкаф', file: 'bed-12-wardrobe.png' },
    { name: 'Комод', heading: 'Ваш комод', file: 'bed-13-dresser.png' },
    { name: 'Тумба', heading: 'Ваша тумба', file: 'bed-14-tumba.png' },
  ];
  for (const item of regressions) {
    const before = errors.length;
    await click(page.getByRole('button', { name: item.name, exact: true }), item.name);
    await page.waitForTimeout(900);
    const panel = await panelText();
    check(panel.includes(norm(item.heading)), `${item.name}: заголовок панели «${item.heading}»`);
    await canvasOk(item.name);
    checkNoErrorsSince(before, item.name);
    await shot(item.file, 200);
  }

  /* ===== 10. Итоговые ошибки консоли ===== */
  stage = '10 итог';
  check(errors.length === 0, 'за весь прогон нет ошибок консоли', `${errors.length}`);
} catch (error) {
  problems.push(`[${stage}] исключение: ${error.message}`);
  console.log('EXCEPTION:', error.stack ?? error.message);
} finally {
  await page.close().catch(() => {});
}

/* ---------- Отчёт ---------- */

console.log('\n================ РЕЗУЛЬТАТЫ ================');
const passed = results.filter((r) => r.ok).length;
console.log(`проверок: ${results.length} · PASS: ${passed} · FAIL: ${results.length - passed}`);
if (results.some((r) => !r.ok)) {
  console.log('\nFAIL-пункты:');
  for (const r of results.filter((item) => !item.ok)) {
    console.log(` - [${r.stage}] ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
  }
}

console.log('\nCONSOLE ERRORS (полностью):');
if (errors.length === 0) {
  console.log(' нет');
} else {
  errors.forEach((error, index) => {
    console.log(` ${index + 1}) ${error}`);
  });
}

console.log('\nИТОГ:', problems.length === 0 && errors.length === 0 ? 'всё ок' : 'есть замечания');
for (const problem of problems) console.log(' -', problem);

process.exit(problems.length === 0 && errors.length === 0 ? 0 : 1);
