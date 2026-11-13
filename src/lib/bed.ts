/**
 * Кровать с ящиками — четвёртое изделие конструктора «Василиса».
 *
 * Конструктив повторяет логику комода и тумбы (корпус из ЛДСП, ящики,
 * основание, задняя стенка ДВП), но у кровати свой набор параметров:
 * спальное место (ширина × длина), высота каркаса, изголовье, декор
 * столешницы и фасады ящиков с вырезом-ручкой.
 *
 * Все размеры в миллиметрах, координаты — как у остальных изделий:
 *   x: 0 — центр, +x вправо; y: 0 — пол, +y вверх; z: 0 — задняя плоскость
 *   (изголовье), +z — к изножью.
 *
 * Геометрия кровати — единственный источник правды: из неё считаются детали
 * для 3D и спецификации, цена и текст заявки.
 */
import {
  BACK,
  BODY_LABEL,
  PANEL,
  clamp,
  snap,
  type BodyFinish,
} from './model';
import type { DresserBase } from './dresser';
import { drawerBoxParts, type Part } from './parts';
import type { PriceLine, PriceResult } from './price';
import { areaM2, m2, round100 } from './format';
import { drawersLabel, plural } from './labels';
import type { SceneModel } from './scene-model';

// ---------- Конструктив ----------

/** Толщина фасада ящика, мм. */
export const BED_FRONT_T = 18;
/** Зазор между фасадами ящиков, мм. */
export const BED_FRONT_GAP = 4;
/** Толщина панели изголовья (задняя и боковина), мм. */
export const BED_BACKBOARD_T = 40;
/** Толщина столешницы кровати, мм: на фото это массивная дубовая плита. */
export const BED_DECK_T = 40;
/** Сечение ножки, мм. */
const LEG_SIZE = 40;
/** Смещение ножек от угла, мм. */
const LEG_INSET = 34;
/** Глубина и утопление цоколя, мм. */
const PLINTH_D = 40;
const PLINTH_RECESS = 50;
/** Максимальная глубина корпуса ящика, мм. */
const DRAWER_MAX_DEPTH = 450;

// ---------- Типы ----------

export type BedBase = DresserBase;
export type BedSide = 'left' | 'right';
/** Тип изголовья: без, прямая спинка, угловая (спинка + боковина), «волна». */
export type BedHeadboard = 'none' | 'straight' | 'corner' | 'wave';
/** Ручки кровати: главный вариант — вырез в фасаде, как на фото. */
export type BedHandleStyle = 'cutout' | 'bar' | 'knob' | 'profile';

export interface BedParams {
  /** ширина спального места по внешним габаритам, мм */
  width: number;
  /** длина спального места по внешним габаритам, мм */
  length: number;
  /** высота каркаса от пола до столешницы, мм */
  height: number;
  /** тип изголовья */
  headboard: BedHeadboard;
  /** сторона углового изголовья и волны */
  headboardSide: BedSide;
  /** высота изголовья над столешницей, мм */
  headboardHeight: number;
  /** число фасадов ящиков в ряд по фронту */
  drawers: number;
  base: BedBase;
  baseHeight: number;
  body: BodyFinish;
  /** декор столешницы и изголовья */
  deck: BodyFinish;
  backPanel: boolean;
  handles: BedHandleStyle;
}

export const BED_LIMITS = {
  width: { min: 700, max: 2000, step: 10 },
  length: { min: 1600, max: 2100, step: 10 },
  height: { min: 350, max: 650, step: 10 },
  headboardHeight: { min: 80, max: 700, step: 10 },
  drawers: { min: 1, max: 4 },
  baseHeight: { min: 0, max: 150, step: 10 },
  widthStep: 50,
  lengthStep: 50,
  heightStep: 50,
  baseStep: 10,
} as const;

export const BED_HEADBOARD_LABEL: Record<BedHeadboard, string> = {
  none: 'Без изголовья',
  straight: 'Прямая спинка',
  corner: 'Угловая спинка',
  wave: 'Угловая «волна»',
};

export const BED_HEADBOARD_HINT: Record<BedHeadboard, string> = {
  none: 'кровать-подиум: ровная столешница без спинки',
  straight: 'панель по задней стороне — у стены или в нише',
  corner: 'спинка + боковина буквой Г — кровать в угол',
  wave: 'угловая спинка с плавным спуском к столешнице, как на фото',
};

