/**
 * Комод: параметры, геометрия и цена.
 *
 * Как и у шкафа, изделие набирается из секций (1–6). У каждой секции своё
 * наполнение: ящики, дверь с полками, ящики + дверь, открытая ниша.
 * Все размеры в миллиметрах, координаты — как у шкафа:
 *   x: 0 — центр, +x вправо; y: 0 — пол, +y вверх; z: 0 — задняя плоскость.
 */
import {
  BACK,
  BODY_LABEL,
  BodyFinish,
  FACADE_LABEL,
  FacadeFinish,
  PANEL,
  clamp,
  snap,
} from './model';
import { facadeMultiplier, type PriceLine, type PriceResult } from './price';
import { drawerBoxParts, type Part } from './parts';
import { facadeMaterialKey } from './materials';
import { shelfPositions } from './geometry';
import { drawersLabel, doorsLabel, leavesLabel, plural, shelvesLabel } from './labels';
import { areaM2, m2, round100 } from './format';
import type { SceneModel } from './scene-model';

const FRONT_T = 18; // толщина фасада ящика/двери
const FRONT_GAP = 4; // зазор между фасадами
const DOOR_T = 18; // толщина двери
const LEG_SIZE = 40; // сечение ножки
const PLINTH_D = 40; // глубина цоколя
const PLINTH_RECESS = 50; // утопление цоколя от фасада
const DRAWER_PITCH = 190; // высота ящика по умолчанию, мм
const DOOR_MAX_LEAF = 620; // максимальная ширина створки двери

export type DresserBase = 'plinth' | 'legs' | 'none';
export type HandleStyle = 'bar' | 'knob' | 'profile';
export type SectionKind = 'drawers' | 'door' | 'doorDrawers' | 'open';

export interface DresserSection {
  kind: SectionKind;
  /** ящиков в секции (для drawers / doorDrawers) */
  drawers: number;
  /** полок за дверью или в открытой нише */
  shelves: number;
}

export interface DresserParams {
  width: number;
  height: number;
  depth: number;
  /** секции слева направо */
  sections: DresserSection[];
  base: DresserBase;
  /** высота ножек/цоколя, мм */
  baseHeight: number;
  body: BodyFinish;
  facade: FacadeFinish;
  backPanel: boolean;
  handles: HandleStyle;
}

export const DRESSER_LIMITS = {
  width: { min: 500, max: 2400, step: 10 },
  height: { min: 500, max: 1500, step: 10 },
  depth: { min: 300, max: 700, step: 10 },
  sections: { min: 1, max: 6 },
  drawers: { min: 1, max: 6 },
  shelves: { min: 0, max: 4 },
  baseHeight: { min: 0, max: 200, step: 10 },
  widthStep: 50,
  heightStep: 50,
  depthStep: 50,
  baseStep: 10,
} as const;

export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  drawers: 'Ящики',
  door: 'Дверь + полки',
  doorDrawers: 'Дверь + ящики',
  open: 'Открытая ниша',
};

export const SECTION_KIND_HINT: Record<SectionKind, string> = {
  drawers: 'секция целиком из ящиков',
  door: 'распашная дверь, внутри полки',
  doorDrawers: 'ящики снизу, дверь сверху',
  open: 'полки без двери — витрина или ниша',
};

export function createDresserSection(patch: Partial<DresserSection> = {}): DresserSection {
  return { kind: 'drawers', drawers: 3, shelves: 2, ...patch };
}

export const DRESSER_DEFAULT: DresserParams = {
  width: 1200,
  height: 800,
  depth: 450,
  sections: [
    createDresserSection({ kind: 'door', shelves: 3 }),
    createDresserSection({ kind: 'drawers', drawers: 3 }),
    createDresserSection({ kind: 'doorDrawers', drawers: 2, shelves: 2 }),
  ],
  base: 'legs',
  baseHeight: 120,
  body: 'white',
  facade: 'same',
  backPanel: true,
  handles: 'bar',
};

export const BASE_LABEL: Record<DresserBase, string> = {
  plinth: 'Цоколь',
  legs: 'Ножки',
  none: 'Без основания',
};

