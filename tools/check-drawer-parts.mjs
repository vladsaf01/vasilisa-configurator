/**
 * Быстрая проверка состава деталей ящика (без скриншотов).
 * Запуск: node tools/check-drawer-parts.mjs
 */
import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

try {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const result = await page.evaluate(async () => {
    const parts = await import('/src/lib/parts.ts');
    const dresser = await import('/src/lib/dresser.ts');
    const wardrobe = await import('/src/lib/model.ts');
    const layoutModule = await import('/src/lib/layout.ts');

    const layout = dresser.buildDresserLayout(dresser.DRESSER_DEFAULT);
    const dresserParts = dresser.buildDresserParts(dresser.DRESSER_DEFAULT, layout);
    const drawerParts = dresserParts.filter((p) => String(p.role).startsWith('drawer'));

    const wLayout = layoutModule.buildLayout(wardrobe.DEFAULT_PARAMS);
    const wParts = parts.buildParts(wardrobe.DEFAULT_PARAMS, wLayout);
    const wDrawerParts = wParts.filter((p) => String(p.role).startsWith('drawer'));

    const summarize = (list) => {
      const byRole = {};
      for (const p of list) byRole[p.role] = (byRole[p.role] ?? 0) + 1;
      return {
        total: list.length,
        byRole,
        labels: [...new Set(list.map((p) => p.label))],
        groups: [...new Set(list.map((p) => p.group).filter(Boolean))].length,
        boxParts: list
          .filter((p) => ['drawerSide', 'drawerBack', 'drawerBottom'].includes(p.role))
          .slice(0, 4)
          .map((p) => ({ role: p.role, w: p.w, h: p.h, d: p.d })),
      };
    };

    return {
      dresser: summarize(drawerParts),
      wardrobe: summarize(wDrawerParts),
      hasOldBoxRole: dresserParts.some((p) => p.role === 'drawerBox'),
    };
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.log('EXCEPTION:', error.message);
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  process.exit(process.exitCode ?? 0);
}