export const BED_SIDE_LABEL: Record<BedSide, string> = {
  left: 'Слева',
  right: 'Справа',
};

export const BED_SIDE_SHORT: Record<BedSide, string> = {
  left: 'слева',
  right: 'справа',
};

export const BED_HANDLE_LABEL: Record<BedHandleStyle, string> = {
  cutout: 'Вырез в фасаде',
  bar: 'Рейлинг',
  knob: 'Кнопка',
  profile: 'Профиль-ручка',
};

export const BED_HANDLE_HINT: Record<BedHandleStyle, string> = {
  cutout: 'фрезерованный вырез в фасаде — без выступающей фурнитуры',
  bar: 'рейлинг по центру ящика — привычно и заметно',
  knob: 'кнопка по центру — для узких фасадов',
  profile: 'профиль по ширине фасада — минимализм, не выступает',
};

// ---------- Значения по умолчанию и пресеты ----------

export const BED_DEFAULT: BedParams = {
  width: 900,
  length: 2000,
  height: 450,
  headboard: 'wave',
  headboardSide: 'right',
  headboardHeight: 340,
  drawers: 2,
  base: 'plinth',
  baseHeight: 60,
  body: 'white',
  deck: 'oak',
  backPanel: true,
  handles: 'cutout',
};

/** Готовый вариант кровати: название, подсказка и патч параметров. */
export interface BedPreset {
  id: string;
  label: string;
  hint: string;
  patch: Partial<BedParams>;
}

export const BED_PRESETS: BedPreset[] = [
  {
    id: 'photo',
    label: 'Как на фото',
    hint: '900 × 2000 · «волна» справа · 2 ящика с вырезом',
    patch: {
      width: 900,
      length: 2000,
      height: 450,
      headboard: 'wave',
      headboardSide: 'right',
      headboardHeight: 340,
      drawers: 2,
      base: 'plinth',
      baseHeight: 60,
      body: 'white',
      deck: 'oak',
      handles: 'cutout',
    },
  },
  {
    id: 'single',
    label: 'Односпальная',
    hint: '900 × 2000 · прямая спинка · 2 ящика',
    patch: {
      width: 900,
      length: 2000,
      height: 470,
      headboard: 'straight',
      headboardHeight: 300,
      drawers: 2,
      base: 'legs',
      baseHeight: 80,
      body: 'white',
      deck: 'oak',
      handles: 'cutout',
    },
  },
  {
    id: 'corner',
    label: 'Угловая',
    hint: '1200 × 2000 · спинка + боковина · 3 ящика',
    patch: {
      width: 1200,
      length: 2000,
      height: 470,
      headboard: 'corner',
      headboardSide: 'right',
      headboardHeight: 420,
      drawers: 3,
      base: 'plinth',
      baseHeight: 80,
      body: 'oak',
      deck: 'oak',
      handles: 'cutout',
    },
  },
  {
    id: 'double',
    label: 'Двуспальная',
    hint: '1600 × 2000 · прямая спинка · 4 ящика',
    patch: {
      width: 1600,
      length: 2000,
      height: 470,
      headboard: 'straight',
      headboardHeight: 350,
      drawers: 4,
      base: 'legs',
      baseHeight: 100,
      body: 'cashmere',
      deck: 'oak',
      handles: 'bar',
    },
  },
  {
    id: 'podium',
    label: 'Подиум',
    hint: '1200 × 2000 · без спинки · 3 ящика',
    patch: {
      width: 1200,
      length: 2000,
      height: 400,
      headboard: 'none',
      drawers: 3,
      base: 'plinth',
      baseHeight: 60,
      body: 'white',
      deck: 'oak',
      handles: 'cutout',
    },
  },
];

/** Варианты, которые добавим в конструктор следующими итерациями. */
export interface BedFutureOption {
  id: string;
  label: string;
  hint: string;
}