export const HANDLE_LABEL: Record<HandleStyle, string> = {
  bar: 'Рейлинг',
  knob: 'Кнопка',
  profile: 'Профиль-ручка',
};

// ---------- пресеты ----------

export interface DresserPreset {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
  depth: number;
  base: DresserBase;
  baseHeight: number;
  sections: DresserSection[];
}

const preset = (
  id: string,
  label: string,
  hint: string,
  size: [number, number, number],
  base: DresserBase,
  baseHeight: number,
  sections: DresserSection[],
): DresserPreset => ({
  id,
  label,
  hint,
  width: size[0],
  height: size[1],
  depth: size[2],
  base,
  baseHeight,
  sections,
});

export const DRESSER_PRESETS: DresserPreset[] = [
  preset('classic', 'Классический', '3 секции ящиков', [1200, 800, 450], 'legs', 120, [
    createDresserSection({ kind: 'drawers', drawers: 3 }),
    createDresserSection({ kind: 'drawers', drawers: 3 }),
    createDresserSection({ kind: 'drawers', drawers: 3 }),
  ]),
  preset('doors', 'С дверцами', 'дверь / ящики / дверь', [1400, 800, 450], 'plinth', 100, [
    createDresserSection({ kind: 'door', shelves: 3 }),
    createDresserSection({ kind: 'drawers', drawers: 3 }),
    createDresserSection({ kind: 'door', shelves: 3 }),
  ]),
  preset('hallway', 'Прихожая', 'неглубокий, ящики и двери', [1000, 900, 350], 'plinth', 80, [
    createDresserSection({ kind: 'drawers', drawers: 2 }),
    createDresserSection({ kind: 'doorDrawers', drawers: 2, shelves: 2 }),
    createDresserSection({ kind: 'drawers', drawers: 2 }),
  ]),
  preset('tv', 'ТВ-тумба', 'ниша по центру', [1600, 600, 450], 'legs', 80, [
    createDresserSection({ kind: 'open', shelves: 2 }),
    createDresserSection({ kind: 'drawers', drawers: 2 }),
    createDresserSection({ kind: 'open', shelves: 2 }),
  ]),
  preset('tall', 'Высокий', 'двери и ящики до 1200', [1200, 1200, 450], 'legs', 120, [
    createDresserSection({ kind: 'doorDrawers', drawers: 3, shelves: 2 }),
    createDresserSection({ kind: 'doorDrawers', drawers: 3, shelves: 2 }),
    createDresserSection({ kind: 'door', shelves: 4 }),
  ]),
  preset('wardrobe', 'Гардеробный', 'полки и ящики', [1200, 1400, 500], 'legs', 100, [
    createDresserSection({ kind: 'door', shelves: 1 }),
    createDresserSection({ kind: 'drawers', drawers: 4 }),
    createDresserSection({ kind: 'door', shelves: 1 }),
  ]),
];

// ---------- нормализация ----------

export function cloneDresserParams(p: DresserParams): DresserParams {
  return { ...p, sections: p.sections.map((section) => ({ ...section })) };
}

function normalizeSection(raw: Partial<DresserSection> | undefined): DresserSection {
  const input = raw ?? {};
  const kind: SectionKind =
    input.kind === 'door' || input.kind === 'doorDrawers' || input.kind === 'open' || input.kind === 'drawers'
      ? input.kind
      : 'drawers';
  return {
    kind,
    drawers: clamp(Math.round(Number(input.drawers ?? 3)), DRESSER_LIMITS.drawers.min, DRESSER_LIMITS.drawers.max),
    shelves: clamp(Math.round(Number(input.shelves ?? 0)), DRESSER_LIMITS.shelves.min, DRESSER_LIMITS.shelves.max),
  };
}

