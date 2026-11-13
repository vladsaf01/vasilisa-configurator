/**
 * Тумба: параметры, ограничения, пресеты и цена.
 *
 * Геометрия и детали переиспользуются из комода (`dresser.ts`): у тумбы те же
 * типы секций (ящики / дверь + полки / открытая ниша) и основание, но меньше
 * габариты и нет штанги.
 */
import { BODY_LABEL, FACADE_LABEL, PANEL, clamp, snap, type BodyFinish, type FacadeFinish } from './model';
import {
  BASE_LABEL,
  HANDLE_LABEL,
  buildDresserLayout,
  buildDresserParts,
  dresserScene,
  sectionSummary,
  totalDresserDoors,
  totalDresserDrawers,
  type DresserBase,
  type DresserLayout,
  type DresserParams,
  type DresserSection,
  type HandleStyle,
} from './dresser';
import { facadeMultiplier, type PriceLine, type PriceResult } from './price';
import { areaM2, m2, round100 } from './format';
import { leavesLabel, plural } from './labels';
import type { SceneModel } from './scene-model';

export type TumbaSectionKind = 'drawers' | 'door' | 'open';

export interface TumbaSection {
  kind: TumbaSectionKind;
  /** ящиков в секции */
  drawers: number;
  /** полок за дверью или в открытой нише */
  shelves: number;
}

export interface TumbaParams {
  width: number;
  height: number;
  depth: number;
  sections: TumbaSection[];
  base: DresserBase;
  baseHeight: number;
  body: BodyFinish;
  facade: FacadeFinish;
  backPanel: boolean;
  handles: HandleStyle;
}

export interface TumbaSizePreset {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
  depth: number;
}

export interface TumbaLayoutPreset {
  id: string;
  label: string;
  hint: string;
  base: DresserBase;
  baseHeight: number;
  sections: TumbaSection[];
}

export const TUMBA_LIMITS = {
  width: { min: 400, max: 1200, step: 10 },
  height: { min: 400, max: 800, step: 10 },
  depth: { min: 250, max: 500, step: 10 },
  sections: { min: 1, max: 3 },
  drawers: { min: 1, max: 4 },
  shelves: { min: 0, max: 3 },
  baseHeight: { min: 0, max: 150, step: 10 },
} as const;

export const BASE_LABEL_TUMBA = BASE_LABEL;
export const HANDLE_LABEL_TUMBA = HANDLE_LABEL;

export function createTumbaSection(patch: Partial<TumbaSection> = {}): TumbaSection {
  return { kind: 'drawers', drawers: 2, shelves: 0, ...patch };
}

export const TUMBA_DEFAULT: TumbaParams = {
  width: 800,
  height: 500,
  depth: 400,
  sections: [
    createTumbaSection({ kind: 'drawers', drawers: 2, shelves: 0 }),
    createTumbaSection({ kind: 'door', drawers: 2, shelves: 1 }),
  ],
  base: 'legs',
  baseHeight: 80,
  body: 'white',
  facade: 'same',
  backPanel: true,
  handles: 'bar',
};

export const TUMBA_SIZE_PRESETS: TumbaSizePreset[] = [
  { id: 'classic', label: 'Классическая', hint: '800 × 500 × 400', width: 800, height: 500, depth: 400 },
  { id: 'bedside', label: 'Прикроватная', hint: '450 × 550 × 350', width: 450, height: 550, depth: 350 },
  { id: 'tv', label: 'Под ТВ', hint: '1200 × 600 × 450', width: 1200, height: 600, depth: 450 },
  { id: 'tall', label: 'Высокая', hint: '600 × 800 × 400', width: 600, height: 800, depth: 400 },
];

export const TUMBA_PRESETS: TumbaLayoutPreset[] = [
  {
    id: 'classic',
    label: 'Классическая',
    hint: 'ящики + дверца',
    base: 'legs',
    baseHeight: 80,
    sections: [
      createTumbaSection({ kind: 'drawers', drawers: 2 }),
      createTumbaSection({ kind: 'door', drawers: 2, shelves: 1 }),
    ],
  },
  {
    id: 'bedside',
    label: 'Прикроватная',
    hint: 'три ящика',
    base: 'legs',
    baseHeight: 60,
    sections: [createTumbaSection({ kind: 'drawers', drawers: 3 })],
  },
  {
    id: 'tv',
    label: 'Под ТВ',
    hint: 'ниша + ящики',
    base: 'plinth',
    baseHeight: 80,
    sections: [
      createTumbaSection({ kind: 'open', drawers: 2, shelves: 1 }),
      createTumbaSection({ kind: 'drawers', drawers: 2 }),
    ],
  },
  {
    id: 'tall',
    label: 'Высокая',
    hint: 'дверца + ящики',
    base: 'legs',
    baseHeight: 100,
    sections: [
      createTumbaSection({ kind: 'door', drawers: 2, shelves: 2 }),
      createTumbaSection({ kind: 'drawers', drawers: 3 }),
    ],
  },
];