export const BED_FUTURE_OPTIONS: BedFutureOption[] = [
  {
    id: 'lift',
    label: 'Подъёмный механизм',
    hint: 'газлифт: под матрасом — бельевой ящик на весь размер',
  },
  {
    id: 'mattress',
    label: 'Матрас в комплекте',
    hint: 'подбор жёсткости и высоты под основание',
  },
  {
    id: 'bunk',
    label: 'Двухъярусная',
    hint: 'два спальных места друг над другом',
  },
  {
    id: 'loft',
    label: 'Кровать-чердак',
    hint: 'спальное место сверху, стол или гардероб снизу',
  },
  {
    id: 'side',
    label: 'Ящики с торца',
    hint: 'если кровать стоит вплотную к стене спереди',
  },
  {
    id: 'soft',
    label: 'Мягкое изголовье',
    hint: 'обивка тканью, каретная стяжка',
  },
  {
    id: 'drawerFull',
    label: 'Ящик во всю длину',
    hint: 'один широкий ящик на всю кровать',
  },
];

// ---------- Нормализация ----------

export function cloneBedParams(p: BedParams): BedParams {
  return { ...p };
}

const HEADBOARDS: BedHeadboard[] = ['none', 'straight', 'corner', 'wave'];
const HANDLES: BedHandleStyle[] = ['cutout', 'bar', 'knob', 'profile'];
const BODY_FINISHES = Object.keys(BODY_LABEL) as BodyFinish[];

export function normalizeBedParams(input: Partial<BedParams> | undefined): BedParams {
  const raw: Partial<BedParams> = input ?? {};

  const headboard: BedHeadboard = HEADBOARDS.includes(raw.headboard as BedHeadboard)
    ? (raw.headboard as BedHeadboard)
    : BED_DEFAULT.headboard;
  const headboardSide: BedSide =
    raw.headboardSide === 'left' || raw.headboardSide === 'right'
      ? raw.headboardSide
      : BED_DEFAULT.headboardSide;
  const base: BedBase =
    raw.base === 'plinth' || raw.base === 'legs' || raw.base === 'none' ? raw.base : BED_DEFAULT.base;
  const handles: BedHandleStyle = HANDLES.includes(raw.handles as BedHandleStyle)
    ? (raw.handles as BedHandleStyle)
    : BED_DEFAULT.handles;
  const body: BodyFinish = BODY_FINISHES.includes(raw.body as BodyFinish)
    ? (raw.body as BodyFinish)
    : BED_DEFAULT.body;
  const deck: BodyFinish = BODY_FINISHES.includes(raw.deck as BodyFinish)
    ? (raw.deck as BodyFinish)
    : BED_DEFAULT.deck;

  const height = snap(
    Number(raw.height ?? BED_DEFAULT.height),
    BED_LIMITS.height.min,
    BED_LIMITS.height.max,
    BED_LIMITS.height.step,
  );
  const rawBaseHeight = snap(
    Number(raw.baseHeight ?? BED_DEFAULT.baseHeight),
    BED_LIMITS.baseHeight.min,
    BED_LIMITS.baseHeight.max,
    BED_LIMITS.baseHeight.step,
  );
  // основание не должно съедать весь корпус: оставляем минимум 300 мм на ящики
  const baseHeight = base === 'none' ? 0 : Math.min(rawBaseHeight, Math.max(0, height - 300));

  return {
    width: snap(
      Number(raw.width ?? BED_DEFAULT.width),
      BED_LIMITS.width.min,
      BED_LIMITS.width.max,
      BED_LIMITS.width.step,
    ),
    length: snap(
      Number(raw.length ?? BED_DEFAULT.length),
      BED_LIMITS.length.min,
      BED_LIMITS.length.max,
      BED_LIMITS.length.step,
    ),
    height,
    headboard,
    headboardSide,
    headboardHeight: snap(
      Number(raw.headboardHeight ?? BED_DEFAULT.headboardHeight),
      BED_LIMITS.headboardHeight.min,
      BED_LIMITS.headboardHeight.max,
      BED_LIMITS.headboardHeight.step,
    ),
    drawers: clamp(
      Math.round(Number(raw.drawers ?? BED_DEFAULT.drawers)),
      BED_LIMITS.drawers.min,
      BED_LIMITS.drawers.max,
    ),
    base,
    baseHeight,
    body,
    deck,
    backPanel: raw.backPanel !== undefined ? Boolean(raw.backPanel) : BED_DEFAULT.backPanel,
    handles,
  };
}

