/**
 * Доступ к ящикам: где створки перекрывают ящики, куда сдвигаются двери-купе
 * при открытии и какие ящики можно выдвинуть.
 *
 * Модуль общий для 3D-сцены и интерфейса: сцена берёт сдвиги створок
 * и блокировки, панель — те же данные для сообщений.
 */
import { DOOR_GAP, PANEL, type DoorsKind } from './model';
import type { DoorLeafLayout } from './layout';

/** Сторона, к которой собираются створки-купе при открытии. */
export type DoorSide = 'left' | 'right';

export interface DrawerRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DrawerAccessSize {
  /** ширина изделия, мм */
  width: number;
}

export interface DrawerAccess {
  /** сдвиг каждой створки при открытии, мм (по порядку doors) */
  shifts: number[];
  /** створки в открытом положении */
  openedDoors: DoorLeafLayout[];
  /** ящик прикрыт дверью в закрытом положении — сначала открываем двери */
  needsDoor: boolean[];
  /** ящик остаётся за створкой даже в открытом положении — выдвинуть нельзя */
  blocked: boolean[];
  /** общий флаг: хотя бы один ящик требует открытия дверей */
  anyNeedsDoor: boolean;
  /** общий флаг: хотя бы один ящик перекрыт */
  anyBlocked: boolean;
  /** куда собраны створки-купе; null — дверей нет или они распашные */
  side: DoorSide | null;
}

const COVER_OVERLAP_X = 2;
const COVER_OVERLAP_Y = 2;

/**
 * Допустимое перекрытие ящика краем створки: створки-купе всегда нахлёстываются
 * и краем заходят на соседнюю секцию. Мелкий нахлёст (до 15 % ширины ящика,
 * но не больше 60 мм) не мешает выдвинуть ящик.
 */
function blockLimit(drawerWidth: number): number {
  return Math.max(60, drawerWidth * 0.15);
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Створка так, как её рисует сцена: с зазором DOOR_GAP по краям. */
function drawnRect(leaf: DoorLeafLayout): DrawerRect {
  return {
    x0: leaf.x0 + DOOR_GAP / 2,
    x1: leaf.x1 - DOOR_GAP / 2,
    y0: leaf.y0 + DOOR_GAP / 2,
    y1: leaf.y1 - DOOR_GAP / 2,
  };
}

function covers(drawer: DrawerRect, door: DrawerRect, thresholdX: number): boolean {
  return (
    overlap(drawer.x0, drawer.x1, door.x0, door.x1) > thresholdX &&
    overlap(drawer.y0, drawer.y1, door.y0, door.y1) > COVER_OVERLAP_Y
  );
}

function emptyAccess(doors: DoorLeafLayout[], drawers: DrawerRect[]): DrawerAccess {
  return {
    shifts: doors.map(() => 0),
    openedDoors: doors,
    needsDoor: drawers.map(() => false),
    blocked: drawers.map(() => false),
    anyNeedsDoor: false,
    anyBlocked: false,
    side: null,
  };
}

interface SideScore {
  blocked: number;
  overlap: number;
}

/** Чем меньше ящиков остаётся за дверьми — тем лучше сторона для створок. */
function scoreSide(opened: DoorLeafLayout[], drawers: DrawerRect[]): SideScore {
  const rects = opened.map(drawnRect);
  let blocked = 0;
  let overlapSum = 0;
  for (const drawer of drawers) {
    const limit = blockLimit(drawer.x1 - drawer.x0);
    let isBlocked = false;
    for (const rect of rects) {
      const overlapX = overlap(drawer.x0, drawer.x1, rect.x0, rect.x1);
      const overlapY = overlap(drawer.y0, drawer.y1, rect.y0, rect.y1);
      if (overlapY <= COVER_OVERLAP_Y) continue;
      overlapSum += overlapX;
      if (overlapX > limit) isBlocked = true;
    }
    if (isBlocked) blocked += 1;
  }
  return { blocked, overlap: overlapSum };
}

/**
 * Разбор доступа к ящикам.
 *
 * Распашные створки при открытии уходят в сторону и ящики не перекрывают.
 * Купе собираются у одного края проёма; по умолчанию выбирается сторона,
 * где остаётся меньше перекрытых ящиков. Сторону можно задать явно (side).
 */
export function analyzeDrawerAccess(
  doors: DoorLeafLayout[],
  doorsKind: DoorsKind,
  size: DrawerAccessSize,
  drawers: DrawerRect[],
  side: DoorSide | null = null,
): DrawerAccess {
  if (doors.length === 0 || doorsKind === 'none') {
    return emptyAccess(doors, drawers);
  }

  const closed = doors.map(drawnRect);
  const needsDoor = drawers.map((drawer) =>
    closed.some((rect) => covers(drawer, rect, COVER_OVERLAP_X)),
  );

  if (doorsKind === 'hinged') {
    // распашные створки открываются наружу и освобождают проём целиком
    return {
      shifts: doors.map(() => 0),
      openedDoors: doors,
      needsDoor,
      blocked: drawers.map(() => false),
      anyNeedsDoor: needsDoor.some(Boolean),
      anyBlocked: false,
      side: null,
    };
  }

  const shiftsFor = (target: DoorSide): number[] =>
    doors.map((leaf) => {
      // створки ходят внутри проёма между боковинами и упираются в них
      const opening = size.width - 2 * PANEL;
      const leafW = leaf.x1 - leaf.x0;
      const center = (leaf.x0 + leaf.x1) / 2;
      const targetCenter =
        target === 'left' ? -opening / 2 + leafW / 2 : opening / 2 - leafW / 2;
      return targetCenter - center;
    });

  const openedFor = (shifts: number[]): DoorLeafLayout[] =>
    doors.map((leaf, index) => ({
      ...leaf,
      x0: leaf.x0 + shifts[index],
      x1: leaf.x1 + shifts[index],
    }));

  let chosen: DoorSide;
  if (side) {
    chosen = side;
  } else {
    const leftOpened = openedFor(shiftsFor('left'));
    const rightOpened = openedFor(shiftsFor('right'));
    const leftScore = scoreSide(leftOpened, drawers);
    const rightScore = scoreSide(rightOpened, drawers);
    chosen =
      rightScore.blocked < leftScore.blocked ||
      (rightScore.blocked === leftScore.blocked && rightScore.overlap < leftScore.overlap - 0.5)
        ? 'right'
        : 'left';
  }

  const shifts = shiftsFor(chosen);
  const openedDoors = openedFor(shifts);
  const openedRects = openedDoors.map(drawnRect);
  const blocked = drawers.map((drawer) =>
    openedRects.some((rect) => covers(drawer, rect, blockLimit(drawer.x1 - drawer.x0))),
  );

  return {
    shifts,
    openedDoors,
    needsDoor,
    blocked,
    anyNeedsDoor: needsDoor.some(Boolean),
    anyBlocked: blocked.some(Boolean),
    side: chosen,
  };
}