// ---------- нормализация ----------

export function cloneTumbaParams(p: TumbaParams): TumbaParams {
  return { ...p, sections: p.sections.map((section) => ({ ...section })) };
}

function normalizeTumbaSection(raw: Partial<TumbaSection> | undefined): TumbaSection {
  const input = raw ?? {};
  const kind: TumbaSectionKind =
    input.kind === 'drawers' || input.kind === 'door' || input.kind === 'open' ? input.kind : 'drawers';
  return {
    kind,
    drawers: clamp(Math.round(Number(input.drawers ?? 2)), TUMBA_LIMITS.drawers.min, TUMBA_LIMITS.drawers.max),
    shelves: clamp(Math.round(Number(input.shelves ?? 0)), TUMBA_LIMITS.shelves.min, TUMBA_LIMITS.shelves.max),
  };
}

export function normalizeTumbaParams(input: Partial<TumbaParams> | undefined): TumbaParams {
  const raw: Partial<TumbaParams> = input ?? {};
  const body = (Object.keys(BODY_LABEL) as BodyFinish[]).includes(raw.body as BodyFinish)
    ? (raw.body as BodyFinish)
    : TUMBA_DEFAULT.body;
  const facade = (Object.keys(FACADE_LABEL) as FacadeFinish[]).includes(raw.facade as FacadeFinish)
    ? (raw.facade as FacadeFinish)
    : TUMBA_DEFAULT.facade;
  const base: DresserBase =
    raw.base === 'plinth' || raw.base === 'legs' || raw.base === 'none' ? raw.base : TUMBA_DEFAULT.base;
  const handles: HandleStyle =
    raw.handles === 'bar' || raw.handles === 'knob' || raw.handles === 'profile'
      ? raw.handles
      : TUMBA_DEFAULT.handles;
  const sectionsInput =
    Array.isArray(raw.sections) && raw.sections.length > 0 ? raw.sections : TUMBA_DEFAULT.sections;
  const count = clamp(sectionsInput.length, TUMBA_LIMITS.sections.min, TUMBA_LIMITS.sections.max);
  const sections = Array.from({ length: count }, (_, i) => normalizeTumbaSection(sectionsInput[i]));

  return {
    width: snap(Number(raw.width ?? TUMBA_DEFAULT.width), TUMBA_LIMITS.width.min, TUMBA_LIMITS.width.max, TUMBA_LIMITS.width.step),
    height: snap(Number(raw.height ?? TUMBA_DEFAULT.height), TUMBA_LIMITS.height.min, TUMBA_LIMITS.height.max, TUMBA_LIMITS.height.step),
    depth: snap(Number(raw.depth ?? TUMBA_DEFAULT.depth), TUMBA_LIMITS.depth.min, TUMBA_LIMITS.depth.max, TUMBA_LIMITS.depth.step),
    sections,
    base,
    baseHeight:
      base === 'none'
        ? 0
        : snap(Number(raw.baseHeight ?? TUMBA_DEFAULT.baseHeight), TUMBA_LIMITS.baseHeight.min, TUMBA_LIMITS.baseHeight.max, TUMBA_LIMITS.baseHeight.step),
    body,
    facade,
    backPanel: raw.backPanel !== undefined ? Boolean(raw.backPanel) : TUMBA_DEFAULT.backPanel,
    handles,
  };
}

export function setTumbaSectionCount(p: TumbaParams, count: number): TumbaParams {
  const n = clamp(Math.round(count), TUMBA_LIMITS.sections.min, TUMBA_LIMITS.sections.max);
  const next = cloneTumbaParams(p);
  while (next.sections.length < n) {
    const last = next.sections[next.sections.length - 1] ?? createTumbaSection();
    next.sections.push({ ...last });
  }
  next.sections.length = n;
  return next;
}

export function updateTumbaSection(p: TumbaParams, index: number, patch: Partial<TumbaSection>): TumbaParams {
  const next = cloneTumbaParams(p);
  const current = next.sections[index];
  if (!current) return next;
  next.sections[index] = normalizeTumbaSection({ ...current, ...patch });
  return next;
}

// ---------- совместимость с геометрией комода ----------

function toDresserParams(p: TumbaParams): DresserParams {
  return {
    ...p,
    sections: p.sections.map((section): DresserSection => ({
      kind: section.kind,
      drawers: section.drawers,
      shelves: section.shelves,
    })),
  };
}

export function buildTumbaLayout(p: TumbaParams): DresserLayout {
  return buildDresserLayout(toDresserParams(p));
}

export function buildTumbaParts(p: TumbaParams, layout: DresserLayout): ReturnType<typeof buildDresserParts> {
  return buildDresserParts(toDresserParams(p), layout);
}

export function tumbaScene(p: TumbaParams, layout: DresserLayout): SceneModel {
  return dresserScene(toDresserParams(p), layout);
}