/** Применить готовый вариант к текущим параметрам (с нормализацией). */
export function applyBedPreset(p: BedParams, patch: Partial<BedParams>): BedParams {
  return normalizeBedParams({ ...p, ...patch });
}

/** Активен ли вариант: совпали все поля, которые он задаёт. */
export function isBedPresetActive(p: BedParams, preset: BedPreset): boolean {
  const keys = Object.keys(preset.patch) as Array<keyof BedParams>;
  return keys.every((key) => p[key] === preset.patch[key]);
}

// ---------- Геометрия ----------

export interface BedRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface BedBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface BedHeadboardLayout {
  kind: BedHeadboard;
  /** задняя панель изголовья (z от 0) */
  back: BedBox | null;
  /** боковина углового изголовья (x у соответствующей стороны) */
  side: BedBox | null;
}

export interface BedLayout {
  params: BedParams;
  width: number;
  length: number;
  /** высота каркаса до столешницы */
  height: number;
  /** полная высота изделия с изголовьем */
  totalHeight: number;
  baseH: number;
  carcass: BedBox;
  inner: BedBox;
  /** центры перегородок между ящиками (x) */
  dividersX: number[];
  /** фасады ящиков: один ряд по фронту */
  drawerFronts: BedRect[];
  headboard: BedHeadboardLayout;
  /** вылет боковины изголовья от задней плоскости, мм */
  sideLen: number;
  /** площади деталей в мм² — из них считается цена */
  areas: {
    body: number;
    deck: number;
    back: number;
    facade: number;
  };
}

/** Точки плавного S-перехода (smoothstep) от одной точки к другой. */
function sCurve(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps = 6,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / (steps + 1);
    const k = t * t * (3 - 2 * t);
    points.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * k]);
  }
  return points;
}

/** Точки полукруга-выреза в верхней кромке фасада (локальные координаты). */
function notchArc(radius: number, top: number, steps = 12): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 1; i < steps; i += 1) {
    const angle = (Math.PI * i) / steps;
    points.push([radius * Math.cos(angle), top - radius * Math.sin(angle)]);
  }
  return points;
}

export function buildBedLayout(params: BedParams): BedLayout {
  const W = params.width;
  const L = params.length;
  const H = params.height;
  const baseH = params.base === 'none' ? 0 : Math.min(params.baseHeight, Math.max(0, H - 300));

  const carcass: BedBox = { x0: -W / 2, x1: W / 2, y0: baseH, y1: H, z0: 0, z1: L };
  const inner: BedBox = {
    x0: -W / 2 + PANEL,
    x1: W / 2 - PANEL,
    y0: baseH + PANEL,
    y1: H - PANEL,
    z0: params.backPanel ? BACK : 0,
    z1: L,
  };

  const innerW = inner.x1 - inner.x0;
  const innerH = inner.y1 - inner.y0;

  // Ящики: один ряд по фронту, ячейки делят внутреннюю ширину поровну.
  const count = clamp(Math.round(params.drawers), BED_LIMITS.drawers.min, BED_LIMITS.drawers.max);
  const cellWidth = innerW / count;
  const drawerFronts: BedRect[] = Array.from({ length: count }, (_, i) => ({
    x0: inner.x0 + i * cellWidth + BED_FRONT_GAP / 2,
    x1: inner.x0 + (i + 1) * cellWidth - BED_FRONT_GAP / 2,
    y0: inner.y0 + BED_FRONT_GAP / 2,
    y1: inner.y1 - BED_FRONT_GAP / 2,
  }));
  const dividersX = Array.from({ length: Math.max(0, count - 1) }, (_, i) => inner.x0 + (i + 1) * cellWidth);

  // Изголовье.
  const hbBottom = H - PANEL;
  const hbTop = H + params.headboardHeight;
  const hbT = BED_BACKBOARD_T;
  const headboard: BedHeadboardLayout = { kind: params.headboard, back: null, side: null };
  let sideLen = 0;
  if (params.headboard !== 'none') {
    headboard.back = { x0: -W / 2, x1: W / 2, y0: hbBottom, y1: hbTop, z0: 0, z1: hbT };
    if (params.headboard === 'corner' || params.headboard === 'wave') {
      sideLen = clamp(L * 0.5, 700, 1200);
      const x0 = params.headboardSide === 'right' ? W / 2 - hbT : -W / 2;
      headboard.side = {
        x0,
        x1: x0 + hbT,
        y0: hbBottom,
        y1: hbTop,
        z0: 0,
        z1: sideLen,
      };
    }
  }

  const totalHeight = params.headboard === 'none' ? H : hbTop;

  // Площади: корпус, столешница с изголовьем, задняя стенка, фасады ящиков.
  const innerDepth = L - inner.z0;
  const bodyArea =
    2 * (H - baseH) * L + // боковины
    (W - 2 * PANEL) * innerDepth + // дно
    dividersX.length * innerH * innerDepth; // перегородки
  const headboardHeight = Math.max(0, hbTop - hbBottom);
  const deckArea =
    (W - 2 * PANEL) * innerDepth + // столешница
    (headboard.back ? W * headboardHeight : 0) +
    (headboard.side ? sideLen * headboardHeight : 0);
  const backArea = params.backPanel ? (W - 2 * PANEL) * innerH : 0;
  const facadeArea = drawerFronts.reduce(
    (sum, front) => sum + (front.x1 - front.x0) * (front.y1 - front.y0),
    0,
  );

  return {
    params,
    width: W,
    length: L,
    height: H,
    totalHeight,
    baseH,
    carcass,
    inner,
    dividersX,
    drawerFronts,
    headboard,
    sideLen,
    areas: { body: bodyArea, deck: deckArea, back: backArea, facade: facadeArea },
  };
}

