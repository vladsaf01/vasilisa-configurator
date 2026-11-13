/**
 * Геометрия шкафа: габариты, секции, полки, ящики, створки.
 * Единственный источник правды для 3D-сцены, 2D-чертежа и цены.
 */
import {
  BACK,
  CabinetParams,
  DOOR_GAP,
  DOOR_OVERLAP,
  DOOR_T,
  DRAWER_H,
  HANG_LENGTH,
  HINGED_MAX_LEAF,
  LIMITS,
  MEZZANINE,
  PANEL,
  SHELF_BELT,
  clamp,
} from './model';
import { shelfPositions } from './geometry';

export interface SectionLayout {
  index: number;
  /** левая граница внутренней зоны секции, мм */
  x0: number;
  /** правая граница, мм */
  x1: number;
  /** внутренняя ширина секции, мм */
  width: number;
  /** низ зоны полок (над ящиками), мм от пола */
  yBottom: number;
  /** верх зоны полок, мм от пола */
  yTop: number;
  /** центры полок по высоте, мм от пола */
  shelvesY: number[];
  /** высота штанги, мм от пола */
  rodY: number | null;
  /** низ каждого ящика, мм от пола */
  drawerYs: number[];
}

export interface DoorLeafLayout {
  section: number;
  leaf: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z: number;
  kind: 'hinged' | 'sliding';
  /** ручка / профиль */
  handle: { x: number; y: number; h: number; w: number } | null;
}

export interface Layout {
  params: CabinetParams;
  width: number;
  height: number;
  depth: number;
  plinthH: number;
  /** внешний контур корпуса: y0 — над цоколем, z0 — задняя плоскость */
  outer: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  /** внутренняя зона */
  inner: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  sections: SectionLayout[];
  sectionWidth: number;
  mezzanineY: number | null;
  doors: DoorLeafLayout[];
  /** глубина полки, мм */
  shelfDepth: number;
  /** z-центр полки, мм */
  shelfZ: number;
  /** z-плоскость створок */
  doorZ: number;
}

