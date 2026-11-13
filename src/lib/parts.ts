/**
 * Детали шкафа. Каждая деталь — параллелепипед (или штанга-цилиндр)
 * в миллиметрах. 3D-сцена просто рисует этот список, 2D-чертёж и
 * спецификация берут данные отсюда же.
 *
 * Система координат (мм):
 *   x: 0 — центр шкафа, +x вправо
 *   y: 0 — пол, +y вверх
 *   z: 0 — задняя плоскость, +z к зрителю (передняя плоскость = depth)
 */
import { BACK, CabinetParams, DOOR_GAP, DOOR_T, DRAWER_H, PANEL } from './model';
import type { Layout } from './layout';
import type { MaterialKey } from './materials';

export type PartRole =
  | 'side'
  | 'bottom'
  | 'top'
  | 'divider'
  | 'shelf'
  | 'back'
  | 'plinth'
  | 'leg'
  | 'door'
  | 'doorLeaf'
  | 'doorFrame'
  | 'rail'
  | 'drawerFront'
  | 'drawerSide'
  | 'drawerBack'
  | 'drawerBottom'
  | 'drawerHandle'
  | 'handle'
  | 'light'
  | 'mezzanine'
  | 'track'
  | 'deck'
  | 'headboard'
  | 'headboardSide';

export interface Part {
  id: string;
  role: PartRole;
  label: string;
  /** размеры по осям, мм */
  w: number;
  h: number;
  d: number;
  /** центр, мм */
  x: number;
  y: number;
  z: number;
  material: MaterialKey;
  /**
   * Форма детали:
   * - box — параллелепипед (по умолчанию), скруглённый по рёбрам в сцене;
   * - cylinderX — цилиндр вдоль X (штанга);
   * - extrude — выдавливание профиля: изголовье, фигурный фасад с вырезом.
   */
  shape?: 'box' | 'cylinderX' | 'extrude';
  /**
   * Полигон профиля для extrude, мм, в локальных координатах детали
   * (0,0 — центр детали, u — вправо, v — вверх). Края не замыкаются: полигон
   * строится по порядку точек и закрывается автоматически.
   */
  profile?: Array<[number, number]>;
  /**
   * Плоскость профиля extrude:
   * - xy — фронтальная, выдавливание по Z (изголовье, фасад ящика);
   * - zy — боковая, выдавливание по X (боковина углового изголовья).
   */
  profilePlane?: 'xy' | 'zy';
  /** группа подвижных деталей: все части одного ящика двигаются вместе */
  group?: string;
  /** сторона петли для распашных дверей: pivot строится по этой стороне */
  doorHinge?: 'left' | 'right';
}

/** Толщина деталей корпуса ящика (дно, боковины, задняя стенка), мм. */
export const DRAWER_PANEL = 12;

export interface DrawerBoxInput {
  /** центр фасада ящика по X */
  x: number;
  /** центр фасада ящика по Y */
  y: number;
  /** z-центр фасада ящика */
  z: number;
  /** толщина фасада, мм */
  frontT: number;
  /** ширина фасада по наружным кромкам, мм */
  frontW: number;
  /** высота фасада, мм */
  frontH: number;
  /** задняя граница внутренней зоны (z), мм */
  backZ: number;
  /** группа для 3D-сцены */
  group: string;
  /** максимальная глубина корпуса ящика, мм */
  maxDepth?: number;
  material?: MaterialKey;
}

/**
 * Корпус выдвижного ящика: дно + две боковины + задняя стенка.
 * Спереди ящик закрыт фасадом (он приходит отдельной деталью), сверху открыт —
 * поэтому в выдвинутом виде видно полое отделение с дном.
 */
