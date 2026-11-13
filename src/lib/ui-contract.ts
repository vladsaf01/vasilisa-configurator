/**
 * Контракты между слоями: App (Lead) ↔ 3D-сцена ↔ панели управления.
 * Менять только вместе с реализациями.
 */
import type { CabinetParams } from './model';
import type { Layout } from './layout';
import type { PriceResult } from './price';
import type { SceneModel } from './scene-model';
import type { DresserLayout, DresserParams } from './dresser';
import type { TumbaParams } from './tumba';
import type { BedLayout, BedParams } from './bed';
import type { DoorSide } from './access';

export type ProductKind = 'wardrobe' | 'dresser' | 'tumba' | 'bed';

export type ViewPreset = 'hero' | 'front' | 'side';

export interface CabinetViewApi {
  /** занять кадр под ракурс */
  setView: (preset: ViewPreset) => void;
  /** PNG dataURL текущего кадра */
  screenshot: () => string | null;
}

export interface CabinetViewProps {
  model: SceneModel;
  view: ViewPreset;
  showDimensions: boolean;
  /** распахнуть створки, чтобы показать наполнение (только шкаф) */
  doorsOpen?: boolean;
  /** выдвинуть ящики (комод и шкаф) */
  drawersOpen?: boolean;
  /** к какой стороне собрать створки-купе; null — автоматически */
  doorSide?: DoorSide | null;
  /** передаёт наружу императивное API (сброс камеры, скриншот) */
  onReady?: (api: CabinetViewApi) => void;
}

export interface ControlPanelActions {
  copyQuote: () => void;
  whatsapp: () => void;
  telegram: () => void;
  downloadPng: () => void;
  downloadSpec: () => void;
  downloadQuote: () => void;
}

export interface ControlPanelProps {
  params: CabinetParams;
  layout: Layout;
  price: PriceResult;
  onChange: (next: CabinetParams) => void;
  onReset: () => void;
  actions: ControlPanelActions;
  status: { copied: boolean };
  hasScreenshot: boolean;
}

/** Переключатель типа мебели в шапке панели. */
export interface ProductSwitchProps {
  product: ProductKind;
  onChange: (product: ProductKind) => void;
}

/** Панель комода. */
export interface DresserPanelProps {
  params: DresserParams;
  layout: DresserLayout;
  price: PriceResult;
  onChange: (next: DresserParams) => void;
  onReset: () => void;
  actions: ControlPanelActions;
  status: { copied: boolean };
  hasScreenshot: boolean;
}

/** Панель тумбы: те же блоки, что у комода, но свои ограничения и пресеты. */
export interface TumbaPanelProps {
  params: TumbaParams;
  layout: DresserLayout;
  price: PriceResult;
  onChange: (next: TumbaParams) => void;
  onReset: () => void;
  actions: ControlPanelActions;
  status: { copied: boolean };
  hasScreenshot: boolean;
}

/** Панель кровати: свои габариты, изголовье, ящики и декор столешницы. */
export interface BedPanelProps {
  params: BedParams;
  layout: BedLayout;
  price: PriceResult;
  onChange: (next: BedParams) => void;
  onReset: () => void;
  actions: ControlPanelActions;
  status: { copied: boolean };
  hasScreenshot: boolean;
}
