/**
 * Кровать с ящиками — четвёртое изделие конструктора «Василиса».
 *
 * Конструктив повторяет логику комода и тумбы (корпус из ЛДСП, ящики,
 * основание, жёсткая задняя стенка из ЛДСП), но у кровати свой набор параметров:
 * спальное место (ширина × длина), высота каркаса, изголовье, декор
 * столешницы и фасады ящиков с вырезом-ручкой.
 *
 * Изголовье — не «кубик» над кроватью, а две тонкие панели 16 мм, как на фото:
 *   1) спинка по изголовью (с плавным сходом к столешнице у свободного края —
 *      вариант «волна»);
 *   2) стенка, идущая ПО ДЛИНЕ кровати вдоль одной стороны, с круговым
 *      скруглением к столешнице на конце — «угловатость».
 *
 * Все размеры в миллиметрах, координаты — как у остальных изделий:
 *   x: 0 — центр, +x вправо; y: 0 — пол, +y вверх; z: 0 — задняя плоскость
 *   (изголовье), +z — к изножью.
 *
 * Геометрия кровати — единственный источник правды: из неё считаются детали
 * для 3D и спецификации, цена и текст заявки.
 */
import {
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
import { drawersLabel } from './labels';
import type { SceneModel } from './scene-model';

// ---------- Конструктив ----------

/** Толщина фасада ящика, мм. */
export const BED_FRONT_T = 18;
/** Зазор между фасадами ящиков, мм. */
export const BED_FRONT_GAP = 4;
/** Толщина панелей изголовья (спинка и стенка по длине), мм: тонкие панели ЛДСП. */
export const BED_WALL_T = 16;
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
/**
 * Изголовье:
 * - none — без изголовья (кровать-подиум);
 * - straight — тонкая спинка по изголовью без стенки;
 * - corner — спинка + тонкая стенка по длине с прямым концом;
 * - wave — то же, но конец спинки и конец стенки скруглены, как на фото.
 */
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
  /** высота спинки над столешницей, мм */
  headboardHeight: number;
  /** сторона высокой стенки по длине */
  wallSide: BedSide;
  /** высота высокой стенки над столешницей, мм */
  wallHeight: number;
  /** длина высокой стенки от изголовья, мм */
  wallLength: number;
  /** число фасадов ящиков в ряд по фронту */
  drawers: number;
  base: BedBase;
  baseHeight: number;
  body: BodyFinish;
  /** декор столешницы, спинки и стенки */
  deck: BodyFinish;
  handles: BedHandleStyle;
}

export const BED_LIMITS = {
  width: { min: 700, max: 2000, step: 10 },
  length: { min: 1600, max: 2100, step: 10 },
  height: { min: 350, max: 650, step: 10 },
  headboardHeight: { min: 80, max: 400, step: 10 },
  wallHeight: { min: 100, max: 700, step: 10 },
  wallLength: { min: 600, max: 2000, step: 10 },
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
  corner: 'Угловая: спинка + стенка',
  wave: 'Угловая «волна»',
};

