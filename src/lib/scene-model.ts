/**
 * Общее описание сцены для 3D: габариты, детали, створки и отделки.
 * Шкаф и комод приводятся к этому формату, поэтому сцена одна на всё.
 */
import type { BodyFinish, CabinetParams, DoorsKind, FacadeFinish } from './model';
import type { DoorLeafLayout, Layout } from './layout';
import { buildParts, type Part } from './parts';

export interface SceneModel {
  width: number;
  height: number;
  depth: number;
  parts: Part[];
  /** створки шкафа (у комода, тумбы и кровати пусто) */
  doors: DoorLeafLayout[];
  doorsKind: DoorsKind;
  lighting: boolean;
  body: BodyFinish;
  facade: FacadeFinish;
  /** декор столешницы и изголовья кровати; у шкафа/комода/тумбы не задан */
  deck?: BodyFinish;
}

/** Сцена встроенного шкафа из готовых params + layout. */
export function wardrobeScene(params: CabinetParams, layout: Layout): SceneModel {
  return {
    width: params.width,
    height: params.height,
    depth: params.depth,
    parts: buildParts(params, layout),
    doors: layout.doors,
    doorsKind: params.doors,
    lighting: params.lighting,
    body: params.body,
    facade: params.facade,
  };
}
