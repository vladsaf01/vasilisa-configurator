/**
 * Ориентировочный расчёт цены. Ставки — константы ниже, их правит владелец
 * (или CMS), а не пользователь. Все суммы в рублях.
 */
import {
  BODY_LABEL,
  CabinetParams,
  DOORS_LABEL,
  FACADE_LABEL,
  FacadeFinish,
  PANEL,
  totalDrawers,
  totalRods,
} from './model';
import type { Layout } from './layout';
import { areaM2, m2, round100 } from './format';

const BODY_RATE = 2600; // ₽/м² ЛДСП 16 мм с кромкой и крепежом
const BACK_RATE = 450; // ₽/м² ДВП 3,2 мм
const FACADE_RATE_SLIDING = 6700; // ₽/м² дверь-купе с профилем
const FACADE_RATE_HINGED = 5600; // ₽/м² распашной фасад
const FACADE_MULT = {
  same: 1,
  mirror: 1.75,
  glass: 1.6,
} as const;
const HINGE_PER_LEAF = 900; // петли, ручки, ответные планки
const SLIDING_MECH = 9500; // ролики, трек, стопоры
const DRAWER = 1700; // ящик с направляющими
const RAIL = 750; // штанга с держателями
const LIGHT_PER_M = 1300; // ₽/м LED-ленты
const LIGHT_PSU = 2600; // блок питания
const ASSEMBLY_RATE = 0.12;
const ASSEMBLY_MIN = 6500;
const DELIVERY = 3500;

export interface PriceLine {
  key: string;
  label: string;
  detail?: string;
  amount: number;
}

export interface PriceResult {
  lines: PriceLine[];
  /** стоимость изделия без монтажа и доставки */
  goods: number;
  assembly: number;
  delivery: number;
  total: number;
  /** справочно, для карточки */
  bodyArea: number;
  facadeArea: number;
}

export function calcPrice(params: CabinetParams, layout: Layout): PriceResult {
  const W = layout.width;
  const H = layout.height;
  const D = layout.depth;
  const plinth = params.plinth;

  const sideArea = 2 * ((H - plinth) * D);
  const bottomTopArea = 2 * (W - 2 * PANEL) * (layout.inner.z1 - layout.inner.z0);
  const dividerArea =
    (layout.sections.length - 1) * (layout.inner.y1 - layout.inner.y0) * (layout.inner.z1 - layout.inner.z0);
  const shelfArea = layout.sections.reduce(
    (sum, sec) => sum + sec.shelvesY.length * sec.width * layout.shelfDepth,
    0,
  );
  const mezzanineArea = layout.mezzanineY !== null ? (W - 2 * PANEL) * layout.shelfDepth : 0;
  const bodyArea = m2((sideArea + bottomTopArea + dividerArea + shelfArea + mezzanineArea) / 1_000_000);

  const backArea = params.backPanel ? m2(((W - 2 * PANEL) * (layout.inner.y1 - layout.inner.y0)) / 1_000_000) : 0;

  const facadeArea = m2(
    layout.doors.reduce((sum, leaf) => sum + (leaf.x1 - leaf.x0) * (leaf.y1 - leaf.y0), 0) / 1_000_000,
  );

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

  if (params.doors !== 'none' && facadeArea > 0) {
    const base = params.doors === 'sliding' ? FACADE_RATE_SLIDING : FACADE_RATE_HINGED;
    const rate = Math.round(base * FACADE_MULT[params.facade]);
    lines.push({
      key: 'facade',
      label: `Фасады: ${DOORS_LABEL[params.doors].toLowerCase()}, ${FACADE_LABEL[params.facade].toLowerCase()}`,
      detail: `${areaM2(facadeArea)} · ${rate} ₽/м²`,
      amount: Math.round(facadeArea * rate),
    });

    if (params.doors === 'sliding') {
      lines.push({ key: 'mech', label: 'Механизм дверей-купе', amount: SLIDING_MECH });
    } else {
      lines.push({
        key: 'mech',
        label: 'Петли, ручки, ответные планки',
        detail: `${layout.doors.length} шт.`,
        amount: layout.doors.length * HINGE_PER_LEAF,
      });
    }
  }

  const drawers = totalDrawers(params);
  if (drawers > 0) {
    lines.push({
      key: 'drawers',
      label: 'Ящики с направляющими',
      detail: `${drawers} шт.`,
      amount: drawers * DRAWER,
    });
  }

  const rods = totalRods(params);
  if (rods > 0) {
    lines.push({ key: 'rails', label: 'Штанги для одежды', detail: `${rods} шт.`, amount: rods * RAIL });
  }

  if (params.lighting) {
    const meters = m2((W / 1000) * 1.6);
    lines.push({
      key: 'light',
      label: 'LED-подсветка полок',
      detail: `≈ ${meters.toFixed(1).replace('.', ',')} м ленты + блок питания`,
      amount: Math.round(meters * LIGHT_PER_M) + LIGHT_PSU,
    });
  }

  const goods = lines.reduce((sum, line) => sum + line.amount, 0);
  const assembly = Math.max(ASSEMBLY_MIN, round100(goods * ASSEMBLY_RATE));
  const total = round100(goods + assembly + DELIVERY);

  return { lines, goods, assembly, delivery: DELIVERY, total, bodyArea, facadeArea };
}

export const PRICE_RATES = {
  BODY_RATE,
  BACK_RATE,
  FACADE_RATE_SLIDING,
  FACADE_RATE_HINGED,
  SLIDING_MECH,
  DRAWER,
  RAIL,
  DELIVERY,
  ASSEMBLY_RATE,
  ASSEMBLY_MIN,
  LIGHT_PER_M,
  LIGHT_PSU,
} as const;

export function bodyFinishLabel(params: CabinetParams): string {
  return BODY_LABEL[params.body];
}

/** Коэффициент наценки на отделку фасада (зеркало/стекло дороже). */
export function facadeMultiplier(finish: FacadeFinish): number {
  return FACADE_MULT[finish];
}