export function tumbaSummary(p: TumbaParams, layout: DresserLayout): string {
  const sections = p.sections.length;
  return `${sections} ${plural(sections, 'секция', 'секции', 'секций')} · ${totalDresserDrawers(toDresserParams(p))} ${plural(totalDresserDrawers(toDresserParams(p)), 'ящик', 'ящика', 'ящиков')} · ${totalDresserDoors(layout)} ${plural(totalDresserDoors(layout), 'дверь', 'двери', 'дверей')}`;
}

export { sectionSummary };

// ---------- цена ----------

const BODY_RATE = 2600; // ₽/м² ЛДСП корпуса
const BACK_RATE = 450; // ₽/м² ДВП
const FRONT_RATE = 5200; // ₽/м² фасад ящика/двери
const DRAWER = 1700; // направляющие + сборка ящика
const HINGE = 600; // петли на створку
const HANDLE = 350; // ручка
const LEG = 400; // ножка
const PLINTH = 900; // цоколь
const ASSEMBLY_RATE = 0.12;
const ASSEMBLY_MIN = 3500;
const DELIVERY = 3500;

export function calcTumbaPrice(params: TumbaParams, layout: DresserLayout): PriceResult {
  const W = layout.width;
  const H = layout.height;
  const D = layout.depth;
  const plinthH = layout.baseH;

  const sideArea = 2 * (H - plinthH) * D;
  const bottomTopArea = 2 * (W - 2 * PANEL) * (D - layout.inner.z0);
  const dividerArea = (layout.sections.length - 1) * (layout.inner.y1 - layout.inner.y0) * (D - layout.inner.z0);
  const shelfArea = layout.sections.reduce(
    (sum, section) => sum + section.shelvesY.length * section.width * layout.shelfDepth,
    0,
  );
  const bodyArea = m2((sideArea + bottomTopArea + dividerArea + shelfArea) / 1_000_000);
  const backArea = params.backPanel
    ? m2(((W - 2 * PANEL) * (layout.inner.y1 - layout.inner.y0)) / 1_000_000)
    : 0;
  const facadeArea = m2(
    [...layout.drawerFronts, ...layout.doors].reduce((sum, rect) => sum + (rect.x1 - rect.x0) * (rect.y1 - rect.y0), 0) /
      1_000_000,
  );

  const drawers = layout.drawerFronts.length;
  const doorLeaves = layout.doors.length;
  const handles = drawers + doorLeaves;

  const lines: PriceLine[] = [];
  lines.push({
    key: 'body',
    label: 'Корпус и полки, ЛДСП 16 мм',
    detail: `${areaM2(bodyArea)} · ${BODY_RATE} ₽/м²`,
    amount: Math.round(bodyArea * BODY_RATE),
  });
  if (backArea > 0) {
    lines.push({
      key: 'back',
      label: 'Задняя стенка, ДВП',
      detail: `${areaM2(backArea)} · ${BACK_RATE} ₽/м²`,
      amount: Math.round(backArea * BACK_RATE),
    });
  }
  if (params.base === 'plinth' && plinthH > 0) {
    lines.push({ key: 'plinth', label: 'Цоколь', detail: `${plinthH} мм`, amount: PLINTH });
  }
  if (params.base === 'legs' && plinthH > 0) {
    lines.push({ key: 'legs', label: `Ножки, ${plinthH} мм`, detail: '4 шт.', amount: 4 * LEG });
  }
  if (facadeArea > 0) {
    const rate = Math.round(FRONT_RATE * facadeMultiplier(params.facade));
    lines.push({
      key: 'facade',
      label: `Фасады: двери и ящики, ${FACADE_LABEL[params.facade].toLowerCase()}`,
      detail: `${areaM2(facadeArea)} · ${rate} ₽/м²`,
      amount: Math.round(facadeArea * rate),
    });
  }
  if (drawers > 0) {
    lines.push({
      key: 'drawers',
      label: 'Ящики с направляющими',
      detail: `${drawers} шт.`,
      amount: drawers * DRAWER,
    });
  }
  if (doorLeaves > 0) {
    lines.push({
      key: 'hinges',
      label: 'Петли и доводчики',
      detail: leavesLabel(doorLeaves),
      amount: doorLeaves * HINGE,
    });
  }
  lines.push({
    key: 'handles',
    label: `Ручки: ${HANDLE_LABEL[params.handles].toLowerCase()}`,
    detail: `${handles} шт.`,
    amount: handles * HANDLE,
  });

  const goods = lines.reduce((sum, line) => sum + line.amount, 0);
  const assembly = Math.max(ASSEMBLY_MIN, round100(goods * ASSEMBLY_RATE));
  const total = round100(goods + assembly + DELIVERY);
  return { lines, goods, assembly, delivery: DELIVERY, total, bodyArea, facadeArea };
}

export const TUMBA_RATES = {
  BODY_RATE,
  BACK_RATE,
  FRONT_RATE,
  DRAWER,
  HINGE,
  HANDLE,
  LEG,
  PLINTH,
  ASSEMBLY_RATE,
  ASSEMBLY_MIN,
  DELIVERY,
} as const;
