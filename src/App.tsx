import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import logoMark from './assets/logo-mark.png';
import { CabinetView } from './scene/CabinetView';
import { ControlPanel } from './ui/ControlPanel';
import { DresserPanel } from './ui/DresserPanel';
import { TumbaPanel } from './ui/TumbaPanel';
import { BedPanel } from './ui/BedPanel';
import { ProductSwitch } from './ui/ProductSwitch';
import { buildLayout } from './lib/layout';
import { calcPrice } from './lib/price';
import {
  CabinetParams,
  DEFAULT_PARAMS,
  DRAWER_H,
  cloneParams,
  normalizeParams,
  totalDrawers,
} from './lib/model';
import {
  DRESSER_DEFAULT,
  DresserParams,
  buildDresserLayout,
  calcDresserPrice,
  cloneDresserParams,
  dresserScene,
  normalizeDresserParams,
} from './lib/dresser';
import { wardrobeScene } from './lib/scene-model';
import {
  TUMBA_DEFAULT,
  TumbaParams,
  buildTumbaLayout,
  calcTumbaPrice,
  cloneTumbaParams,
  normalizeTumbaParams,
  tumbaScene,
} from './lib/tumba';
import {
  BED_DEFAULT,
  BedParams,
  bedScene,
  buildBedLayout,
  calcBedPrice,
  cloneBedParams,
  normalizeBedParams,
} from './lib/bed';
import {
  bedSpecCsv,
  buildBedQuoteText,
  buildDresserQuoteText,
  buildQuoteText,
  buildTumbaQuoteText,
  dresserSpecCsv,
  downloadFile,
  downloadPng,
  fileStamp,
  specCsv,
  telegramUrl,
  tumbaSpecCsv,
  whatsappUrl,
} from './lib/quote';
import type { CabinetViewApi, ProductKind, ViewPreset } from './lib/ui-contract';
import { analyzeDrawerAccess, type DoorSide, type DrawerRect } from './lib/access';
import { SITE } from './lib/site';
import './styles.css';

const STORAGE_KEY = 'vasilisa.configurator.v2';

interface StoredState {
  product: ProductKind;
  wardrobe: CabinetParams;
  dresser: DresserParams;
  tumba: TumbaParams;
  bed: BedParams;
}

function defaultState(): StoredState {
  return {
    product: 'wardrobe',
    wardrobe: cloneParams(DEFAULT_PARAMS),
    dresser: cloneDresserParams(DRESSER_DEFAULT),
    tumba: cloneTumbaParams(TUMBA_DEFAULT),
    bed: cloneBedParams(BED_DEFAULT),
  };
}

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      product:
        parsed.product === 'dresser' || parsed.product === 'tumba' || parsed.product === 'bed'
          ? parsed.product
          : 'wardrobe',
      wardrobe: normalizeParams(parsed.wardrobe),
      dresser: normalizeDresserParams(parsed.dresser),
      tumba: normalizeTumbaParams(parsed.tumba),
      bed: normalizeBedParams(parsed.bed),
    };
  } catch {
    return defaultState();
  }
}

