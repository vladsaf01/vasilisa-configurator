/**
 * Заявка и документы: текст конфигурации для WhatsApp/Telegram,
 * спецификация деталей (CSV), сохранение файлов.
 */
import {
  BODY_LABEL,
  CabinetParams,
  DOORS_LABEL,
  FACADE_LABEL,
  totalDrawers,
  totalRods,
  totalShelves,
} from './model';
import type { Layout } from './layout';
import { buildParts, type Part } from './parts';
import type { PriceResult } from './price';
import {
  BASE_LABEL,
  HANDLE_LABEL,
  buildDresserParts,
  sectionSummary,
  type DresserLayout,
  type DresserParams,
} from './dresser';
import { buildTumbaParts, type TumbaParams } from './tumba';
import {
  BED_HANDLE_LABEL,
  BED_HEADBOARD_LABEL,
  BED_SIDE_SHORT,
  buildBedParts,
  type BedLayout,
  type BedParams,
} from './bed';
import { SITE } from './site';
import { dims, num } from './format';

export function buildQuoteText(params: CabinetParams, layout: Layout, price: PriceResult): string {
  const extras: string[] = [];
  if (params.lighting) extras.push('LED-подсветка');
  if (params.backPanel) extras.push('задняя стенка ДВП');
  if (params.mezzanine) extras.push('антресоль');
  if (params.plinth > 0) extras.push(`цоколь ${num(params.plinth)} мм`);

  return [
    `Встроенный шкаф — конфигурация с сайта ${SITE.name}`,
    `Габариты: ${dims(layout.width, layout.height, layout.depth)}`,
    `Секции: ${layout.sections.length} · полок: ${totalShelves(params)} · ящиков: ${totalDrawers(params)} · штанг: ${totalRods(params)}`,
    `Двери: ${DOORS_LABEL[params.doors]} · фасад: ${FACADE_LABEL[params.facade]}`,
    `Корпус: ${BODY_LABEL[params.body]} · ${extras.length > 0 ? extras.join(', ') : 'без доп. опций'}`,
    `Ориентировочная цена: ${num(price.total)} ₽ (изделие ${num(price.goods)} ₽ + монтаж ${num(price.assembly)} ₽ + доставка ${num(price.delivery)} ₽)`,
    'Прошу проверить размеры по месту и уточнить стоимость.',
  ].join('\n');
}

