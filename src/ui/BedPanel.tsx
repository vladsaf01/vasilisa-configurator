/**
 * Панель параметров кровати: спальное место, изголовье, ящики, основание,
 * материалы, цена и отправка заявки.
 * Любое изменение уходит наружу одним иммутабельным объектом через onChange.
 */
import type { BodyFinish } from '../lib/model';
import { BODY_LABEL } from '../lib/model';
import type { DresserBase } from '../lib/dresser';
import { BASE_LABEL } from '../lib/dresser';
import type {
  BedHandleStyle,
  BedHeadboard,
  BedLayout,
  BedParams,
  BedPreset,
} from '../lib/bed';
import {
  BED_DEFAULT,
  BED_FUTURE_OPTIONS,
  BED_HEADBOARD_HINT,
  BED_HEADBOARD_LABEL,
  BED_HANDLE_HINT,
  BED_HANDLE_LABEL,
  BED_LIMITS,
  BED_PRESETS,
  BED_SIDE_LABEL,
  applyBedPreset,
  bedSummary,
  isBedPresetActive,
  normalizeBedParams,
} from '../lib/bed';
import { bodyColor, deckColor, hex } from '../lib/materials';
import { areaM2, mm, num, rub } from '../lib/format';
import { SITE } from '../lib/site';
import type { BedPanelProps } from '../lib/ui-contract';
import { Block, Chip, Counter, DimField, Segmented, SwatchGroup, SwitchRow } from './controls';
import './ui.css';

/* ---------- Постоянные списки опций ---------- */

const BODY_OPTIONS = Object.keys(BODY_LABEL) as BodyFinish[];

/** Типы изголовья в порядке модели: без, прямая, угловая, «волна». */
const HEADBOARD_ORDER: BedHeadboard[] = ['none', 'straight', 'corner', 'wave'];
const HEADBOARD_OPTIONS = HEADBOARD_ORDER.map((id) => ({
  id,
  label: BED_HEADBOARD_LABEL[id],
}));

/** Сторона углового изголовья и «волны». */
const SIDE_OPTIONS: Array<{ id: BedParams['headboardSide']; label: string }> = [
  { id: 'left', label: BED_SIDE_LABEL.left },
  { id: 'right', label: BED_SIDE_LABEL.right },
];

/** Ручки кровати: главный вариант — вырез в фасаде, как на фото. */
const HANDLE_ORDER: BedHandleStyle[] = ['cutout', 'bar', 'knob', 'profile'];
const HANDLE_OPTIONS = HANDLE_ORDER.map((id) => ({
  id,
  label: BED_HANDLE_LABEL[id],
}));

const BASE_ORDER: DresserBase[] = ['plinth', 'legs', 'none'];
const BASE_OPTIONS = BASE_ORDER.map((id) => ({ id, label: BASE_LABEL[id] }));

/** Шаг кнопок «− / +» у высоты изголовья. */
const HEADBOARD_STEP = 50;

/* ---------- Вспомогательные функции ---------- */

/** Фасадов ящиков в ряду — столько же, сколько ящиков; layout — источник правды. */
function facadeCount(layout: BedLayout): number {
  return layout.drawerFronts.length;
}

/* ---------- Панель ---------- */

