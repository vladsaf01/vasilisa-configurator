/**
 * Материалы и цвета. Ключи материалов используются деталями (parts.ts),
 * конкретные цвета зависят от выбранной отделки (model.ts).
 */
import type { BodyFinish, CabinetParams, DoorsKind, FacadeFinish } from './model';

export type MaterialKey =
  | 'body'
  | 'facade'
  | 'back'
  | 'plinth'
  | 'metal'
  | 'track'
  | 'light'
  | 'glass'
  | 'mirror'
  | 'deck'
  | 'recess';

export interface MaterialSpec {
  color: number;
  roughness: number;
  metalness: number;
  opacity?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

const BODY_COLOR: Record<BodyFinish, number> = {
  white: 0xe9e3d8,
  oak: 0xb98a5c,
  graphite: 0x3c3a36,
  cashmere: 0xd8c3a5,
};

const FACADE_COLOR: Record<Exclude<FacadeFinish, 'same'>, number> = {
  mirror: 0xc9d6db,
  glass: 0x9fb7bb,
};

function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

/** #rrggbb для CSS-свотчей в интерфейсе. */
export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function bodyColor(finish: BodyFinish): number {
  return BODY_COLOR[finish];
}

/** Цвет столешницы и изголовья кровати: свой декор или в цвет корпуса. */
export function deckColor(finish: BodyFinish | undefined, body: BodyFinish): number {
  return BODY_COLOR[finish ?? body];
}

export function facadeColor(finish: FacadeFinish, body: BodyFinish): number {
  return finish === 'same' ? BODY_COLOR[body] : FACADE_COLOR[finish];
}

/** Материал полотна фасада без учёта типа дверей. */
export function facadeMaterialKey(finish: FacadeFinish): MaterialKey {
  if (finish === 'mirror') return 'mirror';
  if (finish === 'glass') return 'glass';
  return 'facade';
}

/** Материал фасада с учётом дверей и отделки. */
export function doorMaterialFor(finish: FacadeFinish, doors: DoorsKind): MaterialKey {
  if (doors === 'none') return 'facade';
  return facadeMaterialKey(finish);
}

export function resolveMaterials(
  p: Pick<CabinetParams, 'body' | 'facade'> & { deck?: BodyFinish },
): Record<MaterialKey, MaterialSpec> {
  const body = BODY_COLOR[p.body];
  const facade = facadeColor(p.facade, p.body);
  return {
    body: { color: body, roughness: 0.72, metalness: 0.04 },
    facade: { color: facade, roughness: 0.58, metalness: 0.05 },
    back: { color: shade(body, 0.78), roughness: 0.94, metalness: 0 },
    plinth: { color: shade(body, 0.68), roughness: 0.8, metalness: 0.02 },
    metal: { color: 0x9ba1a6, roughness: 0.32, metalness: 0.92 },
    track: { color: 0x4b453d, roughness: 0.82, metalness: 0.35 },
    light: {
      color: 0xfff3dc,
      roughness: 0.4,
      metalness: 0,
      emissive: 0xffd9a0,
      emissiveIntensity: 1.6,
    },
    glass: { color: 0x9fb7bb, roughness: 0.05, metalness: 0.12, opacity: 0.44 },
    mirror: { color: 0xc9d6db, roughness: 0.03, metalness: 1 },
    // Столешница и изголовье кровати: тёплый декор ЛДСП, чуть матовее корпуса.
    deck: { color: deckColor(p.deck, p.body), roughness: 0.64, metalness: 0.03 },
    // Тёмная внутренняя поверхность выреза-ручки в фасаде ящика.
    recess: { color: 0x24211d, roughness: 0.97, metalness: 0 },
  };
}