export function normalizeDresserParams(input: Partial<DresserParams> | undefined): DresserParams {
  const raw: Partial<DresserParams> = input ?? {};
  const body = (Object.keys(BODY_LABEL) as BodyFinish[]).includes(raw.body as BodyFinish)
    ? (raw.body as BodyFinish)
    : DRESSER_DEFAULT.body;
  const facade = (Object.keys(FACADE_LABEL) as FacadeFinish[]).includes(raw.facade as FacadeFinish)
    ? (raw.facade as FacadeFinish)
    : DRESSER_DEFAULT.facade;
  const base: DresserBase =
    raw.base === 'plinth' || raw.base === 'legs' || raw.base === 'none' ? raw.base : DRESSER_DEFAULT.base;
  const handles: HandleStyle =
    raw.handles === 'bar' || raw.handles === 'knob' || raw.handles === 'profile'
      ? raw.handles
      : DRESSER_DEFAULT.handles;

  const sectionsInput =
    Array.isArray(raw.sections) && raw.sections.length > 0 ? raw.sections : DRESSER_DEFAULT.sections;
  const count = clamp(sectionsInput.length, DRESSER_LIMITS.sections.min, DRESSER_LIMITS.sections.max);
  const height = snap(Number(raw.height ?? DRESSER_DEFAULT.height), DRESSER_LIMITS.height.min, DRESSER_LIMITS.height.max, DRESSER_LIMITS.height.step);
  const baseHeight =
    base === 'none'
      ? 0
      : snap(Number(raw.baseHeight ?? DRESSER_DEFAULT.baseHeight), DRESSER_LIMITS.baseHeight.min, DRESSER_LIMITS.baseHeight.max, DRESSER_LIMITS.baseHeight.step);
  const maxDD = maxDoorDrawers({ height, base, baseHeight });
  const sections = Array.from({ length: count }, (_, i) => {
    const section = normalizeSection(sectionsInput[i]);
    // в секции «дверь + ящики» ящиков не может быть больше, чем помещается
    return section.kind === 'doorDrawers'
      ? { ...section, drawers: Math.min(section.drawers, maxDD) }
      : section;
  });

  return {
    width: snap(Number(raw.width ?? DRESSER_DEFAULT.width), DRESSER_LIMITS.width.min, DRESSER_LIMITS.width.max, DRESSER_LIMITS.width.step),
    height,
    depth: snap(Number(raw.depth ?? DRESSER_DEFAULT.depth), DRESSER_LIMITS.depth.min, DRESSER_LIMITS.depth.max, DRESSER_LIMITS.depth.step),
    sections,
    base,
    baseHeight,
    body,
    facade,
    backPanel: raw.backPanel !== undefined ? Boolean(raw.backPanel) : DRESSER_DEFAULT.backPanel,
    handles,
  };
}

// ---------- операции над секциями ----------

export function setDresserSectionCount(p: DresserParams, count: number): DresserParams {
  const n = clamp(Math.round(count), DRESSER_LIMITS.sections.min, DRESSER_LIMITS.sections.max);
  const next = cloneDresserParams(p);
  while (next.sections.length < n) {
    const last = next.sections[next.sections.length - 1] ?? createDresserSection();
    next.sections.push({ ...last });
  }
  next.sections.length = n;
  return next;
}

export function updateDresserSection(
  p: DresserParams,
  index: number,
  patch: Partial<DresserSection>,
): DresserParams {
  const next = cloneDresserParams(p);
  const current = next.sections[index];
  if (!current) return next;
  const patched = normalizeSection({ ...current, ...patch });
  next.sections[index] =
    patched.kind === 'doorDrawers'
      ? { ...patched, drawers: Math.min(patched.drawers, maxDoorDrawers(p)) }
      : patched;
  return next;
}

export function totalDresserDrawers(p: DresserParams): number {
  return p.sections.reduce(
    (sum, section) => sum + (section.kind === 'drawers' || section.kind === 'doorDrawers' ? section.drawers : 0),
    0,
  );
}

/** Сколько ящиков реально помещается снизу в секции «дверь + ящики». */
export function maxDoorDrawers(p: Pick<DresserParams, 'height' | 'base' | 'baseHeight'>): number {
  const baseH = p.base === 'none' ? 0 : Math.min(p.baseHeight, Math.max(0, p.height - 300));
  const innerHeight = Math.max(0, p.height - baseH - 2 * PANEL);
  return Math.max(1, Math.min(DRESSER_LIMITS.drawers.max, Math.floor((innerHeight * 0.6) / DRAWER_PITCH)));
}