export function drawerBoxParts(input: DrawerBoxInput): Array<Omit<Part, 'id'>> {
  const sideT = DRAWER_PANEL;
  const material = input.material ?? 'body';
  const boxW = Math.max(120, input.frontW - 26);
  const boxH = Math.max(80, input.frontH - 30);
  // задняя плоскость фасада — передняя плоскость корпуса ящика
  const zFront = input.z - input.frontT / 2;
  const available = zFront - input.backZ - 10;
  const maxDepth = input.maxDepth ?? 500;
  const boxD = Math.max(180, Math.min(maxDepth, available));
  const zBack = zFront - boxD;
  const zCenter = zFront - boxD / 2;
  const yBottom = input.y - boxH / 2;
  const innerW = Math.max(60, boxW - 2 * sideT);

  return [
    {
      role: 'drawerSide',
      label: 'Боковина ящика',
      w: sideT,
      h: boxH,
      d: boxD,
      x: input.x - (boxW / 2 - sideT / 2),
      y: input.y,
      z: zCenter,
      material,
      group: input.group,
    },
    {
      role: 'drawerSide',
      label: 'Боковина ящика',
      w: sideT,
      h: boxH,
      d: boxD,
      x: input.x + (boxW / 2 - sideT / 2),
      y: input.y,
      z: zCenter,
      material,
      group: input.group,
    },
    {
      role: 'drawerBack',
      label: 'Задняя стенка ящика',
      w: innerW,
      h: boxH,
      d: sideT,
      x: input.x,
      y: input.y,
      z: zBack + sideT / 2,
      material,
      group: input.group,
    },
    {
      role: 'drawerBottom',
      label: 'Дно ящика',
      w: innerW,
      h: sideT,
      d: Math.max(60, boxD - sideT),
      x: input.x,
      y: yBottom + sideT / 2,
      z: zBack + (boxD + sideT) / 2,
      material,
      group: input.group,
    },
  ];
}

export function doorMaterial(p: CabinetParams): MaterialKey {
  if (p.doors === 'none') return 'facade';
  if (p.facade === 'mirror') return 'mirror';
  if (p.facade === 'glass') return 'glass';
  return 'facade';
}