export function whatsappUrl(text: string): string {
  return `${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** Текст заявки по комоду. */
export function buildDresserQuoteText(
  params: DresserParams,
  layout: DresserLayout,
  price: PriceResult,
): string {
  const sections = params.sections
    .map((section, index) => `${index + 1}) ${sectionSummary(section, layout.sections[index]?.doors.length ?? 1)}`)
    .join(' · ');
  return [
    `Комод — конфигурация с сайта ${SITE.name}`,
    `Габариты: ${dims(layout.width, layout.height, layout.depth)}`,
    `Секции (${params.sections.length}): ${sections}`,
    `Основание: ${BASE_LABEL[params.base]} ${layout.baseH > 0 ? `${num(layout.baseH)} мм` : ''}`.trim(),
    `Корпус: ${BODY_LABEL[params.body]} · фасады: ${FACADE_LABEL[params.facade]} · ручки: ${HANDLE_LABEL[params.handles]}`,
    `Ориентировочная цена: ${num(price.total)} ₽ (изделие ${num(price.goods)} ₽ + монтаж ${num(price.assembly)} ₽ + доставка ${num(price.delivery)} ₽)`,
    'Прошу уточнить стоимость и сроки.',
  ].join('\n');
}

/** Текст заявки по тумбе. */
export function buildTumbaQuoteText(
  params: TumbaParams,
  layout: DresserLayout,
  price: PriceResult,
): string {
  const sections = params.sections
    .map((section, index) => `${index + 1}) ${sectionSummary(section, layout.sections[index]?.doors.length ?? 1)}`)
    .join(' · ');
  return [
    `Тумба — конфигурация с сайта ${SITE.name}`,
    `Габариты: ${dims(layout.width, layout.height, layout.depth)}`,
    `Секции (${params.sections.length}): ${sections}`,
    `Основание: ${BASE_LABEL[params.base]} ${layout.baseH > 0 ? `${num(layout.baseH)} мм` : ''}`.trim(),
    `Корпус: ${BODY_LABEL[params.body]} · фасады: ${FACADE_LABEL[params.facade]} · ручки: ${HANDLE_LABEL[params.handles]}`,
    `Ориентировочная цена: ${num(price.total)} ₽ (изделие ${num(price.goods)} ₽ + монтаж ${num(price.assembly)} ₽ + доставка ${num(price.delivery)} ₽)`,
    'Прошу уточнить стоимость и сроки.',
  ].join('\n');
}

/** Текст заявки по кровати. */
export function buildBedQuoteText(
  params: BedParams,
  layout: BedLayout,
  price: PriceResult,
): string {
  const hasWall = params.headboard === 'corner' || params.headboard === 'wave';
  const headboard =
    params.headboard === 'none'
      ? 'без изголовья'
      : `${BED_HEADBOARD_LABEL[params.headboard]} · спинка ${num(params.headboardHeight)} мм` +
        (hasWall
          ? ` · стенка по длине ${num(params.wallLength)} × ${num(params.wallHeight)} мм (${BED_SIDE_SHORT[params.wallSide]})`
          : '');
  return [
    `Кровать с ящиками — конфигурация с сайта ${SITE.name}`,
    `Спальное место: ${num(layout.width)} × ${num(layout.length)} мм · высота каркаса ${num(layout.height)} мм`,
    `Изголовье: ${headboard}`,
    `Ящики: ${layout.drawerFronts.length} · ручки: ${BED_HANDLE_LABEL[params.handles].toLowerCase()}`,
    `Основание: ${BASE_LABEL[params.base]} ${layout.baseH > 0 ? `${num(layout.baseH)} мм` : ''}`.trim(),
    `Корпус: ${BODY_LABEL[params.body]} · столешница и изголовье: ${BODY_LABEL[params.deck]} · задняя стенка жёсткая, ЛДСП 16 мм`,
    `Ориентировочная цена: ${num(price.total)} ₽ (изделие ${num(price.goods)} ₽ + монтаж ${num(price.assembly)} ₽ + доставка ${num(price.delivery)} ₽)`,
    'Матрас в цену не входит. Прошу уточнить стоимость и сроки.',
  ].join('\n');
}

/** Спецификация по готовому списку деталей. */
export function specCsvForParts(parts: Part[]): string {  const rows = new Map<string, { part: Part; count: number }>();
  for (const part of parts) {
    const key = [part.role, part.label, part.w, part.h, part.d, part.material].join('|');
    const row = rows.get(key);
    if (row) row.count += 1;
    else rows.set(key, { part, count: 1 });
  }

  const head = ['№', 'Деталь', 'Ширина, мм', 'Высота, мм', 'Глубина, мм', 'Материал', 'Кол-во'];
  const body = Array.from(rows.values()).map((row, index) => [
    String(index + 1),
    row.part.label,
    num(Math.round(row.part.w)),
    num(Math.round(row.part.h)),
    num(Math.round(row.part.d)),
    MATERIAL_LABEL[row.part.material] ?? row.part.material,
    String(row.count),
  ]);

  return [head, ...body].map((line) => line.join(';')).join('\r\n');
}

/** Спецификация деталей комода. */
export function dresserSpecCsv(params: DresserParams, layout: DresserLayout): string {
  return specCsvForParts(buildDresserParts(params, layout));
}

/** Спецификация деталей тумбы. */
export function tumbaSpecCsv(params: TumbaParams, layout: DresserLayout): string {
  return specCsvForParts(buildTumbaParts(params, layout));
}

/** Спецификация деталей кровати. */
export function bedSpecCsv(params: BedParams, layout: BedLayout): string {
  return specCsvForParts(buildBedParts(params, layout));
}

export function telegramUrl(text: string): string {
  return `${SITE.telegramShare}?url=${encodeURIComponent(SITE.url)}&text=${encodeURIComponent(text)}`;
}

const MATERIAL_LABEL: Record<string, string> = {
  body: 'ЛДСП',
  facade: 'Фасад',
  back: 'ДВП',
  plinth: 'Цоколь',
  metal: 'Металл',
  track: 'Трек',
  light: 'LED',
  glass: 'Стекло',
  mirror: 'Зеркало',
  deck: 'ЛДСП (столешница)',
  recess: 'Вырез',
};

/** Спецификация деталей шкафа: одинаковые позиции суммируются в количество. */
export function specCsv(params: CabinetParams, layout: Layout): string {
  return specCsvForParts(buildParts(params, layout));
}

/** Скачивание текстового файла из браузера. */
export function downloadFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Скачивание PNG по dataURL (скриншот 3D-сцены). */
export function downloadPng(filename: string, dataUrl: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function fileStamp(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