export function totalDresserDoors(layout: DresserLayout): number {
  // считаем именно полотна: широкая секция делится на две двери
  return layout.doors.length;
}

export function dresserSummary(p: DresserParams, layout: DresserLayout): string {
  const sections = p.sections.length;
  return `${sections} ${plural(sections, 'секция', 'секции', 'секций')} · ${drawersLabel(totalDresserDrawers(p))} · ${doorsLabel(totalDresserDoors(layout))}`;
}

/** Подпись секции для панели и заявки; doorLeaves — число полотен. */
export function sectionSummary(section: DresserSection, doorLeaves = 1): string {
  switch (section.kind) {
    case 'drawers':
      return drawersLabel(section.drawers);
    case 'door':
      return `${doorsLabel(doorLeaves)}, ${shelvesLabel(section.shelves)}`;
    case 'doorDrawers':
      return `${drawersLabel(section.drawers)} + ${doorsLabel(doorLeaves)}${section.shelves > 0 ? `, ${shelvesLabel(section.shelves)}` : ''}`;
    case 'open':
      return `ниша, ${shelvesLabel(section.shelves)}`;
    default:
      return '';
  }
}

// ---------- геометрия ----------

export interface DresserDrawerRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DresserDoorRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DresserSectionLayout {
  index: number;
  kind: SectionKind;
  x0: number;
  x1: number;
  width: number;
  /** фасады ящиков */
  drawers: DresserDrawerRect[];
  /** створки дверей */
  doors: DresserDoorRect[];
  /** центры полок, мм от пола */
  shelvesY: number[];
  /** верх зоны ящиков */
  drawerZoneTop: number;
}

export interface DresserLayout {
  params: DresserParams;
  width: number;
  height: number;
  depth: number;
  baseH: number;
  carcass: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  inner: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  sections: DresserSectionLayout[];
  sectionWidth: number;
  shelfDepth: number;
  shelfZ: number;
  doors: DresserDoorRect[];
  drawerFronts: DresserDrawerRect[];
}

function doorRects(x0: number, x1: number, y0: number, y1: number): DresserDoorRect[] {
  const width = x1 - x0;
  const leaves = width > DOOR_MAX_LEAF ? 2 : 1;
  const leafWidth = width / leaves;
  const rects: DresserDoorRect[] = [];
  for (let i = 0; i < leaves; i += 1) {
    rects.push({
      x0: x0 + i * leafWidth,
      x1: x0 + (i + 1) * leafWidth,
      y0,
      y1,
    });
  }
  return rects;
}