// ---------- Детали для 3D и спецификации ----------

/** Профиль задней панели изголовья (локальные координаты, мм). */
function headboardProfile(params: BedParams, layout: BedLayout): Array<[number, number]> {
  const W = layout.width;
  const H = layout.height;
  const hbTop = layout.headboard.back?.y1 ?? H;
  const hbBottom = layout.headboard.back?.y0 ?? H - PANEL;
  const centerY = (hbBottom + hbTop) / 2;
  const halfW = W / 2;
  const top = hbTop - centerY;
  const bottom = hbBottom - centerY;
  const low = H + 20 - centerY; // кромка у столешницы со стороны спуска

  if (params.headboard !== 'wave') {
    return [
      [-halfW, bottom],
      [halfW, bottom],
      [halfW, top],
      [-halfW, top],
    ];
  }

  const waveEnd = clamp(W * 0.6, 450, 900);
  const side = params.headboardSide;

  // Полигоны обходим против часовой стрелки: у ExtrudeGeometry от этого
  // зависят нормали торцов, а материал в сцене односторонний.
  if (side === 'right') {
    // полная высота справа, плавный спуск к столешнице слева
    return [
      [-halfW, bottom],
      [halfW, bottom],
      [halfW, top],
      [halfW - waveEnd, top],
      ...sCurve(halfW - waveEnd, top, -halfW, low),
      [-halfW, low],
    ];
  }

  return [
    [-halfW, bottom],
    [halfW, bottom],
    [halfW, low],
    ...sCurve(halfW, low, halfW - waveEnd, top),
    [-halfW, top],
  ];
}

/** Профиль боковины углового изголовья в плоскости ZY (локальные координаты). */
function sideboardProfile(params: BedParams, layout: BedLayout): Array<[number, number]> {
  const H = layout.height;
  const hbTop = layout.headboard.side?.y1 ?? H;
  const hbBottom = layout.headboard.side?.y0 ?? H - PANEL;
  const sideLen = layout.sideLen;
  const zc = sideLen / 2;
  const yc = (hbBottom + hbTop) / 2;
  const bottom = hbBottom - yc;
  const top = hbTop - yc;
  const low = H + 20 - yc;

  if (params.headboard !== 'wave') {
    return [
      [-zc, bottom],
      [zc, bottom],
      [zc, top],
      [-zc, top],
    ];
  }

  // Задний угол — на полной высоте, к переднему краю панель плавно спускается.
  const a = -zc + sideLen * 0.45;
  return [
    [-zc, bottom],
    [zc, bottom],
    [zc, low],
    ...sCurve(zc, low, a, top, 7),
    [-zc, top],
  ];
}

