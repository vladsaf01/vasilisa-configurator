/**
 * Панель параметров комода: габариты, секции с наполнением, основание,
 * материалы, фурнитура, цена и отправка заявки.
 * Любое изменение уходит наружу одним иммутабельным объектом через onChange.
 */
import type { BodyFinish, FacadeFinish } from '../lib/model';
import { BODY_LABEL, FACADE_LABEL } from '../lib/model';
import type {
  DresserBase,
  DresserPreset,
  DresserSection,
  HandleStyle,
  SectionKind,
} from '../lib/dresser';
import {
  BASE_LABEL,
  DRESSER_DEFAULT,
  DRESSER_LIMITS,
  DRESSER_PRESETS,
  HANDLE_LABEL,
  SECTION_KIND_HINT,
  SECTION_KIND_LABEL,
  dresserSummary,
  maxDoorDrawers,
  sectionSummary,
  setDresserSectionCount,
  totalDresserDoors,
  totalDresserDrawers,
  updateDresserSection,
} from '../lib/dresser';
import { bodyColor, facadeColor, hex } from '../lib/materials';
import { areaM2, dims, mm, num, rub } from '../lib/format';
import { SITE } from '../lib/site';
import type { DresserPanelProps } from '../lib/ui-contract';
import { Block, Chip, Counter, DimField, Segmented, SwatchGroup, SwitchRow } from './controls';
import './ui.css';

/* ---------- Постоянные списки опций ---------- */

const BODY_OPTIONS = Object.keys(BODY_LABEL) as BodyFinish[];
const FACADE_OPTIONS = Object.keys(FACADE_LABEL) as FacadeFinish[];
const SECTION_KIND_OPTIONS = (Object.keys(SECTION_KIND_LABEL) as SectionKind[]).map((id) => ({
  id,
  label: SECTION_KIND_LABEL[id],
}));
const BASE_OPTIONS = (Object.keys(BASE_LABEL) as DresserBase[]).map((id) => ({
  id,
  label: BASE_LABEL[id],
}));
const HANDLE_OPTIONS = (Object.keys(HANDLE_LABEL) as HandleStyle[]).map((id) => ({
  id,
  label: HANDLE_LABEL[id],
}));

/** Короткие пояснения фурнитуры — чтобы выбор был осознанным, как в панели шкафа. */
const HANDLE_HINT: Record<HandleStyle, string> = {
  bar: 'рейлинг по центру фасада — универсально и заметно',
  knob: 'кнопка по центру — для узких фасадов и классики',
  profile: 'профиль по ширине фасада — минимализм, не выступает',
};

/** Зеркало и стекло на панели рисуем градиентом — как они выглядят на фасаде. */
const MIRROR_DOT = {
  background:
    'linear-gradient(135deg, #e4edf0 0%, #b9c9cf 42%, #f2f8f9 56%, #a5b6bc 100%)',
};
const GLASS_DOT = {
  background: 'linear-gradient(135deg, rgba(159, 183, 187, 0.72) 0%, rgba(159, 183, 187, 0.14) 100%)',
};

/* ---------- Вспомогательные функции ---------- */

function sameSection(a: DresserSection, b: DresserSection): boolean {
  return a.kind === b.kind && a.drawers === b.drawers && a.shelves === b.shelves;
}

function sameSections(a: DresserSection[], b: DresserSection[]): boolean {
  return a.length === b.length && a.every((section, index) => sameSection(section, b[index]));
}

/* ---------- Панель ---------- */