export function buildDresserLayout(params: DresserParams): DresserLayout {
  const W = params.width;
  const H = params.height;
  const D = params.depth;
  const baseH = params.base === 'none' ? 0 : Math.min(params.baseHeight, Math.max(0, H - 300));

  const carcass = { x0: -W / 2, x1: W / 2, y0: baseH, y1: H, z0: 0, z1: D };
  const inner = {
    x0: -W / 2 + PANEL,
    x1: W / 2 - PANEL,
    y0: baseH + PANEL,
    y1: H - PANEL,
    z0: params.backPanel ? BACK : 0,
    z1: D,
  };

  const n = params.sections.length;
  const usable = inner.x1 - inner.x0;
  const sectionWidth = (usable - (n - 1) * PANEL) / n;
  const innerHeight = inner.y1 - inner.y0;

  const sections: DresserSectionLayout[] = params.sections.map((section, i) => {
    const x0 = inner.x0 + i * (sectionWidth + PANEL);
    const x1 = x0 + sectionWidth;

    const layout: DresserSectionLayout = {
      index: i,
      kind: section.kind,
      x0,
      x1,
      width: sectionWidth,
      drawers: [],
      doors: [],
      shelvesY: [],
      drawerZoneTop: inner.y0,
    };

    const addDrawers = (count: number, top: number): void => {
      const safeCount = clamp(Math.round(count), DRESSER_LIMITS.drawers.min, DRESSER_LIMITS.drawers.max);
      const pitch = (top - inner.y0) / safeCount;
      for (let k = 0; k < safeCount; k += 1) {
        layout.drawers.push({
          x0: x0 + FRONT_GAP / 2,
          x1: x1 - FRONT_GAP / 2,
          y0: inner.y0 + k * pitch + FRONT_GAP / 2,
          y1: inner.y0 + (k + 1) * pitch - FRONT_GAP / 2,
        });
      }
      layout.drawerZoneTop = top;
    };

    if (section.kind === 'drawers') {
      addDrawers(section.drawers, inner.y1);
    } else if (section.kind === 'door') {
      layout.doors = doorRects(x0, x1, inner.y0, inner.y1);
      layout.shelvesY = shelfPositions(inner.y0, inner.y1, section.shelves);
    } else if (section.kind === 'doorDrawers') {
      // ящики снизу, но не выше 60% внутренней высоты
      const maxDrawers = Math.max(1, Math.min(section.drawers, Math.floor((innerHeight * 0.6) / DRAWER_PITCH)));
      const zoneHeight = Math.min(maxDrawers * DRAWER_PITCH, innerHeight - 260);
      const zoneTop = inner.y0 + Math.max(120, zoneHeight);
      addDrawers(maxDrawers, zoneTop);
      layout.doors = doorRects(x0, x1, zoneTop + 2, inner.y1);
      layout.shelvesY = shelfPositions(zoneTop, inner.y1, section.shelves);
    } else {
      layout.shelvesY = shelfPositions(inner.y0, inner.y1, section.shelves);
    }

    return layout;
  });

  const shelfDepth = Math.max(80, D - inner.z0 - 10);

  return {
    params,
    width: W,
    height: H,
    depth: D,
    baseH,
    carcass,
    inner,
    sections,
    sectionWidth,
    shelfDepth,
    shelfZ: inner.z0 + shelfDepth / 2,
    doors: sections.flatMap((section) => section.doors),
    drawerFronts: sections.flatMap((section) => section.drawers),
  };
}