export function buildBedParts(params: BedParams, layout: BedLayout): Part[] {
  const parts: Part[] = [];
  const push = (p: Omit<Part, 'id'>): void => {
    parts.push({ ...p, id: `${p.role}-${parts.length}` });
  };

  const W = layout.width;
  const L = layout.length;
  const H = layout.height;
  const { inner } = layout;
  const innerDepth = L - inner.z0;
  const innerZ = inner.z0 + innerDepth / 2;
  const innerH = inner.y1 - inner.y0;
  const carcassH = H - layout.baseH;
  const carcassY = (layout.baseH + H) / 2;

  // ---------- корпус ----------
  for (const side of [-1, 1]) {
    push({
      role: 'side',
      label: 'Боковина',
      w: PANEL,
      h: carcassH,
      d: L,
      x: side * (W / 2 - PANEL / 2),
      y: carcassY,
      z: L / 2,
      material: 'body',
    });
  }

  push({
    role: 'bottom',
    label: 'Дно',
    w: W - 2 * PANEL,
    h: PANEL,
    d: innerDepth,
    x: 0,
    y: layout.baseH + PANEL / 2,
    z: innerZ,
    material: 'body',
  });

  // Столешница — свой декор: на фото она дубовая, а корпус белый.
  push({
    role: 'deck',
    label: 'Столешница',
    w: W - 2 * PANEL,
    h: PANEL,
    d: innerDepth,
    x: 0,
    y: H - PANEL / 2,
    z: innerZ,
    material: 'deck',
  });

  if (params.backPanel) {
    push({
      role: 'back',
      label: 'Задняя стенка',
      w: W - 2 * PANEL,
      h: innerH,
      d: BACK,
      x: 0,
      y: (inner.y0 + inner.y1) / 2,
      z: BACK / 2,
      material: 'back',
    });
  }

  for (const x of layout.dividersX) {
    push({
      role: 'divider',
      label: 'Перегородка',
      w: PANEL,
      h: innerH,
      d: innerDepth,
      x,
      y: (inner.y0 + inner.y1) / 2,
      z: innerZ,
      material: 'body',
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
      z: L - PLINTH_RECESS - PLINTH_D / 2,
      material: 'plinth',
    });

    const sideDepth = L - PLINTH_RECESS;
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
    for (const sx of [-1, 1]) {
      for (const z of [LEG_INSET + LEG_SIZE / 2, L - LEG_INSET - LEG_SIZE / 2]) {
        push({
          role: 'leg',
          label: 'Ножка',
          w: LEG_SIZE,
          h: layout.baseH,
          d: LEG_SIZE,
          x: sx * (W / 2 - LEG_INSET - LEG_SIZE / 2),
          y: layout.baseH / 2,
          z,
          material: 'plinth',
        });
      }
    }
  }

  // ---------- ящики ----------
  for (let index = 0; index < layout.drawerFronts.length; index += 1) {
    const rect = layout.drawerFronts[index];
    const frontW = rect.x1 - rect.x0;
    const frontH = rect.y1 - rect.y0;
    const centerX = (rect.x0 + rect.x1) / 2;
    const centerY = (rect.y0 + rect.y1) / 2;
    const group = `drawer-${index}`;

    if (params.handles === 'cutout') {
      // Фигурный фасад: прямоугольник с полукруглым вырезом в верхней кромке.
      const radius = clamp(Math.min(frontW * 0.24, frontH * 0.5), 45, 110);
      const top = frontH / 2;
      const profile: Array<[number, number]> = [
        [-frontW / 2, -frontH / 2],
        [frontW / 2, -frontH / 2],
        [frontW / 2, top],
        [radius, top],
        ...notchArc(radius, top),
        [-radius, top],
        [-frontW / 2, top],
      ];
      push({
        role: 'drawerFront',
        label: 'Фасад ящика с вырезом',
        w: frontW,
        h: frontH,
        d: BED_FRONT_T,
        x: centerX,
        y: centerY,
        z: L - BED_FRONT_T / 2,
        material: 'facade',
        group,
        shape: 'extrude',
        profile,
        profilePlane: 'xy',
      });

      // Тёмная подложка за вырезом: через отверстие видна глубина фрезеровки,
      // а не белая стенка ящика. Двигается вместе с ящиком (та же группа).
      push({
        role: 'drawerHandle',
        label: 'Подложка выреза',
        w: radius * 2,
        h: radius,
        d: 2,
        x: centerX,
        y: centerY + frontH / 2 - radius / 2,
        z: L - BED_FRONT_T - 1,
        material: 'recess',
        group,
      });
    } else {
      push({
        role: 'drawerFront',
        label: 'Фасад ящика',
        w: frontW,
        h: frontH,
        d: BED_FRONT_T,
        x: centerX,
        y: centerY,
        z: L - BED_FRONT_T / 2,
        material: 'facade',
        group,
      });
    }

    for (const boxPart of drawerBoxParts({
      x: centerX,
      y: centerY,
      z: L - BED_FRONT_T / 2,
      frontT: BED_FRONT_T,
      frontW,
      frontH,
      backZ: inner.z0,
      group,
      maxDepth: DRAWER_MAX_DEPTH,
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
        x: centerX,
        y: centerY,
        z: L + 8,
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
        x: centerX,
        y: centerY,
        z: L + 9,
        material: 'metal',
        group,
      });
    } else if (params.handles === 'profile') {
      push({
        role: 'drawerHandle',
        label: 'Профиль-ручка',
        w: Math.max(80, frontW - 40),
        h: Math.min(10, frontH * 0.12),
        d: 12,
        x: centerX,
        y: centerY,
        z: L + 6,
        material: 'metal',
        group,
      });
    }
  }

  // ---------- изголовье ----------
  const back = layout.headboard.back;
  if (back) {
    push({
      role: 'headboard',
      label: 'Изголовье',
      w: back.x1 - back.x0,
      h: back.y1 - back.y0,
      d: back.z1 - back.z0,
      x: (back.x0 + back.x1) / 2,
      y: (back.y0 + back.y1) / 2,
      z: (back.z0 + back.z1) / 2,
      material: 'deck',
      shape: 'extrude',
      profile: headboardProfile(params, layout),
      profilePlane: 'xy',
    });
  }

  const side = layout.headboard.side;
  if (side) {
    push({
      role: 'headboardSide',
      label: 'Боковина изголовья',
      w: side.x1 - side.x0,
      h: side.y1 - side.y0,
      d: side.z1 - side.z0,
      x: (side.x0 + side.x1) / 2,
      y: (side.y0 + side.y1) / 2,
      z: (side.z0 + side.z1) / 2,
      material: 'deck',
      shape: 'extrude',
      profile: sideboardProfile(params, layout),
      profilePlane: 'zy',
    });
  }

  return parts;
}

