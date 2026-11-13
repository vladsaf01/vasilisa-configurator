/**
 * Конструктор встроенного шкафа «Василиса».
 * Модель параметров и ограничения. Все размеры — в миллиметрах.
 */

// ---------- Константы конструктива ----------
export const PANEL = 16; // толщина ЛДСП корпуса, мм
export const BACK = 4; // толщина задней стенки (ДВП), мм
export const DOOR_T = 18; // толщина фасада, мм
export const DOOR_GAP = 4; // зазор между фасадами, мм
export const DRAWER_H = 190; // шаг ящика по высоте, мм
export const MEZZANINE = 450; // высота антресольного отделения, мм
export const DOOR_OVERLAP = 40; // нахлёст дверей-купе, мм
export const HINGED_MAX_LEAF = 900; // макс. ширина одиночной распашной створки; шире — двойная
export const HANG_LENGTH = 1100; // длина куртки/пальто: зона под штангой, мм
export const SHELF_BELT = 300; // запас по высоте на полку над штангой, мм

// ---------- Типы ----------
export type DoorsKind = 'none' | 'hinged' | 'sliding';
export type BodyFinish = 'white' | 'oak' | 'graphite' | 'cashmere';
export type FacadeFinish = 'same' | 'mirror' | 'glass';
/** Сколько створок на проём секции: авто по ширине, одна или две. */
export type SectionDoorMode = 'auto' | 'one' | 'two';

export interface SectionConfig {
  /** количество полок в секции */
  shelves: number;
  /** штанга для одежды */
  rod: boolean;
  /** количество ящиков (снизу) */
  drawers: number;
  /** распашные двери: створки на проём секции */
  doorMode: SectionDoorMode;
}

export interface CabinetParams {
  /** ширина, мм */
  width: number;
  /** высота, мм */
  height: number;
  /** глубина, мм */
  depth: number;
  /** секции слева направо */
  sections: SectionConfig[];
  doors: DoorsKind;
  /** высота цоколя, мм (0 — без цоколя) */
  plinth: number;
  /** задняя стенка из ДВП */
  backPanel: boolean;
  body: BodyFinish;
  facade: FacadeFinish;
  lighting: boolean;
  mezzanine: boolean;
  /** показывать в 3D нишу (стены и потолок) */
  niche: boolean;
}

// ---------- Ограничения ----------
export const LIMITS = {
  width: { min: 600, max: 4000, step: 10 },
  height: { min: 1800, max: 3000, step: 10 },
  depth: { min: 300, max: 900, step: 10 },
  plinth: { min: 0, max: 150, step: 10 },
  sections: { min: 1, max: 6 },
  shelves: { min: 0, max: 8 },
  drawers: { min: 0, max: 4 },
  // шаг размеров для быстрых изменений
  widthStep: 50,
  heightStep: 50,
  depthStep: 50,
  plinthStep: 10,
} as const;

// ---------- Подписи ----------
export const DOORS_LABEL: Record<DoorsKind, string> = {
  none: 'Без дверей',
  hinged: 'Распашные',
  sliding: 'Купе',
};

export const BODY_LABEL: Record<BodyFinish, string> = {
  white: 'Белый',
  oak: 'Дуб',
  graphite: 'Графит',
  cashmere: 'Шампань',
};

export const FACADE_LABEL: Record<FacadeFinish, string> = {
  same: 'В цвет корпуса',
  mirror: 'Зеркало',
  glass: 'Стекло',
};

export const SECTION_DOOR_LABEL: Record<SectionDoorMode, string> = {
  auto: 'Авто',
  one: 'Одна',
  two: 'Две',
};

// ---------- Значения по умолчанию ----------
export function createSection(patch: Partial<SectionConfig> = {}): SectionConfig {
  return { shelves: 3, rod: false, drawers: 0, doorMode: 'auto', ...patch };
}