export function DresserPanel({
  params,
  layout,
  price,
  onChange,
  onReset,
  actions,
  status,
  hasScreenshot,
}: DresserPanelProps) {
  const sectionCount = params.sections.length;
  const handleCount = layout.drawerFronts.length + layout.doors.length;

  const bodySwatches = BODY_OPTIONS.map((finish) => ({
    id: finish,
    label: BODY_LABEL[finish],
    color: hex(bodyColor(finish)),
  }));

  const facadeSwatches = FACADE_OPTIONS.map((finish) => ({
    id: finish,
    label: FACADE_LABEL[finish],
    color: hex(facadeColor(finish, params.body)),
    dotStyle: finish === 'mirror' ? MIRROR_DOT : finish === 'glass' ? GLASS_DOT : undefined,
  }));

  const isPresetActive = (preset: DresserPreset): boolean =>
    params.width === preset.width &&
    params.height === preset.height &&
    params.depth === preset.depth &&
    params.base === preset.base &&
    params.baseHeight === preset.baseHeight &&
    sameSections(params.sections, preset.sections);

  const applyPreset = (preset: DresserPreset): void => {
    onChange({
      ...params,
      width: preset.width,
      height: preset.height,
      depth: preset.depth,
      base: preset.base,
      baseHeight: preset.baseHeight,
      sections: preset.sections.map((section) => ({ ...section })),
    });
  };

  const patchSection = (index: number, patch: Partial<DresserSection>): void => {
    onChange(updateDresserSection(params, index, patch));
  };

  /** Дублирует наполнение текущей секции на все остальные. */
  const copySectionToAll = (index: number): void => {
    const current = params.sections[index];
    if (!current) return;
    onChange({ ...params, sections: params.sections.map(() => ({ ...current })) });
  };

  /** «Без основания» — высота 0; при возврате к ножкам/цоколю подставляем базовую. */
  const baseHeightFor = (base: DresserBase): number =>
    base === 'none' ? 0 : params.baseHeight > 0 ? params.baseHeight : DRESSER_DEFAULT.baseHeight;

  const applyBase = (base: DresserBase): void => {
    onChange({ ...params, base, baseHeight: baseHeightFor(base) });
  };

  const baseNote =
    params.base === 'none'
      ? 'Без основания: корпус стоит на полу вровень с ним.'
      : params.base === 'legs'
        ? `Ножки ${mm(params.baseHeight)} — под комодом остаётся проход для плинтуса и уборки.`
        : `Цоколь ${mm(params.baseHeight)} — утоплен от фасада на 50 мм, идёт спереди и по бокам; сзади открыт, комод можно придвинуть вплотную.`;

  const baseFieldLabel = params.base === 'legs' ? 'Высота ножек' : 'Высота цоколя';

  return (
    <div className="ui-panel">
      <header className="ui-head">
        <p className="ui-eyebrow">{SITE.name} · комод</p>
        <h2 className="ui-title">Ваш комод</h2>
        <p className="ui-head-dims">{dims(params.width, params.height, params.depth)}</p>
        <p className="ui-head-sub">{dresserSummary(params, layout)}</p>
      </header>

      {/* ---------- Габариты ---------- */}
      <Block
        title="Габариты"
        note="Ползунок меняет размер с шагом 10 мм, кнопки − / + — с шагом 50 мм. Значение можно ввести с клавиатуры."
      >
        <div className="ui-fields">
          <DimField
            label="Ширина"
            value={params.width}
            min={DRESSER_LIMITS.width.min}
            max={DRESSER_LIMITS.width.max}
            step={DRESSER_LIMITS.width.step}
            quick={DRESSER_LIMITS.widthStep}
            hint={`${num(DRESSER_LIMITS.width.min)}–${num(DRESSER_LIMITS.width.max)}`}
            onChange={(width) => onChange({ ...params, width })}
          />
          <DimField
            label="Высота"
            value={params.height}
            min={DRESSER_LIMITS.height.min}
            max={DRESSER_LIMITS.height.max}
            step={DRESSER_LIMITS.height.step}
            quick={DRESSER_LIMITS.heightStep}
            hint={`${num(DRESSER_LIMITS.height.min)}–${num(DRESSER_LIMITS.height.max)}`}
            onChange={(height) => onChange({ ...params, height })}
          />
          <DimField
            label="Глубина"
            value={params.depth}
            min={DRESSER_LIMITS.depth.min}
            max={DRESSER_LIMITS.depth.max}
            step={DRESSER_LIMITS.depth.step}
            quick={DRESSER_LIMITS.depthStep}
            hint={`${num(DRESSER_LIMITS.depth.min)}–${num(DRESSER_LIMITS.depth.max)}`}
            onChange={(depth) => onChange({ ...params, depth })}
          />
        </div>
        <div className="ui-chips" role="group" aria-label="Готовые габариты и наполнение">
          {DRESSER_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              hint={preset.hint}
              active={isPresetActive(preset)}
              onClick={() => applyPreset(preset)}
            />
          ))}
        </div>
      </Block>

      {/* ---------- Секции ---------- */}
      <Block
        title="Секции"
        note={`Секция ≈ ${mm(layout.sectionWidth)} по внутренней ширине. Тип и наполнение настраиваются для каждой секции отдельно.`}
        aside={
          <Counter
            label="Количество секций"
            value={sectionCount}
            min={DRESSER_LIMITS.sections.min}
            max={DRESSER_LIMITS.sections.max}
            onChange={(count) => onChange(setDresserSectionCount(params, count))}
          />
        }
      >
        <div className="ui-sec-list">
          {params.sections.map((section, index) => {
            const sectionLayout = layout.sections[index];
            const width = sectionLayout ? `${mm(sectionLayout.width)} по внутренней` : '';
            const isDrawerKind = section.kind === 'drawers' || section.kind === 'doorDrawers';
            const hasShelves =
              section.kind === 'door' || section.kind === 'open' || section.kind === 'doorDrawers';

            return (
              <div className="ui-sec-card" key={`dresser-section-${index}`}>
                <div className="ui-sec-head">
                  <span className="ui-sec-name">Секция {index + 1}</span>
                  <span className="ui-sec-width">{width ? `· ${width}` : ''}</span>
                </div>

                <div className="ui-dresser-kind">
                  <Segmented
                    label={`Тип секции ${index + 1}`}
                    value={section.kind}
                    options={SECTION_KIND_OPTIONS}
                    onChange={(kind) => patchSection(index, { kind })}
                  />
                </div>
                <p className="ui-note">{SECTION_KIND_HINT[section.kind]}</p>

                {isDrawerKind ? (
                  <div className="ui-sec-row">
                    <span className="ui-sec-label">Ящики</span>
                    <Counter
                      label={`Ящики, секция ${index + 1}`}
                      value={section.drawers}
                      min={DRESSER_LIMITS.drawers.min}
                      max={section.kind === 'doorDrawers' ? maxDoorDrawers(params) : DRESSER_LIMITS.drawers.max}
                      onChange={(drawers) => patchSection(index, { drawers })}
                    />
                  </div>
                ) : null}

                {hasShelves ? (
                  <div className="ui-sec-row">
                    <span className="ui-sec-label">Полки</span>
                    <Counter
                      label={`Полки, секция ${index + 1}`}
                      value={section.shelves}
                      min={DRESSER_LIMITS.shelves.min}
                      max={DRESSER_LIMITS.shelves.max}
                      onChange={(shelves) => patchSection(index, { shelves })}
                    />
                  </div>
                ) : null}

                <div className="ui-sec-foot">
                  <span className="ui-sub-value">
                    {sectionSummary(section, layout.sections[index]?.doors.length ?? 1)}
                  </span>
                  <button
                    type="button"
                    className="ui-sec-copy"
                    onClick={() => copySectionToAll(index)}
                    disabled={sectionCount < 2}
                    title={
                      sectionCount < 2
                        ? 'Добавьте вторую секцию, чтобы копировать наполнение'
                        : `Скопировать наполнение секции ${index + 1} во все секции`
                    }
                  >
                    Скопировать во все
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="ui-totals" aria-live="polite">
          <span>
            секций <b>{sectionCount}</b>
          </span>
          <span className="ui-totals-sep" aria-hidden="true" />
          <span>
            ящиков <b>{totalDresserDrawers(params)}</b>
          </span>
          <span className="ui-totals-sep" aria-hidden="true" />
          <span>
            дверей <b>{totalDresserDoors(layout)}</b>
          </span>
        </div>
      </Block>

      {/* ---------- Основание ---------- */}
      <Block title="Основание" note={baseNote}>
        <Segmented label="Тип основания" value={params.base} options={BASE_OPTIONS} onChange={applyBase} />

        {params.base === 'none' ? (
          <p className="ui-note">
            Основание отключено: высота 0 мм, комод опирается на пол. При желании верните ножки или цоколь.
          </p>
        ) : (
          <DimField
            label={baseFieldLabel}
            value={params.baseHeight}
            min={DRESSER_LIMITS.baseHeight.min}
            max={DRESSER_LIMITS.baseHeight.max}
            step={DRESSER_LIMITS.baseHeight.step}
            quick={DRESSER_LIMITS.baseStep}
            hint={`${num(DRESSER_LIMITS.baseHeight.min)}–${num(DRESSER_LIMITS.baseHeight.max)}`}
            onChange={(baseHeight) => onChange({ ...params, baseHeight })}
          />
        )}
      </Block>

      {/* ---------- Материалы ---------- */}
      <Block title="Материалы">
        <div className="ui-sub">
          <div className="ui-sub-head">
            <span className="ui-sub-title">Корпус</span>
            <span className="ui-sub-value">{BODY_LABEL[params.body]}</span>
          </div>
          <SwatchGroup
            label="Материал корпуса"
            name="ui-dresser-body"
            value={params.body}
            options={bodySwatches}
            onChange={(body) => onChange({ ...params, body })}
          />
        </div>

        <div className="ui-sub">
          <div className="ui-sub-head">
            <span className="ui-sub-title">Двери и ящики</span>
            <span className="ui-sub-value">{FACADE_LABEL[params.facade]}</span>
          </div>
          <SwatchGroup
            label="Материал дверей и фасадов ящиков"
            name="ui-dresser-facade"
            value={params.facade}
            options={facadeSwatches}
            onChange={(facade) => onChange({ ...params, facade })}
          />
          <p className="ui-facade-note">
            <b>Зеркало</b> +75%, <b>стекло</b> +60% к цене фасада — считаем площадь дверей и ящиков.
          </p>
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

        <div className="ui-sub">
          <div className="ui-sub-head">
            <span className="ui-sub-title">Ручки</span>
            <span className="ui-sub-value">{HANDLE_LABEL[params.handles]}</span>
          </div>
          <Segmented
            label="Стиль ручек"
            value={params.handles}
            options={HANDLE_OPTIONS}
            onChange={(handles) => onChange({ ...params, handles })}
          />
          <p className="ui-note">
            {HANDLE_HINT[params.handles]}. В комплекте {handleCount} шт. — на ящики и створки.
          </p>
        </div>
      </Block>

      {/* ---------- Итого ---------- */}
      <Block title="Итого">
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
            Корпус {areaM2(price.bodyArea)}
            {price.facadeArea > 0 ? ` · фасады ${areaM2(price.facadeArea)}` : ''}
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

export default DresserPanel;