export const BED_HEADBOARD_HINT: Record<BedHeadboard, string> = {
  none: 'кровать-подиум: ровная столешница без изголовья',
  straight: 'тонкая панель-спинка по изголовью',
  corner: 'тонкая спинка и стенка, идущая по длине кровати, с прямым концом',
  wave: 'тонкая спинка с плавным сходом и стенка по длине со скруглённым концом, как на фото',
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
  headboardHeight: 240,
  wallSide: 'left',
  wallHeight: 400,
  wallLength: 1800,
  drawers: 2,
  base: 'plinth',
  baseHeight: 60,
  body: 'white',
  deck: 'oak',
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
    hint: '900 × 2000 · спинка + стенка по длине · 2 ящика',
    patch: {
      width: 900,
      length: 2000,
      height: 450,
      headboard: 'wave',
      headboardHeight: 240,
      wallSide: 'left',
      wallHeight: 400,
      wallLength: 1800,
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
      height: 450,
      headboard: 'straight',
      headboardHeight: 220,
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
    hint: '1200 × 2000 · спинка + стенка по длине · 3 ящика',
    patch: {
      width: 1200,
      length: 2000,
      height: 460,
      headboard: 'corner',
      headboardHeight: 260,
      wallSide: 'left',
      wallHeight: 440,
      wallLength: 1600,
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
      headboardHeight: 280,
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
    hint: '1200 × 2000 · без изголовья · 3 ящика',
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
  const wallSide: BedSide =
    raw.wallSide === 'left' || raw.wallSide === 'right' ? raw.wallSide : BED_DEFAULT.wallSide;
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
  const length = snap(
    Number(raw.length ?? BED_DEFAULT.length),
    BED_LIMITS.length.min,
    BED_LIMITS.length.max,
    BED_LIMITS.length.step,
  );
  const rawBaseHeight = snap(
    Number(raw.baseHeight ?? BED_DEFAULT.baseHeight),
    BED_LIMITS.baseHeight.min,
    BED_LIMITS.baseHeight.max,
    BED_LIMITS.baseHeight.step,
  );
  // основание не должно съедать весь корпус: оставляем минимум 300 мм на ящики
  const baseHeight = base === 'none' ? 0 : Math.min(rawBaseHeight, Math.max(0, height - 300));
  // высокая стенка не должна упираться в изножье: оставляем 200 мм столешницы
  const wallLength = Math.min(
    snap(
      Number(raw.wallLength ?? BED_DEFAULT.wallLength),
      BED_LIMITS.wallLength.min,
      BED_LIMITS.wallLength.max,
      BED_LIMITS.wallLength.step,
    ),
    Math.max(BED_LIMITS.wallLength.min, length - 200),
  );

  return {
    width: snap(
      Number(raw.width ?? BED_DEFAULT.width),
      BED_LIMITS.width.min,
      BED_LIMITS.width.max,
      BED_LIMITS.width.step,
    ),
    length,
    height,
    headboard,
    headboardHeight: snap(
      Number(raw.headboardHeight ?? BED_DEFAULT.headboardHeight),
      BED_LIMITS.headboardHeight.min,
      BED_LIMITS.headboardHeight.max,
      BED_LIMITS.headboardHeight.step,
    ),
    wallSide,
    wallHeight: snap(
      Number(raw.wallHeight ?? BED_DEFAULT.wallHeight),
      BED_LIMITS.wallHeight.min,
      BED_LIMITS.wallHeight.max,
      BED_LIMITS.wallHeight.step,
    ),
    wallLength,
    drawers: clamp(
      Math.round(Number(raw.drawers ?? BED_DEFAULT.drawers)),
      BED_LIMITS.drawers.min,
      BED_LIMITS.drawers.max,
    ),
    base,
    baseHeight,
    body,
    deck,
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
  /** спинка по изголовью (тонкая панель, z от 0 до толщины панели) */
  back: BedBox | null;
  /** высокая стенка по длине кровати (z от 0 до её длины) */
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
  /** длина высокой стенки, мм (0 — стенки нет) */
  sideLen: number;
  /** толщина высокой стенки, мм */
  wallT: number;
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
    y1: H - BED_DECK_T,
    z0: PANEL,
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
  const dividersX = Array.from(
    { length: Math.max(0, count - 1) },
    (_, i) => inner.x0 + (i + 1) * cellWidth,
  );

  // Изголовье: тонкая спинка + (для угловой) тонкая стенка по длине.
  const hbBottom = H - BED_DECK_T;
  const backTop = H + params.headboardHeight;
  const headboard: BedHeadboardLayout = { kind: params.headboard, back: null, side: null };
  let sideLen = 0;
  if (params.headboard !== 'none') {
    headboard.back = {
      x0: -W / 2,
      x1: W / 2,
      y0: hbBottom,
      y1: backTop,
      z0: 0,
      z1: BED_WALL_T,
    };
  }
  if (params.headboard === 'corner' || params.headboard === 'wave') {
    sideLen = Math.min(params.wallLength, L - 200);
    const wallTop = H + params.wallHeight;
    const x0 = params.wallSide === 'right' ? W / 2 - BED_WALL_T : -W / 2;
    headboard.side = {
      x0,
      x1: x0 + BED_WALL_T,
      y0: hbBottom,
      y1: wallTop,
      z0: 0,
      z1: sideLen,
    };
  }

  const topHeight = headboard.side ? H + params.wallHeight : backTop;
  const totalHeight = params.headboard === 'none' ? H : Math.max(backTop, topHeight);

  // Площади: корпус, столешница с изголовьем, задняя стенка, фасады ящиков.
  const innerDepth = L - inner.z0;
  const bodyArea =
    2 * (H - baseH) * L + // боковины
    (W - 2 * PANEL) * innerDepth + // дно
    dividersX.length * innerH * innerDepth; // перегородки
  // Спинка и стенка — тонкие панели, площадь считаем по проекции.
  const backBoxArea = headboard.back ? W * (headboard.back.y1 - headboard.back.y0) : 0;
  const wallBoxArea = headboard.side
    ? sideLen * (headboard.side.y1 - headboard.side.y0)
    : 0;
  const deckArea =
    (W - 2 * PANEL) * innerDepth + // столешница
    backBoxArea +
    wallBoxArea;
  // Задняя стенка жёсткая: ЛДСП 16 мм на всю высоту корпуса — кровать должна
  // выдерживать человека, ДВП здесь не годится.
  const backArea = (W - 2 * PANEL) * (H - BED_DECK_T - baseH);
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
    wallT: BED_WALL_T,
    areas: { body: bodyArea, deck: deckArea, back: backArea, facade: facadeArea },
  };
}

// ---------- Детали для 3D и спецификации ----------

/**
 * Профиль спинки (плоскость XY, выдавливание на толщину панели).
 * Обход против часовой стрелки: у ExtrudeGeometry от него зависят нормали.
 */
function headboardProfile(params: BedParams, layout: BedLayout): Array<[number, number]> {
  const back = layout.headboard.back;
  if (!back) return [];
  const halfW = (back.x1 - back.x0) / 2;
  const centerY = (back.y0 + back.y1) / 2;
  const bottom = back.y0 - centerY;
  const top = back.y1 - centerY;
  const low = layout.height + 20 - centerY; // сход к столешнице у свободного края
  const side = params.wallSide;

  if (params.headboard !== 'wave' || !layout.headboard.side) {
    return [
      [-halfW, bottom],
      [halfW, bottom],
      [halfW, top],
      [-halfW, top],
    ];
  }

  const waveLen = clamp((back.x1 - back.x0) * 0.4, 320, 720);

  if (side === 'right') {
    // свободный край — слева: спинка сходит к столешнице, стенка справа
    return [
      [-halfW, bottom],
      [halfW, bottom],
      [halfW, top],
      [-halfW + waveLen, top],
      ...sCurve(-halfW + waveLen, top, -halfW, low),
      [-halfW, low],
    ];
  }

  return [
    [-halfW, bottom],
    [halfW, bottom],
    [halfW, low],
    ...sCurve(halfW, low, halfW - waveLen, top),
    [-halfW, top],
  ];
}

/**
 * Профиль высокой стенки по длине (плоскость ZY, выдавливание на толщину стенки).
 * У варианта «волна» конец стенки скруглён большим радиусом к столешнице.
 */
function wallProfile(params: BedParams, layout: BedLayout): Array<[number, number]> {
  const side = layout.headboard.side;
  if (!side) return [];
  const wallLen = side.z1 - side.z0;
  const zc = wallLen / 2;
  const centerY = (side.y0 + side.y1) / 2;
  const bottom = side.y0 - centerY;
  const top = side.y1 - centerY;

  if (params.headboard !== 'wave') {
    return [
      [-zc, bottom],
      [zc, bottom],
      [zc, top],
      [-zc, top],
    ];
  }

  const rise = side.y1 - layout.height;
  const radius = clamp(Math.min(220, rise * 0.55, wallLen * 0.35), 100, 240);
  const arcTop = top - radius;

  const points: Array<[number, number]> = [
    [-zc, bottom],
    [zc, bottom],
    [zc, arcTop],
  ];
  // четверть круга: от передней кромки вверх к верхней грани
  const steps = 10;
  for (let i = 1; i < steps; i += 1) {
    const t = (Math.PI / 2) * (i / steps);
    points.push([zc - radius + radius * Math.cos(t), arcTop + radius * Math.sin(t)]);
  }
  points.push([zc - radius, top], [-zc, top]);
  return points;
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
    h: BED_DECK_T,
    d: innerDepth,
    x: 0,
    y: H - BED_DECK_T / 2,
    z: innerZ,
    material: 'deck',
  });

  // Задняя стенка — жёсткая, из ЛДСП 16 мм: на неё опирается корпус кровати.
  const rigidBackH = H - BED_DECK_T - layout.baseH;
  push({
    role: 'back',
    label: 'Задняя стенка жёсткая',
    w: W - 2 * PANEL,
    h: rigidBackH,
    d: PANEL,
    x: 0,
    y: layout.baseH + rigidBackH / 2,
    z: PANEL / 2,
    material: 'body',
  });

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
      label: 'Спинка',
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

  const wall = layout.headboard.side;
  if (wall) {
    push({
      role: 'headboardSide',
      label: 'Стенка по длине',
      w: wall.x1 - wall.x0,
      h: wall.y1 - wall.y0,
      d: wall.z1 - wall.z0,
      x: (wall.x0 + wall.x1) / 2,
      y: (wall.y0 + wall.y1) / 2,
      z: (wall.z0 + wall.z1) / 2,
      material: 'deck',
      shape: 'extrude',
      profile: wallProfile(params, layout),
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
      ? ` ${BED_SIDE_SHORT[params.wallSide]}`
      : '';
  return `${BED_HEADBOARD_LABEL[params.headboard]}${side}`;
}

export function bedSummary(params: BedParams, layout: BedLayout): string {
  const parts = [drawersLabel(layout.drawerFronts.length), bedHeadboardSummary(params)];
  if (params.headboard !== 'none') parts.push(`спинка ${params.headboardHeight} мм`);
  if (layout.headboard.side) parts.push(`стенка ${params.wallLength} × ${params.wallHeight} мм`);
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
const DECK_RATE = 2600; // ₽/м² ЛДСП столешницы, спинки и стенки
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
      label: 'Задняя стенка жёсткая, ЛДСП 16 мм',
      detail: `${areaM2(backArea)} · ${BODY_RATE} ₽/м²`,
      amount: Math.round(backArea * BODY_RATE),
    });
  }

  if (params.base === 'plinth' && layout.baseH > 0) {
    lines.push({ key: 'plinth', label: 'Цоколь', detail: `${layout.baseH} мм`, amount: PLINTH });
  }
  if (params.base === 'legs' && layout.baseH > 0) {
    lines.push({
      key: 'legs',
      label: `Ножки, ${layout.baseH} мм`,
      detail: '4 шт.',
      amount: 4 * LEG,
    });
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
    detail: `${drawers} шт.`,
    amount: drawers * DRAWER,
  });

  lines.push({
    key: 'handles',
    label:
      params.handles === 'cutout'
        ? 'Фрезеровка вырезов-ручек'
        : `Ручки: ${BED_HANDLE_LABEL[params.handles].toLowerCase()}`,
    detail: `${handles} шт.`,
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
  FRONT_RATE,
  DRAWER,
  HANDLE,
  LEG,
  PLINTH,
  ASSEMBLY_RATE,
  ASSEMBLY_MIN,
  DELIVERY,
} as const;