export const DEFAULT_PARAMS: CabinetParams = {
  width: 2000,
  height: 2600,
  depth: 600,
  sections: [
    createSection({ shelves: 4, rod: true }),
    createSection({ shelves: 2, drawers: 3 }),
    createSection({ shelves: 4, rod: true }),
  ],
  doors: 'sliding',
  plinth: 100,
  backPanel: true,
  body: 'white',
  facade: 'same',
  lighting: true,
  mezzanine: false,
  niche: true,
};

// ---------- Утилиты ----------
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Приводит значение к диапазону и шагу (шаг 10 мм для габаритов). */
export function snap(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const snapped = Math.round(value / step) * step;
  return clamp(snapped, min, max);
}

export function cloneParams(p: CabinetParams): CabinetParams {
  return { ...p, sections: p.sections.map((s) => ({ ...s })) };
}

function normalizeSection(input: Partial<SectionConfig> | undefined): SectionConfig {
  const raw = input ?? {};
  const doorMode: SectionDoorMode =
    raw.doorMode === 'one' || raw.doorMode === 'two' || raw.doorMode === 'auto'
      ? raw.doorMode
      : 'auto';
  return {
    shelves: clamp(Math.round(Number(raw.shelves ?? 0)), LIMITS.shelves.min, LIMITS.shelves.max),
    rod: Boolean(raw.rod),
    drawers: clamp(Math.round(Number(raw.drawers ?? 0)), LIMITS.drawers.min, LIMITS.drawers.max),
    doorMode,
  };
}

/** Мягкая нормализация внешних данных (из URL, localStorage, CMS). */
export function normalizeParams(input: Partial<CabinetParams> | undefined): CabinetParams {
  const raw: Partial<CabinetParams> = input ?? {};
  const sectionsInput =
    Array.isArray(raw.sections) && raw.sections.length > 0
      ? raw.sections
      : DEFAULT_PARAMS.sections;
  const count = clamp(sectionsInput.length, LIMITS.sections.min, LIMITS.sections.max);
  const sections = Array.from({ length: count }, (_, i) => normalizeSection(sectionsInput[i]));

  const doors: DoorsKind =
    raw.doors === 'hinged' || raw.doors === 'sliding' || raw.doors === 'none'
      ? raw.doors
      : DEFAULT_PARAMS.doors;

  const body = (Object.keys(BODY_LABEL) as BodyFinish[]).includes(raw.body as BodyFinish)
    ? (raw.body as BodyFinish)
    : DEFAULT_PARAMS.body;
  const facade = (Object.keys(FACADE_LABEL) as FacadeFinish[]).includes(raw.facade as FacadeFinish)
    ? (raw.facade as FacadeFinish)
    : DEFAULT_PARAMS.facade;

  return {
    width: snap(Number(raw.width ?? DEFAULT_PARAMS.width), LIMITS.width.min, LIMITS.width.max, LIMITS.width.step),
    height: snap(Number(raw.height ?? DEFAULT_PARAMS.height), LIMITS.height.min, LIMITS.height.max, LIMITS.height.step),
    depth: snap(Number(raw.depth ?? DEFAULT_PARAMS.depth), LIMITS.depth.min, LIMITS.depth.max, LIMITS.depth.step),
    sections,
    doors,
    plinth: snap(Number(raw.plinth ?? DEFAULT_PARAMS.plinth), LIMITS.plinth.min, LIMITS.plinth.max, LIMITS.plinth.step),
    backPanel: raw.backPanel !== undefined ? Boolean(raw.backPanel) : DEFAULT_PARAMS.backPanel,
    body,
    facade,
    lighting: raw.lighting !== undefined ? Boolean(raw.lighting) : DEFAULT_PARAMS.lighting,
    mezzanine: raw.mezzanine !== undefined ? Boolean(raw.mezzanine) : DEFAULT_PARAMS.mezzanine,
    niche: raw.niche !== undefined ? Boolean(raw.niche) : DEFAULT_PARAMS.niche,
  };
}

// ---------- Операции над секциями ----------
export function setSectionCount(p: CabinetParams, count: number): CabinetParams {
  const n = clamp(Math.round(count), LIMITS.sections.min, LIMITS.sections.max);
  const next = cloneParams(p);
  while (next.sections.length < n) {
    const last = next.sections[next.sections.length - 1] ?? createSection();
    next.sections.push({ ...last, rod: false, drawers: 0 });
  }
  next.sections.length = n;
  return next;
}