export function buildLayout(params: CabinetParams): Layout {
  const W = params.width;
  const H = params.height;
  const D = params.depth;
  const plinthH = params.plinth;

  const outer = { x0: -W / 2, x1: W / 2, y0: plinthH, y1: H, z0: 0, z1: D };
  const inner = {
    x0: -W / 2 + PANEL,
    x1: W / 2 - PANEL,
    y0: plinthH + PANEL,
    y1: H - PANEL,
    z0: params.backPanel ? BACK : 0,
    z1: D,
  };

  const n = params.sections.length;
  const usable = inner.x1 - inner.x0;
  const sectionWidth = (usable - (n - 1) * PANEL) / n;

  // антресоль имеет смысл, если остаётся рабочая зона
  const mezzanineY: number | null =
    params.mezzanine && inner.y1 - MEZZANINE > inner.y0 + 400 ? inner.y1 - MEZZANINE : null;
  const shelfTop = mezzanineY ?? inner.y1;

  const sections: SectionLayout[] = params.sections.map((sec, i) => {
    const x0 = inner.x0 + i * (sectionWidth + PANEL);
    const x1 = x0 + sectionWidth;

    // ящики снизу, не выше половины рабочей зоны
    const maxDrawers = Math.floor(Math.max(0, shelfTop - inner.y0) / DRAWER_H / 2);
    const drawers = clamp(Math.round(sec.drawers), LIMITS.drawers.min, Math.min(LIMITS.drawers.max, maxDrawers));
    const drawerYs: number[] = [];
    for (let d = 0; d < drawers; d += 1) drawerYs.push(inner.y0 + d * DRAWER_H);

    const yBottom = Math.min(
      inner.y0 + drawers * DRAWER_H + (drawers > 0 ? 16 : 0),
      Math.max(inner.y0, shelfTop - 300),
    );
    const yTop = shelfTop;

    const shelfCount = clamp(Math.round(sec.shelves), LIMITS.shelves.min, LIMITS.shelves.max);
    let shelvesY: number[] = [];
    let rodY: number | null = null;

    if (sec.rod) {
      // Штанга нужна для одежды: под ней резервируем длину куртки (1100 мм),
      // а полки ставим только над штангой — иначе вешалки упираются в полки.
      const minRodY = yBottom + HANG_LENGTH;
      const maxRodY = Math.max(yBottom + 80, yTop - 70);
      const preferredRodY = yTop - shelfCount * SHELF_BELT;
      rodY = clamp(Math.max(minRodY, preferredRodY), minRodY, maxRodY);
      if (rodY > yTop - 40) {
        rodY = null;
        shelvesY = shelfPositions(yBottom, yTop, shelfCount);
      } else {
        shelvesY = shelfPositions(rodY + 40, yTop, shelfCount);
      }
    } else {
      shelvesY = shelfPositions(yBottom, yTop, shelfCount);
    }

    return { index: i, x0, x1, width: sectionWidth, yBottom, yTop, shelvesY, rodY, drawerYs };
  });

  // ---------- створки ----------
  const doors: DoorLeafLayout[] = [];
  const doorZ = D + DOOR_T / 2 + 2;

  if (params.doors === 'hinged') {
    // У каждой секции две стенки (боковина или перегородка). Проём секции —
    // между ними; на него ставится одна створка (одиночная дверь) или две
    // (двойная), каждая ровно половина проёма секции. Петли — на стенках секции.
    for (const s of sections) {
      const doorMode = params.sections[s.index]?.doorMode ?? 'auto';
      const autoLeaves = Math.min(2, Math.max(1, Math.ceil(s.width / HINGED_MAX_LEAF)));
      const leaves = doorMode === 'one' ? 1 : doorMode === 'two' ? 2 : autoLeaves;
      const leafW = s.width / leaves;
      const segments: Array<[number, number]> = mezzanineY
        ? [
            [outer.y0, mezzanineY - DOOR_GAP],
            [mezzanineY, H],
          ]
        : [[outer.y0, H]];
      for (const [y0, y1] of segments) {
        for (let l = 0; l < leaves; l += 1) {
          const x0 = s.x0 + l * leafW;
          const x1 = x0 + leafW;
          const hingeLeft = leaves === 1 ? true : l === 0;
          doors.push({
            section: s.index,
            leaf: l,
            x0,
            x1,
            y0,
            y1,
            z: doorZ,
            kind: 'hinged',
            handle: {
              x: hingeLeft ? x1 - 45 : x0 + 45,
              y: (y0 + y1) / 2,
              h: 200,
              w: 14,
            },
          });
        }
      }
    }
  } else if (params.doors === 'sliding') {
    // Створки-купе ходят внутри проёма между боковинами: их ширина считается
    // по внутреннему проёму (а не по наружной ширине), поэтому в открытом виде
    // они упираются в боковину и не выскакивают за габарит.
    const opening = inner.x1 - inner.x0;
    const leafCount = Math.max(2, Math.ceil(opening / 1500));
    const leafW = (opening + (leafCount - 1) * DOOR_OVERLAP) / leafCount;
    const step = leafCount > 1 ? (opening - leafW) / (leafCount - 1) : 0;
    for (let l = 0; l < leafCount; l += 1) {
      const center = inner.x0 + leafW / 2 + l * step;
      const x0 = center - leafW / 2;
      const x1 = center + leafW / 2;
      const z = D + 12 + (l % 2) * 22;
      doors.push({
        section: -1,
        leaf: l,
        x0,
        x1,
        y0: 12,
        y1: H - 40,
        z,
        kind: 'sliding',
        handle: { x: l % 2 === 0 ? x1 - 35 : x0 + 35, y: (H - 40) / 2, h: 400, w: 12 },
      });
    }
  }

  const shelfDepth = Math.max(80, D - inner.z0 - 10);
  const shelfZ = inner.z0 + shelfDepth / 2;

  return {
    params,
    width: W,
    height: H,
    depth: D,
    plinthH,
    outer,
    inner,
    sections,
    sectionWidth,
    mezzanineY,
    doors,
    shelfDepth,
    shelfZ,
    doorZ,
  };
}
