/**
 * Панель параметров встроенного шкафа: габариты, секции и наполнение,
 * двери, материалы, опции, цена и отправка заявки.
 * Любое изменение уходит наружу одним иммутабельным объектом через onChange.
 */
import type {
  BodyFinish,
  CabinetParams,
  DoorsKind,
  FacadeFinish,
  LayoutPreset,
  SectionConfig,
  SectionDoorMode,
  SizePreset,
} from '../lib/model';
import {
  BODY_LABEL,
  DOORS_LABEL,
  FACADE_LABEL,
  FUTURE_OPTIONS,
  LAYOUT_PRESETS,
  LIMITS,
  SECTION_DOOR_LABEL,
  SIZE_PRESETS,
  setSectionCount,
  totalDrawers,
  totalRods,
  totalShelves,
  updateSection,
} from '../lib/model';
import type { Layout } from '../lib/layout';
import { bodyColor, facadeColor, hex } from '../lib/materials';
import { areaM2, dims, mm, num, rub } from '../lib/format';
import { plural } from '../lib/labels';
import { SITE } from '../lib/site';
import type { ControlPanelProps } from '../lib/ui-contract';
import { Block, Chip, Counter, DimField, Segmented, SwatchGroup, SwitchRow } from './controls';
import './ui.css';

/* ---------- Постоянные списки опций ---------- */

const BODY_OPTIONS = Object.keys(BODY_LABEL) as BodyFinish[];
const FACADE_OPTIONS = Object.keys(FACADE_LABEL) as FacadeFinish[];

const DOOR_OPTIONS: Array<{ id: DoorsKind; label: string }> = [
  { id: 'none', label: DOORS_LABEL.none },
  { id: 'hinged', label: DOORS_LABEL.hinged },
  { id: 'sliding', label: DOORS_LABEL.sliding },
];

const SECTION_DOOR_OPTIONS: Array<{ id: SectionDoorMode; label: string }> = [
  { id: 'auto', label: SECTION_DOOR_LABEL.auto },
  { id: 'one', label: SECTION_DOOR_LABEL.one },
  { id: 'two', label: SECTION_DOOR_LABEL.two },
];

/** Зеркало и стекло на панели рисуем градиентом — как они выглядят на фасаде. */
const MIRROR_DOT = {
  background:
    'linear-gradient(135deg, #e4edf0 0%, #b9c9cf 42%, #f2f8f9 56%, #a5b6bc 100%)',
};
const GLASS_DOT = {
  background: 'linear-gradient(135deg, rgba(159, 183, 187, 0.72) 0%, rgba(159, 183, 187, 0.14) 100%)',
};

/* ---------- Вспомогательные функции ---------- */

/** Подсказка «сколько створок и почему» под сегментами дверей. */
function describeDoors(params: CabinetParams, layout: Layout): string {
  if (params.doors === 'none') {
    return 'Открытые секции: наполнение видно, удобно для гардеробной и прихожей.';
  }

  if (params.doors === 'hinged') {
    const leaves = new Set(layout.doors.map((door) => `${door.section}:${door.leaf}`)).size;
    const widths = Array.from(new Set(layout.doors.map((door) => Math.round(door.x1 - door.x0)))).sort(
      (a, b) => a - b,
    );
    const widthText =
      widths.length > 1
        ? `${mm(widths[0])}–${mm(widths[widths.length - 1])}`
        : mm(widths[0] ?? layout.sectionWidth);
    return `${leaves} ${plural(leaves, 'створка', 'створки', 'створок')} по ${widthText}: у каждой секции свой проём между стенками; створки крепятся к её стенкам. Одиночная — до 900 мм, шире проём — двойная, каждая по половине.`;
  }

  const leaves = layout.doors.length;
  const width = Math.round(layout.width / Math.max(1, leaves));
  return `${leaves} ${plural(leaves, 'створка', 'створки', 'створок')} по ${mm(width)}: купе идёт по всей ширине, нахлёст створок 40 мм.`;
}

function sameSections(a: SectionConfig[], b: SectionConfig[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (section, index) =>
        section.shelves === b[index].shelves &&
        section.rod === b[index].rod &&
        section.drawers === b[index].drawers &&
        section.doorMode === b[index].doorMode,
    )
  );
}

/* ---------- Панель ---------- */