export function BedPanel({
  params,
  layout,
  price,
  onChange,
  onReset,
  actions,
  status,
  hasScreenshot,
}: BedPanelProps) {
  const drawerCount = facadeCount(layout);
  /** Боковина изголовья есть только у угловой спинки и «волны». */
  const hasSide = params.headboard === 'corner' || params.headboard === 'wave';

  const bodySwatches = BODY_OPTIONS.map((finish) => ({
    id: finish,
    label: BODY_LABEL[finish],
    color: hex(bodyColor(finish)),
  }));

  const deckSwatches = BODY_OPTIONS.map((finish) => ({
    id: finish,
    label: BODY_LABEL[finish],
    color: hex(deckColor(finish, params.body)),
  }));

  const applyPreset = (preset: BedPreset): void => {
    onChange(applyBedPreset(params, preset.patch));
  };

  /** «Без основания» — высота 0; при возврате к ножкам/цоколю подставляем базовую. */
  const baseHeightFor = (base: DresserBase): number =>
    base === 'none' ? 0 : params.baseHeight > 0 ? params.baseHeight : BED_DEFAULT.baseHeight;

  /** Основание меняет сразу два поля — нормализуем, чтобы высота не превысила каркас. */
  const applyBase = (base: DresserBase): void => {
    onChange(normalizeBedParams({ ...params, base, baseHeight: baseHeightFor(base) }));
  };

  const baseNote =
    params.base === 'none'
      ? 'Без основания: корпус стоит на полу вровень с ним, высота 0 мм.'
      : params.base === 'legs'
        ? `Ножки ${mm(params.baseHeight)} — под кроватью остаётся проход для плинтуса и уборки.`
        : 'Цоколь утоплен от фасада, сзади открыт — кровать можно придвинуть вплотную.';

  const baseFieldLabel = params.base === 'legs' ? 'Высота ножек' : 'Высота цоколя';

  const sizeNote = `Ширина ${num(BED_LIMITS.width.min)}–${num(BED_LIMITS.width.max)}, длина ${num(BED_LIMITS.length.min)}–${num(BED_LIMITS.length.max)}, высота каркаса ${num(BED_LIMITS.height.min)}–${num(BED_LIMITS.height.max)} мм. Столешница — это верх каркаса, матрас не входит в габариты.`;

  return (
    <div className="ui-panel">
      <header className="ui-head">
        <p className="ui-eyebrow">{SITE.name} · кровать</p>
        <h2 className="ui-title">Ваша кровать</h2>
        <p className="ui-head-dims">
          {num(params.width)} × {num(params.length)} мм
        </p>
        <p className="ui-head-sub">
          {bedSummary(params, layout)} · каркас {mm(params.height)}
        </p>
      </header>

      {/* ---------- Готовые варианты ---------- */}
      <Block
        title="Готовые варианты"
        note="Вариант применяет габариты, изголовье, ящики и декор — дальше можно поправить любую опцию."
      >
        <div className="ui-chips" role="group" aria-label="Готовые варианты кровати">
          {BED_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              hint={preset.hint}
              active={isBedPresetActive(params, preset)}
              onClick={() => applyPreset(preset)}
            />
          ))}
        </div>
      </Block>

      {/* ---------- Спальное место ---------- */}
      <Block title="Спальное место" note={sizeNote}>
        <div className="ui-fields">
          <DimField
            label="Ширина"
            value={params.width}
            min={BED_LIMITS.width.min}
            max={BED_LIMITS.width.max}
            step={BED_LIMITS.width.step}
            quick={BED_LIMITS.widthStep}
            hint={`${num(BED_LIMITS.width.min)}–${num(BED_LIMITS.width.max)}`}
            onChange={(width) => onChange({ ...params, width })}
          />
          <DimField
            label="Длина"
            value={params.length}
            min={BED_LIMITS.length.min}
            max={BED_LIMITS.length.max}
            step={BED_LIMITS.length.step}
            quick={BED_LIMITS.lengthStep}
            hint={`${num(BED_LIMITS.length.min)}–${num(BED_LIMITS.length.max)}`}
            onChange={(length) => onChange({ ...params, length })}
          />
          <DimField
            label="Высота каркаса"
            value={params.height}
            min={BED_LIMITS.height.min}
            max={BED_LIMITS.height.max}
            step={BED_LIMITS.height.step}
            quick={BED_LIMITS.heightStep}
            hint="от пола до столешницы"
            onChange={(height) => onChange({ ...params, height })}
          />
        </div>
      </Block>

      {/* ---------- Изголовье ---------- */}
      <Block title="Изголовье" note={BED_HEADBOARD_HINT[params.headboard]}>
        <div className="ui-bed-headboard">
          <Segmented
            label="Тип изголовья"
            value={params.headboard}
            options={HEADBOARD_OPTIONS}
            onChange={(headboard) => onChange({ ...params, headboard })}
          />
        </div>

        {hasSide ? (
          <>
            <Segmented
              label="Сторона изголовья"
              value={params.headboardSide}
              options={SIDE_OPTIONS}
              onChange={(headboardSide) => onChange({ ...params, headboardSide })}
            />
            <DimField
              label="Высота спинки"
              value={params.headboardHeight}
              min={BED_LIMITS.headboardHeight.min}
              max={BED_LIMITS.headboardHeight.max}
              step={BED_LIMITS.headboardHeight.step}
              quick={HEADBOARD_STEP}
              hint="над столешницей"
              onChange={(headboardHeight) => onChange({ ...params, headboardHeight })}
            />
          </>
        ) : null}

        {params.headboard === 'wave' ? (
          <p className="ui-note">Плавный спуск подрезается по месту, как на фото.</p>
        ) : null}
      </Block>

      {/* ---------- Ящики ---------- */}
      <Block title="Ящики" note="Один ряд по фронту, фасады делят ширину поровну.">
        <div className="ui-sec-row">
          <span className="ui-sec-label">Ящиков</span>
          <Counter
            label="Количество ящиков"
            value={params.drawers}
            min={BED_LIMITS.drawers.min}
            max={BED_LIMITS.drawers.max}
            onChange={(drawers) => onChange({ ...params, drawers })}
          />
        </div>

        <div className="ui-totals" aria-live="polite">
          <span>
            ящиков <b>{drawerCount}</b>
          </span>
          <span className="ui-totals-sep" aria-hidden="true" />
          <span>
            фасадов <b>{layout.drawerFronts.length}</b>
          </span>
        </div>
      </Block>

      {/* ---------- Ручки ---------- */}
      <Block title="Ручки" note={BED_HANDLE_HINT[params.handles]}>
        <div className="ui-bed-handles">
          <Segmented
            label="Стиль ручек"
            value={params.handles}
            options={HANDLE_OPTIONS}
            onChange={(handles) => onChange({ ...params, handles })}
          />
        </div>
        <p className="ui-note">В комплекте {drawerCount} шт. — по одной на каждый ящик.</p>
      </Block>

      {/* ---------- Основание ---------- */}
      <Block title="Основание" note={baseNote}>
        <Segmented
          label="Тип основания"
          value={params.base}
          options={BASE_OPTIONS}
          onChange={applyBase}
        />

        {params.base === 'none' ? (
          <p className="ui-note">
            Основание отключено: высота 0 мм, кровать опирается на пол. При желании верните ножки
            или цоколь.
          </p>
        ) : (
          <DimField
            label={baseFieldLabel}
            value={params.baseHeight}
            min={BED_LIMITS.baseHeight.min}
            max={BED_LIMITS.baseHeight.max}
            step={BED_LIMITS.baseHeight.step}
            quick={BED_LIMITS.baseStep}
            hint={`${num(BED_LIMITS.baseHeight.min)}–${num(BED_LIMITS.baseHeight.max)}`}
            onChange={(baseHeight) => onChange({ ...params, baseHeight })}
          />
        )}
      </Block>

      {/* ---------- Материалы ---------- */}
      <Block
        title="Материалы"
        note="Как на фото: белый корпус, дубовая столешница и изголовье. Декор столешницы может совпадать с корпусом."
      >
        <div className="ui-sub">
          <div className="ui-sub-head">
            <span className="ui-sub-title">Корпус</span>
            <span className="ui-sub-value">{BODY_LABEL[params.body]}</span>
          </div>
          <SwatchGroup
            label="Материал корпуса"
            name="ui-bed-body"
            value={params.body}
            options={bodySwatches}
            onChange={(body) => onChange({ ...params, body })}
          />
        </div>

        <div className="ui-sub">
          <div className="ui-sub-head">
            <span className="ui-sub-title">Столешница и изголовье</span>
            <span className="ui-sub-value">{BODY_LABEL[params.deck]}</span>
          </div>
          <SwatchGroup
            label="Декор столешницы и изголовья"
            name="ui-bed-deck"
            value={params.deck}
            options={deckSwatches}
            onChange={(deck) => onChange({ ...params, deck })}
          />
        </div>
      </Block>

      {/* ---------- Дополнительно ---------- */}
      <Block title="Дополнительно">
        <div className="ui-switch-list">
          <SwitchRow
            label="Задняя стенка ДВП"
            hint="Защищает от пыли и держит корпус в геометрии"
            checked={params.backPanel}
            onChange={(backPanel) => onChange({ ...params, backPanel })}
          />
        </div>
      </Block>

      {/* ---------- Скоро в конструкторе ---------- */}
      <Block
        title="Скоро в конструкторе"
        note="Эти варианты появятся в следующих версиях — если нужен один из них, напишите в заявке."
      >
        <div className="ui-chips ui-chips--future">
          {BED_FUTURE_OPTIONS.map((option) => (
            <span className="ui-future-chip" key={option.id} title={option.hint}>
              {option.label}
              <span className="ui-badge">v2</span>
            </span>
          ))}
        </div>
      </Block>

      {/* ---------- Итого ---------- */}
      <Block title="Итого" note="Матрас в цену не входит.">
        <div className="ui-price">
          <div className="ui-price-top">
            <p className="ui-price-label">Ориентировочная стоимость</p>
            <p className="ui-price-value">{rub(price.total)}</p>
            <p className="ui-price-approx">≈ цена под ключ: изделие, сборка и доставка</p>
          </div>

          <div className="ui-price-lines">
            {price.lines.map((line) => (
              <div className="ui-price-line" key={line.key}>
                <span className="ui-price-line-main">
                  <span className="ui-price-line-label">{line.label}</span>
                  {line.detail ? <span className="ui-price-line-detail">{line.detail}</span> : null}
                </span>
                <span className="ui-price-line-amount">{rub(line.amount)}</span>
              </div>
            ))}
            <div className="ui-price-line ui-price-line--sum">
              <span className="ui-price-line-main">
                <span className="ui-price-line-label">Изделие</span>
              </span>
              <span className="ui-price-line-amount">{rub(price.goods)}</span>
            </div>
          </div>

          <div className="ui-price-lines">
            <div className="ui-price-line">
              <span className="ui-price-line-main">
                <span className="ui-price-line-label">Сборка и монтаж</span>
                <span className="ui-price-line-detail">сборка на объекте</span>
              </span>
              <span className="ui-price-line-amount">{rub(price.assembly)}</span>
            </div>
            <div className="ui-price-line">
              <span className="ui-price-line-main">
                <span className="ui-price-line-label">Доставка и подъём</span>
                <span className="ui-price-line-detail">{SITE.geo}</span>
              </span>
              <span className="ui-price-line-amount">{rub(price.delivery)}</span>
            </div>
          </div>

          <p className="ui-price-meta">
            Корпус {areaM2(price.bodyArea)} · фасады {areaM2(price.facadeArea)}
          </p>

          <p className="ui-disclaimer">
            {SITE.priceNote}
            <span className="ui-disclaimer-strong">Точная цена — после замера.</span>
          </p>
        </div>
      </Block>

      {/* ---------- Действия ---------- */}
      <Block title="Отправить заявку">
        <div className="ui-actions">
          <button type="button" className="ui-btn ui-btn--primary ui-btn--wide" onClick={actions.whatsapp}>
            Отправить в WhatsApp
          </button>

          <div className="ui-actions-row">
            <button type="button" className="ui-btn" onClick={actions.telegram}>
              Telegram
            </button>
            <button
              type="button"
              className={status.copied ? 'ui-btn is-done' : 'ui-btn'}
              onClick={actions.copyQuote}
            >
              {status.copied ? 'Скопировано ✓' : 'Скопировать конфигурацию'}
            </button>
            <span className="ui-sr" aria-live="polite">
              {status.copied ? 'Конфигурация скопирована' : ''}
            </span>
          </div>

          <div className="ui-actions-files">
            <button
              type="button"
              className="ui-btn"
              onClick={actions.downloadPng}
              disabled={!hasScreenshot}
              title={hasScreenshot ? 'Скачать PNG-кадр 3D-вида' : 'Доступно в режиме 3D-вида'}
            >
              PNG 3D-вида
            </button>
            <button
              type="button"
              className="ui-btn"
              onClick={actions.downloadSpec}
              title="Спецификация деталей для распила"
            >
              Спецификация CSV
            </button>
            <button
              type="button"
              className="ui-btn"
              onClick={actions.downloadQuote}
              title="Текст заявки для мессенджера или почты"
            >
              Текст заявки .txt
            </button>
          </div>

          <p className="ui-actions-note">
            WhatsApp и Telegram откроются с готовым текстом конфигурации — останется проверить и отправить.
          </p>

          <button type="button" className="ui-reset" onClick={onReset}>
            Сбросить настройки
          </button>
        </div>
      </Block>
    </div>
  );
}

export default BedPanel;