export default function App() {
  const initial = useRef<StoredState | null>(null);
  if (initial.current === null) initial.current = loadState();

  const [product, setProduct] = useState<ProductKind>(initial.current.product);
  const [wardrobe, setWardrobe] = useState<CabinetParams>(initial.current.wardrobe);
  const [dresser, setDresser] = useState<DresserParams>(initial.current.dresser);
  const [tumba, setTumba] = useState<TumbaParams>(initial.current.tumba);
  const [bed, setBed] = useState<BedParams>(initial.current.bed);
  const [showDimensions, setShowDimensions] = useState(true);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [drawersOpen, setDrawersOpen] = useState(false);
  /** выбранная сторона створок-купе; null — автоматически */
  const [doorSide, setDoorSide] = useState<DoorSide | null>(null);
  const [view, setView] = useState<ViewPreset>('hero');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const viewApi = useRef<CabinetViewApi | null>(null);

  const wardrobeLayout = useMemo(() => buildLayout(wardrobe), [wardrobe]);
  const wardrobePrice = useMemo(() => calcPrice(wardrobe, wardrobeLayout), [wardrobe, wardrobeLayout]);
  const wardrobeModel = useMemo(() => wardrobeScene(wardrobe, wardrobeLayout), [wardrobe, wardrobeLayout]);

  const dresserLayout = useMemo(() => buildDresserLayout(dresser), [dresser]);
  const dresserPrice = useMemo(() => calcDresserPrice(dresser, dresserLayout), [dresser, dresserLayout]);
  const dresserModel = useMemo(() => dresserScene(dresser, dresserLayout), [dresser, dresserLayout]);

  const tumbaLayout = useMemo(() => buildTumbaLayout(tumba), [tumba]);
  const tumbaPrice = useMemo(() => calcTumbaPrice(tumba, tumbaLayout), [tumba, tumbaLayout]);
  const tumbaModel = useMemo(() => tumbaScene(tumba, tumbaLayout), [tumba, tumbaLayout]);

  const bedLayout = useMemo(() => buildBedLayout(bed), [bed]);
  const bedPrice = useMemo(() => calcBedPrice(bed, bedLayout), [bed, bedLayout]);
  const bedModel = useMemo(() => bedScene(bed, bedLayout), [bed, bedLayout]);

  const isWardrobe = product === 'wardrobe';
  const isDresser = product === 'dresser';
  const isTumba = product === 'tumba';
  const model = isWardrobe
    ? wardrobeModel
    : isDresser
      ? dresserModel
      : isTumba
        ? tumbaModel
        : bedModel;
  const canOpenDoors = isWardrobe
    ? wardrobe.doors !== 'none'
    : isDresser
      ? dresserLayout.doors.length > 0
      : isTumba
        ? tumbaLayout.doors.length > 0
        : false;
  const hasDrawers = isWardrobe
    ? totalDrawers(wardrobe) > 0
    : isDresser
      ? dresserLayout.drawerFronts.length > 0
      : isTumba
        ? tumbaLayout.drawerFronts.length > 0
        : bedLayout.drawerFronts.length > 0;

  /** отложенные шаги анимации: сначала двери, потом ящики (и наоборот) */
  const drawerDelay = useRef<number | null>(null);
  const doorDelay = useRef<number | null>(null);

  const clearDelays = useCallback(() => {
    if (drawerDelay.current !== null) {
      window.clearTimeout(drawerDelay.current);
      drawerDelay.current = null;
    }
    if (doorDelay.current !== null) {
      window.clearTimeout(doorDelay.current);
      doorDelay.current = null;
    }
  }, []);

  useEffect(() => clearDelays, [clearDelays]);

  // Зоны фасадов ящиков шкафа: по ним считаем, перекрывают ли их створки.
  const wardrobeDrawerZones = useMemo<Array<{ section: number; rect: DrawerRect }>>(() => {
    if (!isWardrobe) return [];
    const zones: Array<{ section: number; rect: DrawerRect }> = [];
    for (const section of wardrobeLayout.sections) {
      for (const y of section.drawerYs) {
        zones.push({
          section: section.index + 1,
          rect: { x0: section.x0 + 2, x1: section.x1 - 2, y0: y + 4, y1: y + DRAWER_H - 8 },
        });
      }
    }
    return zones;
  }, [isWardrobe, wardrobeLayout]);

  const drawerAccess = useMemo(() => {
    if (!isWardrobe) return null;
    return analyzeDrawerAccess(
      wardrobeLayout.doors,
      wardrobe.doors,
      { width: wardrobe.width },
      wardrobeDrawerZones.map((zone) => zone.rect),
      doorSide,
    );
  }, [doorSide, isWardrobe, wardrobe, wardrobeLayout, wardrobeDrawerZones]);

  const blockedSections = useMemo(() => {
    if (!drawerAccess) return [] as number[];
    const sections = new Set<number>();
    wardrobeDrawerZones.forEach((zone, index) => {
      if (drawerAccess.blocked[index]) sections.add(zone.section);
    });
    return Array.from(sections).sort((a, b) => a - b);
  }, [drawerAccess, wardrobeDrawerZones]);

  const needsDoorsForDrawers = drawerAccess?.anyNeedsDoor ?? false;

  useEffect(() => {
    // если ящики перекрыты, их нельзя оставлять «открытыми» в состоянии
    if (isWardrobe && drawersOpen && !doorsOpen && needsDoorsForDrawers) {
      setDrawersOpen(false);
    }
  }, [isWardrobe, drawersOpen, doorsOpen, needsDoorsForDrawers]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ product, wardrobe, dresser, tumba, bed }),
      );
    } catch {
      /* приватный режим — просто не сохраняем */
    }
  }, [product, wardrobe, dresser, tumba, bed]);

  useEffect(() => {
    document.title = isWardrobe
      ? 'Конструктор встроенного шкафа — Василиса'
      : isDresser
        ? 'Конструктор комода — Василиса'
        : isTumba
          ? 'Конструктор тумбы — Василиса'
          : 'Конструктор кровати — Василиса';
  }, [isWardrobe, isDresser, isTumba]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const quoteText = useMemo(() => {
    if (isWardrobe) return buildQuoteText(wardrobe, wardrobeLayout, wardrobePrice);
    if (isDresser) return buildDresserQuoteText(dresser, dresserLayout, dresserPrice);
    if (isTumba) return buildTumbaQuoteText(tumba, tumbaLayout, tumbaPrice);
    return buildBedQuoteText(bed, bedLayout, bedPrice);
  }, [
    isWardrobe,
    isDresser,
    isTumba,
    wardrobe,
    wardrobeLayout,
    wardrobePrice,
    dresser,
    dresserLayout,
    dresserPrice,
    tumba,
    tumbaLayout,
    tumbaPrice,
    bed,
    bedLayout,
    bedPrice,
  ]);

  const fileBase = isWardrobe
    ? 'shkaf'
    : isDresser
      ? 'komod'
      : isTumba
        ? 'tumba'
        : 'krovat';
  const stamp = useMemo(() => fileStamp(), []);

  const handleWardrobeChange = useCallback((next: CabinetParams) => {
    setWardrobe(normalizeParams(next));
  }, []);

  const handleDresserChange = useCallback((next: DresserParams) => {
    setDresser(normalizeDresserParams(next));
  }, []);

  const handleTumbaChange = useCallback((next: TumbaParams) => {
    setTumba(normalizeTumbaParams(next));
  }, []);

  const handleBedChange = useCallback((next: BedParams) => {
    setBed(normalizeBedParams(next));
  }, []);

  const handleReset = useCallback(() => {
    clearDelays();
    if (product === 'wardrobe') setWardrobe(cloneParams(DEFAULT_PARAMS));
    else if (product === 'dresser') setDresser(cloneDresserParams(DRESSER_DEFAULT));
    else if (product === 'tumba') setTumba(cloneTumbaParams(TUMBA_DEFAULT));
    else setBed(cloneBedParams(BED_DEFAULT));
    setDoorsOpen(false);
    setDrawersOpen(false);
    setDoorSide(null);
    setView('hero');
    setToast('Конфигурация сброшена');
  }, [clearDelays, product]);

  const handleProductChange = useCallback(
    (next: ProductKind) => {
      clearDelays();
      setProduct(next);
      setDoorsOpen(false);
      setDrawersOpen(false);
      setDoorSide(null);
      setToast(
        next === 'wardrobe'
          ? 'Собираем встроенный шкаф'
          : next === 'dresser'
            ? 'Собираем комод'
            : next === 'tumba'
              ? 'Собираем тумбу'
              : 'Собираем кровать с ящиками',
      );
    },
    [clearDelays],
  );

  const showToast = useCallback((message: string) => setToast(message), []);

  /** Двери и ящики мешают друг другу — открываем/закрываем их по очереди. */
  const toggleDoors = useCallback(() => {
    clearDelays();
    if (!doorsOpen) {
      setDoorsOpen(true);
      return;
    }
    // у шкафа сначала задвигаем ящики; у комода/тумбы двери ящикам не мешают
    if (isWardrobe && drawersOpen) {
      setDrawersOpen(false);
      showToast('Сначала задвигаем ящики — двери освободят им место');
      doorDelay.current = window.setTimeout(() => {
        doorDelay.current = null;
        setDoorsOpen(false);
      }, 480);
      return;
    }
    setDoorsOpen(false);
  }, [clearDelays, doorsOpen, drawersOpen, isWardrobe, showToast]);

  const toggleDrawers = useCallback(() => {
    clearDelays();
    if (drawersOpen) {
      setDrawersOpen(false);
      return;
    }
    const needsDoorFirst =
      isWardrobe && needsDoorsForDrawers && wardrobe.doors !== 'none' && !doorsOpen;
    if (needsDoorFirst) {
      setDoorsOpen(true);
      showToast('Сначала открываем двери — они перекрывают ящики');
      drawerDelay.current = window.setTimeout(() => {
        drawerDelay.current = null;
        setDrawersOpen(true);
        if (blockedSections.length > 0) {
          showToast(`Двери-купе перекрывают ящики в секциях ${blockedSections.join(', ')}`);
        }
      }, 380);
      return;
    }
    setDrawersOpen(true);
    if (blockedSections.length > 0) {
      showToast(`Двери-купе перекрывают ящики в секциях ${blockedSections.join(', ')}`);
    }
  }, [
    blockedSections,
    clearDelays,
    doorsOpen,
    drawersOpen,
    isWardrobe,
    needsDoorsForDrawers,
    showToast,
    wardrobe.doors,
  ]);

  /** Быстрое исправление: распашные двери освобождают все ящики. */
  const makeDrawersAccessible = useCallback(() => {
    if (!isWardrobe) return;
    clearDelays();
    setWardrobe((prev) => ({ ...prev, doors: 'hinged' }));
    setDoorSide(null);
    setDoorsOpen(true);
    setDrawersOpen(true);
    showToast('Двери заменили на распашные — ящики можно выдвинуть');
  }, [clearDelays, isWardrobe, showToast]);

  /** Купе: переставить створки к другой стороне проёма, чтобы открыть другую половину. */
  const toggleDoorSide = useCallback(() => {
    if (!isWardrobe || wardrobe.doors !== 'sliding') return;
    const next: DoorSide = drawerAccess?.side === 'left' ? 'right' : 'left';
    clearDelays();
    setDoorSide(next);
    setDoorsOpen(true);
    if (drawersOpen) {
      setDrawersOpen(false);
      drawerDelay.current = window.setTimeout(() => {
        drawerDelay.current = null;
        setDrawersOpen(true);
      }, 460);
    }
    showToast(
      next === 'left'
        ? 'Створки собрали влево — открыта правая половина'
        : 'Створки собрали вправо — открыта левая половина',
    );
  }, [clearDelays, drawerAccess, drawersOpen, isWardrobe, showToast, wardrobe.doors]);

  const copyQuote = useCallback(() => {
    const fallback = (): void => {
      const area = document.createElement('textarea');
      area.value = quoteText;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        showToast('Конфигурация скопирована');
      } catch {
        showToast('Не удалось скопировать — выделите текст вручную');
      }
      area.remove();
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(quoteText).then(
        () => {
          setCopied(true);
          showToast('Конфигурация скопирована');
        },
        fallback,
      );
    } else {
      fallback();
    }
  }, [quoteText, showToast]);

  const openWhatsApp = useCallback(() => {
    window.open(whatsappUrl(quoteText), '_blank', 'noopener,noreferrer');
  }, [quoteText]);

  const openTelegram = useCallback(() => {
    window.open(telegramUrl(quoteText), '_blank', 'noopener,noreferrer');
  }, [quoteText]);

  const savePng = useCallback(() => {
    const dataUrl = viewApi.current?.screenshot();
    if (!dataUrl) {
      showToast('3D-вид недоступен');
      return;
    }
    downloadPng(`${fileBase}-${stamp}.png`, dataUrl);
  }, [fileBase, showToast, stamp]);

  const saveSpec = useCallback(() => {
    const csv = isWardrobe
      ? specCsv(wardrobe, wardrobeLayout)
      : isDresser
        ? dresserSpecCsv(dresser, dresserLayout)
        : isTumba
          ? tumbaSpecCsv(tumba, tumbaLayout)
          : bedSpecCsv(bed, bedLayout);
    downloadFile(`spec-${fileBase}-${stamp}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  }, [
    isWardrobe,
    isDresser,
    isTumba,
    wardrobe,
    wardrobeLayout,
    dresser,
    dresserLayout,
    tumba,
    tumbaLayout,
    bed,
    bedLayout,
    fileBase,
    stamp,
  ]);

  const saveQuote = useCallback(() => {
    downloadFile(`${fileBase}-${stamp}.txt`, quoteText);
  }, [fileBase, quoteText, stamp]);

  const actions = useMemo(
    () => ({
      copyQuote,
      whatsapp: openWhatsApp,
      telegram: openTelegram,
      downloadPng: savePng,
      downloadSpec: saveSpec,
      downloadQuote: saveQuote,
    }),
    [copyQuote, openWhatsApp, openTelegram, savePng, saveSpec, saveQuote],
  );

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href={SITE.url}>
          <img className="brand-mark" src={logoMark} alt="" />
          <span className="brand-text">
            <span className="brand-name">{SITE.name}</span>
            <span className="brand-sub">Конструктор мебели</span>
          </span>
        </a>
        <div className="header-right">
          <a className="header-phone" href={`tel:${SITE.phoneHref}`}>
            {SITE.phoneDisplay}
          </a>
          <a className="header-link" href={SITE.url}>
            В каталог →
          </a>
        </div>
      </header>

      <main className="app-main">
        <section className="stage" aria-label="Предпросмотр мебели">
          <div className="stage-bar">
            <div className="seg" role="group" aria-label="Ракурс">
              {(
                [
                  ['hero', '3/4'],
                  ['front', 'Спереди'],
                  ['side', 'Сбоку'],
                ] as Array<[ViewPreset, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={view === id ? 'seg-btn is-active' : 'seg-btn'}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="stage-tools">
              {canOpenDoors ? (
                <button
                  type="button"
                  className={doorsOpen ? 'tool is-active' : 'tool'}
                  aria-pressed={doorsOpen}
                  onClick={toggleDoors}
                >
                  {doorsOpen ? 'Закрыть двери' : 'Открыть двери'}
                </button>
              ) : null}
              {isWardrobe && wardrobe.doors === 'sliding' ? (
                <button
                  type="button"
                  className="tool"
                  onClick={toggleDoorSide}
                  title="Переставить створки-купе к другой стороне проёма"
                >
                  {drawerAccess?.side === 'left' ? 'Створки вправо' : 'Створки влево'}
                </button>
              ) : null}
              {hasDrawers ? (
                <button
                  type="button"
                  className={drawersOpen ? 'tool is-active' : 'tool'}
                  aria-pressed={drawersOpen}
                  onClick={toggleDrawers}
                >
                  {drawersOpen ? 'Задвинуть ящики' : 'Открыть ящики'}
                </button>
              ) : null}
              <button
                type="button"
                className={showDimensions ? 'tool is-active' : 'tool'}
                aria-pressed={showDimensions}
                onClick={() => setShowDimensions((value) => !value)}
              >
                Размеры
              </button>
            </div>
          </div>

          {isWardrobe && doorsOpen && blockedSections.length > 0 ? (
            <div className="stage-note" role="status">
              <span className="stage-note-text">
                Двери-купе перекрывают ящики в секциях {blockedSections.join(', ')} — эти ящики
                нельзя выдвинуть, пока створка закрывает проём. Сдвиньте створки кнопкой
                «Створки влево/вправо» или замените двери на распашные.
              </span>
              <button type="button" className="stage-note-btn" onClick={makeDrawersAccessible}>
                Распашные двери
              </button>
            </div>
          ) : null}

          <div className="stage-body">
            <CabinetView
              model={model}
              view={view}
              showDimensions={showDimensions}
              doorsOpen={doorsOpen}
              drawersOpen={drawersOpen}
              doorSide={doorSide}
              onReady={(api) => {
                viewApi.current = api;
              }}
            />
          </div>

          <p className="stage-hint">
            Вращение — зажать и потянуть. Колесо мыши — масштаб. «Размеры» показывают габариты.
          </p>
        </section>

        <aside className="panel" aria-label="Параметры изделия">
          <div className="panel-switch">
            <ProductSwitch product={product} onChange={handleProductChange} />
          </div>

          {isWardrobe ? (
            <ControlPanel
              params={wardrobe}
              layout={wardrobeLayout}
              price={wardrobePrice}
              onChange={handleWardrobeChange}
              onReset={handleReset}
              actions={actions}
              status={{ copied }}
              hasScreenshot
            />
          ) : isDresser ? (
            <DresserPanel
              params={dresser}
              layout={dresserLayout}
              price={dresserPrice}
              onChange={handleDresserChange}
              onReset={handleReset}
              actions={actions}
              status={{ copied }}
              hasScreenshot
            />
          ) : isTumba ? (
            <TumbaPanel
              params={tumba}
              layout={tumbaLayout}
              price={tumbaPrice}
              onChange={handleTumbaChange}
              onReset={handleReset}
              actions={actions}
              status={{ copied }}
              hasScreenshot
            />
          ) : (
            <BedPanel
              params={bed}
              layout={bedLayout}
              price={bedPrice}
              onChange={handleBedChange}
              onReset={handleReset}
              actions={actions}
              status={{ copied }}
              hasScreenshot
            />
          )}
        </aside>
      </main>

      <div className={toast ? 'toast is-visible' : 'toast'} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