export function ControlPanel({
  params,
  layout,
  price,
  onChange,
  onReset,
  actions,
  status,
  hasScreenshot,
}: ControlPanelProps) {
  const sectionCount = params.sections.length;

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

  const applySize = (preset: SizePreset): void => {
    onChange({
      ...params,
      width: preset.width,
      height: preset.height,
      depth: preset.depth,
      doors: preset.doors,
    });
  };

  const applyLayout = (preset: LayoutPreset): void => {
    onChange({
      ...params,
      doors: preset.doors,
      sections: preset.sections.map((section) => ({ ...section })),
    });
  };

  const patchSection = (index: number, patch: Partial<SectionConfig>): void => {
    onChange(updateSection(params, index, patch));
  };

  const isSizeActive = (preset: SizePreset): boolean =>
    params.width === preset.width &&
    params.height === preset.height &&
    params.depth === preset.depth &&
    params.doors === preset.doors;

  const isLayoutActive = (preset: LayoutPreset): boolean =>
    params.doors === preset.doors && sameSections(params.sections, preset.sections);

  return (
    <div className="ui-panel">
      <header className="ui-head">
        <p className="ui-eyebrow">{SITE.name} · конструктор</p>
        <h2 className="ui-title">Ваш шкаф</h2>
        <p className="ui-head-dims">{dims(params.width, params.height, params.depth)}</p>
        <p className="ui-head-sub">встроенный, по индивидуальным размерам</p>
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
            min={LIMITS.width.min}
            max={LIMITS.width.max}
            step={LIMITS.width.step}
            quick={LIMITS.widthStep}
            hint={`${num(LIMITS.width.min)}–${num(LIMITS.width.max)}`}
            onChange={(width) => onChange({ ...params, width })}
          />
          <DimField
            label="Высота"
            value={params.height}
            min={LIMITS.height.min}
            max={LIMITS.height.max}
            step={LIMITS.height.step}
            quick={LIMITS.heightStep}
            hint={`${num(LIMITS.height.min)}–${num(LIMITS.height.max)}`}
            onChange={(height) => onChange({ ...params, height })}
          />
          <DimField
            label="Глубина"
            value={params.depth}
            min={LIMITS.depth.min}
            max={LIMITS.depth.max}
            step={LIMITS.depth.step}
            quick={LIMITS.depthStep}
            hint={`${num(LIMITS.depth.min)}–${num(LIMITS.depth.max)}`}
            onChange={(depth) => onChange({ ...params, depth })}
          />
        </div>
        <div className="ui-chips" role="group" aria-label="Готовые габариты">
          {SIZE_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              hint={preset.hint}
              active={isSizeActive(preset)}
              onClick={() => applySize(preset)}
            />
          ))}
        </div>
      </Block>

      {/* ---------- Секции и наполнение ---------- */}
      <Block
        title="Секции и наполнение"
        aside={
          <div className="ui-count" role="group" aria-label="Количество секций">
            <button
              type="button"
              className="ui-count-btn"
              onClick={() => onChange(setSectionCount(params, sectionCount - 1))}
              disabled={sectionCount <= LIMITS.sections.min}
              aria-label="Убрать секцию"
            >
              −
            </button>
            <span className="ui-count-value" aria-live="polite">
              {sectionCount}
            </span>
            <button
              type="button"
              className="ui-count-btn"
              onClick={() => onChange(setSectionCount(params, sectionCount + 1))}
              disabled={sectionCount >= LIMITS.sections.max}
              aria-label="Добавить секцию"
            >
              +
            </button>
          </div>
        }
        note={`Секция ≈ ${mm(Math.round(layout.sectionWidth))} по внутренней ширине. Полки, штанга и ящики настраиваются для каждой секции отдельно; у распашных дверей здесь же выбирается одна или две створки на проём секции. Штанга резервирует 1100 мм под одежду, полки ставятся над ней.`}
      >
        <div className="ui-chips" role="group" aria-label="Готовые наборы наполнения">
          {LAYOUT_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              hint={preset.hint}
              active={isLayoutActive(preset)}
              onClick={() => applyLayout(preset)}
            />
          ))}
        </div>

        <div className="ui-sec-list">
          {params.sections.map((section, index) => {
            const sectionLayout = layout.sections[index];
            return (
              <div className="ui-sec-card" key={`section-${index}`}>
                <div className="ui-sec-head">
                  <span className="ui-sec-name">Секция {index + 1}</span>
                  <span className="ui-sec-width">
                    {sectionLayout ? `· ${mm(Math.round(sectionLayout.width))}` : ''}
                  </span>
                </div>

                <div className="ui-sec-row">
                  <span className="ui-sec-label">Полки</span>
                  <Counter
                    label={`Полки, секция ${index + 1}`}
                    value={section.shelves}
                    min={LIMITS.shelves.min}
                    max={LIMITS.shelves.max}
                    onChange={(shelves) => patchSection(index, { shelves })}
                  />
                </div>

                <div className="ui-sec-row">
                  <span className="ui-sec-label">Штанга</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={section.rod}
                    aria-label={`Штанга, секция ${index + 1}`}
                    className={section.rod ? 'ui-switch is-on' : 'ui-switch'}
                    onClick={() => patchSection(index, { rod: !section.rod })}
                  >
                    <span className="ui-switch-knob" aria-hidden="true" />
                  </button>
                </div>

                <div className="ui-sec-row">
                  <span className="ui-sec-label">Ящики</span>
                  <Counter
                    label={`Ящики, секция ${index + 1}`}
                    value={section.drawers}
                    min={LIMITS.drawers.min}
                    max={LIMITS.drawers.max}
                    onChange={(drawers) => patchSection(index, { drawers })}
                  />
                </div>

                {params.doors === 'hinged' ? (
                  <div className="ui-sec-row">
                    <span className="ui-sec-label">Створки</span>
                    <Segmented
                      label={`Створки, секция ${index + 1}`}
                      value={section.doorMode}
                      options={SECTION_DOOR_OPTIONS}
                      onChange={(doorMode) => patchSection(index, { doorMode })}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="ui-totals" aria-live="polite">
          <span>
            Всего полок <b>{totalShelves(params)}</b>
          </span>
          <span className="ui-totals-sep" aria-hidden="true" />
          <span>
            ящиков <b>{totalDrawers(params)}</b>
          </span>
          <span className="ui-totals-sep" aria-hidden="true" />
          <span>
            штанг <b>{totalRods(params)}</b>
          </span>
        </div>
      </Block>

      {/* ---------- Двери ---------- */}
      <Block title="Двери" note={describeDoors(params, layout)}>
        <Segmented
          label="Тип дверей"
          value={params.doors}
          options={DOOR_OPTIONS}
          onChange={(doors) => onChange({ ...params, doors })}
        />
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
            name="ui-body-finish"
            value={params.body}
            options={bodySwatches}
            onChange={(body) => onChange({ ...params, body })}
          />
        </div>

        <div className="ui-sub">
          <div className="ui-sub-head">
            <span className="ui-sub-title">Фасад</span>
            <span className="ui-sub-value">{FACADE_LABEL[params.facade]}</span>
          </div>
          <SwatchGroup
            label="Материал фасада"
            name="ui-facade-finish"
            value={params.facade}
            options={facadeSwatches}
            onChange={(facade) => onChange({ ...params, facade })}
          />
          <p className="ui-facade-note">
            <b>Зеркало</b> +75%, <b>стекло</b> +60% к цене фасада.
            {params.doors === 'none' ? ' Двери не выбраны — фасад пока не входит в расчёт.' : ''}
          </p>
        </div>
      </Block>

      {/* ---------- Дополнительно ---------- */}
      <Block title="Дополнительно">
        <DimField
          label="Цоколь"
          value={params.plinth}
          min={LIMITS.plinth.min}
          max={LIMITS.plinth.max}
          step={LIMITS.plinth.step}
          quick={LIMITS.plinthStep}
          hint={params.plinth === 0 ? 'без цоколя' : 'высота'}
          onChange={(plinth) => onChange({ ...params, plinth })}
        />

        <div className="ui-switch-list">
          <SwitchRow
            label="Задняя стенка ДВП"
            hint="Защищает от пыли и держит корпус в геометрии"
            checked={params.backPanel}
            onChange={(backPanel) => onChange({ ...params, backPanel })}
          />
          <SwitchRow
            label="LED-подсветка полок"
            hint="Тёплая лента под полками — видно в глубине"
            checked={params.lighting}
            onChange={(lighting) => onChange({ ...params, lighting })}
          />
          <SwitchRow
            label="Антресоль"
            hint="Верхнее отделение 450 мм под сезонные вещи"
            checked={params.mezzanine}
            onChange={(mezzanine) => onChange({ ...params, mezzanine })}
          />
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
            {price.facadeArea > 0 ? ` · фасад ${areaM2(price.facadeArea)}` : ''}
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

      {/* ---------- Скоро ---------- */}
      <Block
        title="Скоро в конструкторе"
        note="Добавим после запуска — сейчас показываем направление, чтобы было видно развитие."
      >
        <div className="ui-chips ui-chips--future">
          {FUTURE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="ui-future-chip"
              disabled
              title={`${option.hint} — появится позже`}
            >
              {option.label}
              <span className="ui-badge">скоро</span>
            </button>
          ))}
        </div>
      </Block>
    </div>
  );
}

export default ControlPanel;
