/**
 * Скриншот страницы через уже запущенный Chrome (CDP 9222).
 * Использование:
 *   node tools/shot.mjs <url> <out.png> [ширина] [высота] [full]
 * Печатает ошибки консоли страницы, если они есть.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [, , url = 'http://127.0.0.1:5174', out = 'shot.png', width = '1440', height = '900', mode = ''] =
  process.argv;

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
if (!context) {
  console.error('Нет контекста браузера');
  process.exit(1);
}

const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

try {
  await page.setViewportSize({ width: Number(width), height: Number(height) });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1800);

  const outPath = path.resolve(out);
  mkdirSync(path.dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: mode === 'full' });

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return {
      title: document.title,
      canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      webgl: (() => {
        if (!canvas) return null;
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        return gl ? gl.getParameter(gl.VERSION) : 'no-context';
      })(),
    };
  });

  console.log('saved', outPath);
  console.log('info', JSON.stringify(info));
  if (errors.length > 0) {
    console.log('ERRORS:');
    for (const error of errors) console.log(' -', error);
  } else {
    console.log('no console errors');
  }
} catch (error) {
  console.error('SHOT FAILED:', error.message);
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
}
process.exit(process.exitCode ?? 0);