// ---------- Сцена ----------

export function bedScene(params: BedParams, layout: BedLayout): SceneModel {
  return {
    width: params.width,
    height: layout.totalHeight,
    depth: params.length,
    parts: buildBedParts(params, layout),
    doors: [],
    doorsKind: 'none',
    lighting: false,
    body: params.body,
    facade: 'same',
    deck: params.deck,
  };
}

// ---------- Подписи ----------

export function bedHeadboardSummary(params: BedParams): string {
  if (params.headboard === 'none') return BED_HEADBOARD_LABEL.none;
  const side =
    params.headboard === 'corner' || params.headboard === 'wave'
      ? ` ${BED_SIDE_SHORT[params.headboardSide]}`
      : '';
  return `${BED_HEADBOARD_LABEL[params.headboard]}${side}`;
}

export function bedSummary(params: BedParams, layout: BedLayout): string {
  const headboard = bedHeadboardSummary(params);
  const height = params.headboard === 'none' ? '' : ` · спинка ${params.headboardHeight} мм`;
  const parts = [
    drawersLabel(layout.drawerFronts.length),
    `${headboard.toLowerCase()}${height}`,
  ];
  return parts.join(' · ');
}

export function bedSizeLabel(layout: BedLayout): string {
  return `${layout.width} × ${layout.length} мм`;
}

/** Высота изделия: каркас и полная высота с изголовьем. */
export function bedHeightsLabel(layout: BedLayout): string {
  return layout.totalHeight > layout.height
    ? `${layout.height} + ${layout.totalHeight - layout.height} мм`
    : `${layout.height} мм`;
}