export function updateSection(
  p: CabinetParams,
  index: number,
  patch: Partial<SectionConfig>,
): CabinetParams {
  const next = cloneParams(p);
  const current = next.sections[index];
  if (!current) return next;
  next.sections[index] = normalizeSection({ ...current, ...patch });
  return next;
}

export function totalShelves(p: CabinetParams): number {
  return p.sections.reduce((sum, s) => sum + s.shelves, 0);
}

export function totalDrawers(p: CabinetParams): number {
  return p.sections.reduce((sum, s) => sum + s.drawers, 0);
}

export function totalRods(p: CabinetParams): number {
  return p.sections.filter((s) => s.rod).length;
}

// ---------- Готовые габариты ----------
export interface SizePreset {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
  depth: number;
  doors: DoorsKind;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'hallway', label: 'Прихожая', hint: 'узкий, распашной', width: 1200, height: 2400, depth: 450, doors: 'hinged' },
  { id: 'bedroom', label: 'Спальня', hint: 'стандарт, купе', width: 2000, height: 2600, depth: 600, doors: 'sliding' },
  { id: 'dressing', label: 'Гардеробная', hint: 'широкий, купе', width: 2800, height: 2600, depth: 600, doors: 'sliding' },
  { id: 'kids', label: 'Детская', hint: 'средний, распашной', width: 1600, height: 2400, depth: 500, doors: 'hinged' },
  { id: 'niche', label: 'Ниша', hint: 'встроенный в стену', width: 1000, height: 2700, depth: 550, doors: 'hinged' },
  { id: 'open', label: 'Открытый', hint: 'стеллаж без дверей', width: 1600, height: 2200, depth: 400, doors: 'none' },
];

// ---------- Готовые наполнения ----------
export interface LayoutPreset {
  id: string;
  label: string;
  hint: string;
  doors: DoorsKind;
  sections: SectionConfig[];
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'dressing',
    label: 'Гардеробная',
    hint: 'штанги + полки',
    doors: 'sliding',
    sections: [
      createSection({ shelves: 1, rod: true }),
      createSection({ shelves: 6 }),
      createSection({ shelves: 1, rod: true }),
    ],
  },
  {
    id: 'combo',
    label: 'Комбинированный',
    hint: 'штанга, ящики, полки',
    doors: 'sliding',
    sections: [
      createSection({ shelves: 4, rod: true }),
      createSection({ shelves: 2, drawers: 3 }),
      createSection({ shelves: 4, rod: true }),
    ],
  },
  {
    id: 'shelves',
    label: 'Стеллаж',
    hint: 'только полки',
    doors: 'none',
    sections: [
      createSection({ shelves: 5 }),
      createSection({ shelves: 5 }),
      createSection({ shelves: 5 }),
    ],
  },
  {
    id: 'bedroom',
    label: 'Спальня',
    hint: 'полки + ящики',
    doors: 'hinged',
    sections: [
      createSection({ shelves: 3, rod: true }),
      createSection({ shelves: 2, drawers: 4 }),
    ],
  },
];

// ---------- Опции, которые добавим позже ----------
export interface FutureOption {
  id: string;
  label: string;
  hint: string;
  stage: 'v2' | 'v3';
}

/** Очередь развития конструктора. В UI показываем как «скоро». */
export const FUTURE_OPTIONS: FutureOption[] = [
  { id: 'mirror', label: 'Зеркало на двери', hint: 'встройка в фасад или накладное', stage: 'v2' },
  { id: 'glass', label: 'Стекло / витрина', hint: 'фасад из стекла с подсветкой', stage: 'v2' },
  { id: 'drawer-type', label: 'Тип ящиков', hint: 'роликовые / шариковые / доводчики', stage: 'v2' },
  { id: 'pantry', label: 'Пантограф', hint: 'лифт-штанга для верхнего яруса', stage: 'v3' },
] as const;