export function buildDresserParts(params: DresserParams, layout: DresserLayout): Part[] {
  const parts: Part[] = [];
  const push = (p: Omit<Part, 'id'>): void => {
    parts.push({ ...p, id: `${p.role}-${parts.length}` });
  };

  const W = layout.width;
  const D = layout.depth;
  const { inner, carcass } = layout;
  const interiorDepth = inner.z1 - inner.z0;
  const interiorZ = inner.z0 + interiorDepth / 2;
  const carcassH = carcass.y1 - carcass.y0;
  const carcassY = (carcass.y0 + carcass.y1) / 2;

  // ---------- корпус ----------
  for (const side of [-1, 1]) {
    push({
      role: 'side',
      label: 'Боковина',
      w: PANEL,
      h: carcassH,
      d: D,
      x: side * (W / 2 - PANEL / 2),
      y: carcassY,
      z: D / 2,
      material: 'body',
    });
  }

  push({
    role: 'bottom',
    label: 'Дно',
    w: W - 2 * PANEL,
    h: PANEL,
    d: interiorDepth,
    x: 0,
    y: carcass.y0 + PANEL / 2,
    z: interiorZ,
    material: 'body',
  });

  push({
    role: 'top',
    label: 'Крышка',
    w: W - 2 * PANEL,
    h: PANEL,
    d: interiorDepth,
    x: 0,
    y: carcass.y1 - PANEL / 2,
    z: interiorZ,
    material: 'body',
  });

  for (let i = 1; i < layout.sections.length; i += 1) {
    const xCenter = inner.x0 + i * layout.sectionWidth + (i - 1) * PANEL + PANEL / 2;
    push({
      role: 'divider',
      label: 'Перегородка',
      w: PANEL,
      h: inner.y1 - inner.y0,
      d: interiorDepth,
      x: xCenter,
      y: (inner.y0 + inner.y1) / 2,
      z: interiorZ,
      material: 'body',
    });
  }

  if (params.backPanel) {
    push({
      role: 'back',
      label: 'Задняя стенка',
      w: W - 2 * PANEL,
      h: inner.y1 - inner.y0,
      d: BACK,
      x: 0,
      y: (inner.y0 + inner.y1) / 2,
      z: BACK / 2,
      material: 'back',
    });
  }

  // ---------- основание ----------
  if (params.base === 'plinth' && layout.baseH > 0) {
    push({
      role: 'plinth',
      label: 'Цоколь',
      w: W - 2 * PANEL,
      h: layout.baseH,
      d: PLINTH_D,
      x: 0,
      y: layout.baseH / 2,
      z: D - PLINTH_RECESS - PLINTH_D / 2,
      material: 'plinth',
    });

    // Цоколь идёт по переднему краю и по бокам; сзади его нет — комод
    // придвигается к стене. Боковые планки стоят под боковинами.
    const sideDepth = D - PLINTH_RECESS;
    for (const sx of [-1, 1]) {
      push({
        role: 'plinth',
        label: 'Цоколь боковой',
        w: PANEL,
        h: layout.baseH,
        d: sideDepth,
        x: sx * (W / 2 - PANEL / 2),
        y: layout.baseH / 2,
        z: sideDepth / 2,
        material: 'plinth',
      });
    }
  } else if (params.base === 'legs' && layout.baseH > 0) {
    const inset = 34;
    const legY = layout.baseH / 2;
    for (const sx of [-1, 1]) {
      for (const z of [inset + LEG_SIZE / 2, D - inset - LEG_SIZE / 2]) {
        push({
          role: 'leg',
          label: 'Ножка',
          w: LEG_SIZE,
          h: layout.baseH,
          d: LEG_SIZE,
          x: sx * (W / 2 - inset - LEG_SIZE / 2),
          y: legY,
          z,
          material: 'plinth',
        });
      }
    }
  }

  const facadeMaterial: Part['material'] = facadeMaterialKey(params.facade);

  // ---------- наполнение секций ----------
  for (const section of layout.sections) {
    const xCenter = (section.x0 + section.x1) / 2;

    for (let drawerIndex = 0; drawerIndex < section.drawers.length; drawerIndex += 1) {
      const drawer = section.drawers[drawerIndex];
      const frontW = drawer.x1 - drawer.x0;
      const frontH = drawer.y1 - drawer.y0;
      const group = `drawer-${section.index}-${drawerIndex}`;
      const centerX = (drawer.x0 + drawer.x1) / 2;
      const centerY = (drawer.y0 + drawer.y1) / 2;
      push({
        role: 'drawerFront',
        label: 'Фасад ящика',
        w: frontW,
        h: frontH,
        d: FRONT_T,
        x: centerX,
        y: centerY,
        z: D - FRONT_T / 2,
        // ящик внутри — корпусный материал: он виден через стеклянные двери
        material: 'body',
        group,
      });

      // Корпус ящика: полое отделение с дном — видно, когда ящик выдвинут.
      for (const boxPart of drawerBoxParts({
        x: centerX,
        y: centerY,
        z: D - FRONT_T / 2,
        frontT: FRONT_T,
        frontW,
        frontH,
        backZ: inner.z0,
        group,
        maxDepth: 450,
      })) {
        push(boxPart);
      }

      if (params.handles === 'bar') {
        push({
          role: 'drawerHandle',
          label: 'Ручка-рейлинг',
          w: Math.min(220, Math.max(120, frontW * 0.5)),
          h: 14,
          d: 14,
          x: (drawer.x0 + drawer.x1) / 2,
          y: (drawer.y0 + drawer.y1) / 2,
          z: D + 8,
          material: 'metal',
          group,
        });
      } else if (params.handles === 'knob') {
        push({
          role: 'drawerHandle',
          label: 'Ручка-кнопка',
          w: 22,
          h: 22,
          d: 18,
          x: (drawer.x0 + drawer.x1) / 2,
          y: (drawer.y0 + drawer.y1) / 2,
          z: D + 9,
          material: 'metal',
          group,
        });
      } else {
        push({
          role: 'drawerHandle',
          label: 'Профиль-ручка',
          w: Math.max(80, frontW - 40),
          h: Math.min(10, frontH * 0.12),
          d: 12,
          x: (drawer.x0 + drawer.x1) / 2,
          y: (drawer.y0 + drawer.y1) / 2,
          z: D + 6,
          material: 'metal',
          group,
        });
      }
    }

    for (let doorIndex = 0; doorIndex < section.doors.length; doorIndex += 1) {
      const door = section.doors[doorIndex];
      const doorW = door.x1 - door.x0;
      const leafX0 = door.x0 + FRONT_GAP / 2;
      const leafX1 = door.x1 - FRONT_GAP / 2;
      const leafY0 = door.y0 + FRONT_GAP / 2;
      const leafY1 = door.y1 - FRONT_GAP / 2;
      // Петли — на стенках секции: левое полотно на левой, правое — на правой.
      const doorHinge: 'left' | 'right' = doorIndex === 0 ? 'left' : 'right';
      const doorGroup = `door-${section.index}-${doorIndex}`;
      push({
        role: 'doorLeaf',
        label: 'Дверь',
        w: Math.max(60, doorW - FRONT_GAP),
        h: Math.max(60, door.y1 - door.y0 - FRONT_GAP),
        d: DOOR_T,
        x: (door.x0 + door.x1) / 2,
        y: (door.y0 + door.y1) / 2,
        z: D - DOOR_T / 2,
        material: facadeMaterial,
        group: doorGroup,
        doorHinge,
      });

      // Стекло и зеркало почти невидимы без рамки — добавляем алюминиевый
      // профиль по периметру створки: сразу читается, что это дверь.
      if (params.facade === 'glass' || params.facade === 'mirror') {
        const frameW = 18;
        const frameT = 9;
        const frameZ = D + frameT / 2;
        const leafW = leafX1 - leafX0;
        const leafH = leafY1 - leafY0;
        const bars: Array<[number, number, number, number]> = [
          [frameW, leafH, leafX0 + frameW / 2, (leafY0 + leafY1) / 2],
          [frameW, leafH, leafX1 - frameW / 2, (leafY0 + leafY1) / 2],
          [leafW, frameW, (leafX0 + leafX1) / 2, leafY0 + frameW / 2],
          [leafW, frameW, (leafX0 + leafX1) / 2, leafY1 - frameW / 2],
        ];
        for (const [barW, barH, barX, barY] of bars) {
          push({
            role: 'doorFrame',
            label: 'Профиль двери',
            w: barW,
            h: barH,
            d: frameT,
            x: barX,
            y: barY,
            z: frameZ,
            material: 'metal',
            group: doorGroup,
            doorHinge,
          });
        }
      }

      // Ручка ставится с противоположной от петли стороны, у центрального стыка.
      push({
        role: 'handle',
        label: 'Ручка двери',
        w: 14,
        h: 180,
        d: 14,
        x: doorHinge === 'left' ? door.x1 - 45 : door.x0 + 45,
        y: (door.y0 + door.y1) / 2,
        z: D + 8,
        material: 'metal',
        group: doorGroup,
        doorHinge,
      });
    }

    for (const shelfY of section.shelvesY) {
      push({
        role: 'shelf',
        label: 'Полка',
        w: section.width,
        h: PANEL,
        d: layout.shelfDepth,
        x: xCenter,
        y: shelfY,
        z: layout.shelfZ,
        material: 'body',
      });
    }
  }

  return parts;
}

export function dresserScene(params: DresserParams, layout: DresserLayout): SceneModel {
  return {
    width: params.width,
    height: params.height,
    depth: params.depth,
    parts: buildDresserParts(params, layout),
    doors: [],
    doorsKind: 'none',
    lighting: false,
    body: params.body,
    facade: params.facade,
  };
}

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
const ASSEMBLY_MIN = 4500;
const DELIVERY = 3500;

export function calcDresserPrice(params: DresserParams, layout: DresserLayout): PriceResult {
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

export const DRESSER_RATES = {
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