export function bedBaseSummary(params: BedParams, layout: BedLayout): string {
  if (params.base === 'none') return 'без основания';
  const label = params.base === 'legs' ? 'ножки' : 'цоколь';
  return `${label} ${layout.baseH} мм`;
}

// ---------- Цена ----------

const BODY_RATE = 2600; // ₽/м² ЛДСП корпуса
const DECK_RATE = 2600; // ₽/м² ЛДСП столешницы и изголовья
const BACK_RATE = 450; // ₽/м² ДВП
const FRONT_RATE = 5200; // ₽/м² фасад ящика
const DRAWER = 1700; // направляющие + сборка ящика
const HANDLE = 350; // ручка или фрезеровка выреза
const LEG = 400; // ножка
const PLINTH = 900; // цоколь
const ASSEMBLY_RATE = 0.12;
const ASSEMBLY_MIN = 5500;
const DELIVERY = 3500;

export function calcBedPrice(params: BedParams, layout: BedLayout): PriceResult {
  const { areas } = layout;
  const bodyArea = m2(areas.body / 1_000_000);
  const deckArea = m2(areas.deck / 1_000_000);
  const backArea = m2(areas.back / 1_000_000);
  const facadeArea = m2(areas.facade / 1_000_000);

  const drawers = layout.drawerFronts.length;
  const handles = drawers;

  const lines: PriceLine[] = [];

  lines.push({
    key: 'body',
    label: 'Корпус и перегородки, ЛДСП 16 мм',
    detail: `${areaM2(bodyArea)} · ${BODY_RATE} ₽/м²`,
    amount: Math.round(bodyArea * BODY_RATE),
  });

  if (deckArea > 0) {
    lines.push({
      key: 'deck',
      label: `Столешница и изголовье, ${BODY_LABEL[params.deck].toLowerCase()}`,
      detail: `${areaM2(deckArea)} · ${DECK_RATE} ₽/м²`,
      amount: Math.round(deckArea * DECK_RATE),
    });
  }

  if (backArea > 0) {
    lines.push({
      key: 'back',
      label: 'Задняя стенка, ДВП',
      detail: `${areaM2(backArea)} · ${BACK_RATE} ₽/м²`,
      amount: Math.round(backArea * BACK_RATE),
    });
  }

  if (params.base === 'plinth' && layout.baseH > 0) {
    lines.push({ key: 'plinth', label: 'Цоколь', detail: `${layout.baseH} мм`, amount: PLINTH });
  }
  if (params.base === 'legs' && layout.baseH > 0) {
    lines.push({ key: 'legs', label: `Ножки, ${layout.baseH} мм`, detail: '4 шт.', amount: 4 * LEG });
  }

  if (facadeArea > 0) {
    lines.push({
      key: 'facade',
      label: 'Фасады ящиков, ЛДСП 18 мм',
      detail: `${areaM2(facadeArea)} · ${FRONT_RATE} ₽/м²`,
      amount: Math.round(facadeArea * FRONT_RATE),
    });
  }

  lines.push({
    key: 'drawers',
    label: 'Ящики с направляющими',
    detail: `${drawers} ${plural(drawers, 'шт.', 'шт.', 'шт.')}`,
    amount: drawers * DRAWER,
  });

  lines.push({
    key: 'handles',
    label:
      params.handles === 'cutout'
        ? 'Фрезеровка вырезов-ручек'
        : `Ручки: ${BED_HANDLE_LABEL[params.handles].toLowerCase()}`,
    detail: `${handles} ${plural(handles, 'шт.', 'шт.', 'шт.')}`,
    amount: handles * HANDLE,
  });

  const goods = lines.reduce((sum, line) => sum + line.amount, 0);
  const assembly = Math.max(ASSEMBLY_MIN, round100(goods * ASSEMBLY_RATE));
  const total = round100(goods + assembly + DELIVERY);

  return {
    lines,
    goods,
    assembly,
    delivery: DELIVERY,
    total,
    bodyArea: m2(bodyArea + deckArea + backArea),
    facadeArea,
  };
}

export const BED_RATES = {
  BODY_RATE,
  DECK_RATE,
  BACK_RATE,
  FRONT_RATE,
  DRAWER,
  HANDLE,
  LEG,
  PLINTH,
  ASSEMBLY_RATE,
  ASSEMBLY_MIN,
  DELIVERY,
} as const;