export function buildParts(params: CabinetParams, layout: Layout): Part[] {
  const parts: Part[] = [];
  const push = (p: Omit<Part, 'id'>): void => {
    parts.push({ ...p, id: `${p.role}-${parts.length}` });
  };

  const W = layout.width;
  const H = layout.height;
  const D = layout.depth;
  const { outer, inner } = layout;
  const interiorDepth = inner.z1 - inner.z0;
  const interiorZ = inner.z0 + interiorDepth / 2;
  const carcassH = outer.y1 - outer.y0;
  const carcassY = (outer.y0 + outer.y1) / 2;
  const sectionCount = layout.sections.length;

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
    y: outer.y0 + PANEL / 2,
    z: interiorZ,
    material: 'body',
  });

  push({
    role: 'top',
    label: 'Крыша',
    w: W - 2 * PANEL,
    h: PANEL,
    d: interiorDepth,
    x: 0,
    y: outer.y1 - PANEL / 2,
    z: interiorZ,
    material: 'body',
  });

  for (let i = 1; i < sectionCount; i += 1) {
    const xCenter = inner.x0 + i * layout.sectionWidth + (i - 1) * PANEL + PANEL / 2;
    push({
      role: 'divider',
      label: 'Вертикальная перегородка',
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

  if (layout.plinthH > 0) {
    push({
      role: 'plinth',
      label: 'Цоколь',
      w: W,
      h: layout.plinthH,
      d: 40,
      x: 0,
      y: layout.plinthH / 2,
      z: D - 50 - 20,
      material: 'plinth',
    });
  }

  // ---------- полки, штанги, ящики ----------
  for (const sec of layout.sections) {
    const xCenter = (sec.x0 + sec.x1) / 2;

    for (const y of sec.shelvesY) {
      push({
        role: 'shelf',
        label: 'Полка',
        w: sec.width,
        h: PANEL,
        d: layout.shelfDepth,
        x: xCenter,
        y,
        z: layout.shelfZ,
        material: 'body',
      });
    }

    if (sec.rodY !== null) {
      push({
        role: 'rail',
        label: 'Штанга',
        w: Math.max(120, sec.width - 24),
        h: 25,
        d: 25,
        x: xCenter,
        y: sec.rodY,
        z: inner.z0 + interiorDepth * 0.55,
        material: 'metal',
        shape: 'cylinderX',
      });
    }

    for (let drawerIndex = 0; drawerIndex < sec.drawerYs.length; drawerIndex += 1) {
      const drawerY = sec.drawerYs[drawerIndex];
      const frontH = DRAWER_H - 8;
      const group = `drawer-${sec.index}-${drawerIndex}`;
      push({
        role: 'drawerFront',
        label: 'Фасад ящика',
        w: sec.width - 4,
        h: frontH,
        d: DOOR_T,
        x: xCenter,
        y: drawerY + DRAWER_H / 2,
        z: inner.z1 - DOOR_T / 2,
        // ящик внутри — корпусный материал: он виден через стеклянные двери
        material: 'body',
        group,
      });
      for (const boxPart of drawerBoxParts({
        x: xCenter,
        y: drawerY + DRAWER_H / 2,
        z: inner.z1 - DOOR_T / 2,
        frontT: DOOR_T,
        frontW: sec.width - 4,
        frontH,
        backZ: inner.z0,
        group,
        maxDepth: 500,
      })) {
        push(boxPart);
      }
      push({
        role: 'drawerHandle',
        label: 'Ручка ящика',
        w: Math.min(240, Math.max(120, sec.width * 0.4)),
        h: 14,
        d: 14,
        x: xCenter,
        y: drawerY + DRAWER_H - 42,
        z: inner.z1 + 8,
        material: 'metal',
        group,
      });
    }
  }

  if (layout.mezzanineY !== null) {
    push({
      role: 'mezzanine',
      label: 'Полка антресоли',
      w: W - 2 * PANEL,
      h: PANEL,
      d: layout.shelfDepth,
      x: 0,
      y: layout.mezzanineY,
      z: layout.shelfZ,
      material: 'body',
    });
  }

  // ---------- створки ----------
  const facadeMat = doorMaterial(params);
  for (const leaf of layout.doors) {
    push({
      role: 'door',
      label: leaf.kind === 'sliding' ? 'Дверь-купе' : 'Фасад распашной',
      w: Math.max(60, leaf.x1 - leaf.x0 - DOOR_GAP),
      h: Math.max(60, leaf.y1 - leaf.y0 - DOOR_GAP),
      d: DOOR_T,
      x: (leaf.x0 + leaf.x1) / 2,
      y: (leaf.y0 + leaf.y1) / 2,
      z: leaf.z,
      material: facadeMat,
    });
    if (leaf.handle) {
      push({
        role: 'handle',
        label: leaf.kind === 'sliding' ? 'Профиль-ручка' : 'Ручка',
        w: leaf.handle.w,
        h: leaf.handle.h,
        d: leaf.kind === 'sliding' ? 18 : 14,
        x: leaf.handle.x,
        y: leaf.handle.y,
        z: leaf.z + DOOR_T / 2 + 8,
        material: 'metal',
      });
    }
  }

  if (params.doors === 'sliding') {
    push({
      role: 'track',
      label: 'Трек верхний',
      w: W,
      h: 40,
      d: 80,
      x: 0,
      y: H - 20,
      z: D + 22,
      material: 'track',
    });
  }

  // ---------- подсветка ----------
  if (params.lighting) {
    const lightY: number[] = [];
    if (layout.mezzanineY !== null) lightY.push(layout.mezzanineY - PANEL / 2 - 8);
    else lightY.push(inner.y1 - PANEL - 8);
    for (const sec of layout.sections) {
      for (const y of lightY) {
        push({
          role: 'light',
          label: 'LED-подсветка',
          w: Math.max(80, sec.width - 60),
          h: 8,
          d: 12,
          x: (sec.x0 + sec.x1) / 2,
          y,
          z: inner.z1 - 40,
          material: 'light',
        });
      }
      for (const shelfY of sec.shelvesY) {
        push({
          role: 'light',
          label: 'LED-подсветка полки',
          w: Math.max(80, sec.width - 60),
          h: 8,
          d: 12,
          x: (sec.x0 + sec.x1) / 2,
          y: shelfY - PANEL / 2 - 8,
          z: inner.z1 - 40,
          material: 'light',
        });
      }
    }
  }

  return parts;
}
