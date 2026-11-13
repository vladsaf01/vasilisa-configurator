/**
 * Управляющие элементы панели: сворачиваемый раздел со стрелкой в шапке,
 * поле с ползунком и числовым вводом, счётчик, свитч, сегменты, свотчи и чипы.
 * Всё меняет состояние только через onChange — без внутренних мутаций модели.
 */
import { useEffect, useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { snap } from '../lib/model';

/* ---------- Блок панели ---------- */

interface BlockProps {
  title: string;
  aside?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}

export function Block({ title, aside, note, children }: BlockProps) {
  const titleId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(true);

  return (
    <section className={open ? 'ui-block' : 'ui-block is-collapsed'} aria-labelledby={titleId}>
      <div className="ui-block-head">
        <h3 className="ui-block-heading">
          <button
            type="button"
            className="ui-block-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            title={open ? 'Свернуть раздел' : 'Развернуть раздел'}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="ui-block-caret" aria-hidden="true">
              <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
                <path
                  d="M3.4 5.2 7 8.8l3.6-3.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="ui-block-title" id={titleId}>
              {title}
            </span>
            <span className="ui-block-line" aria-hidden="true" />
          </button>
        </h3>
        {aside}
      </div>
      <div className="ui-block-body" id={bodyId} inert={!open}>
        <div className="ui-block-inner">
          {note ? <p className="ui-block-note">{note}</p> : null}
          {children}
        </div>
      </div>
    </section>
  );
}

/* ---------- Поле с ползунком и числовым вводом ---------- */

interface DimFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** шаг кнопок «−» и «+» */
  quick: number;
  unit?: string;
  hint?: string;
  onChange: (next: number) => void;
}

export function DimField({
  label,
  value,
  min,
  max,
  step,
  quick,
  unit = 'мм',
  hint,
  onChange,
}: DimFieldProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [draft, setDraft] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  // Пока пользователь вводит — не перебиваем черновик, после потери фокуса
  // всегда показываем нормализованное значение модели.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = (raw: string): void => {
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length === 0) {
      setDraft(String(value));
      return;
    }
    const next = snap(Number(digits), min, max, step);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const bump = (delta: number): void => {
    onChange(snap(value + delta, min, max, step));
  };

  return (
    <div className="ui-field">
      <div className="ui-field-head">
        <label className="ui-field-label" htmlFor={inputId}>
          {label}
        </label>
        {hint ? (
          <span className="ui-field-hint" id={hintId}>
            {hint}
          </span>
        ) : null}
      </div>
      <div className="ui-field-row">
        <button
          type="button"
          className="ui-step"
          onClick={() => bump(-quick)}
          disabled={value <= min}
          aria-label={`${label}: уменьшить на ${quick} мм`}
        >
          −
        </button>
        <span className="ui-num-wrap">
          <input
            id={inputId}
            className="ui-num"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            aria-describedby={hint ? hintId : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit(draft);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit(draft);
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                setDraft(String(value));
                event.currentTarget.blur();
              }
            }}
          />
          <span className="ui-num-unit" aria-hidden="true">
            {unit}
          </span>
        </span>
        <button
          type="button"
          className="ui-step"
          onClick={() => bump(quick)}
          disabled={value >= max}
          aria-label={`${label}: увеличить на ${quick} мм`}
        >
          +
        </button>
      </div>
      <input
        className="ui-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label}: ползунок`}
        onChange={(event) => onChange(snap(Number(event.target.value), min, max, step))}
      />
    </div>
  );
}

/* ---------- Счётчик «меньше / значение / больше» ---------- */

interface CounterProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}

export function Counter({ label, value, min, max, onChange }: CounterProps) {
  return (
    <div className="ui-counter" role="group" aria-label={label}>
      <button
        type="button"
        className="ui-counter-btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`${label}: меньше`}
      >
        −
      </button>
      <output className="ui-counter-value" aria-label={`${label}: ${value}`}>
        {value}
      </output>
      <button
        type="button"
        className="ui-counter-btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`${label}: больше`}
      >
        +
      </button>
    </div>
  );
}

/* ---------- Свитч ---------- */

interface SwitchRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function SwitchRow({ label, hint, checked, onChange }: SwitchRowProps) {
  return (
    <div className="ui-switch-row">
      <span className="ui-switch-copy">
        <span className="ui-switch-label">{label}</span>
        {hint ? <span className="ui-switch-hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={checked ? 'ui-switch is-on' : 'ui-switch'}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch-knob" aria-hidden="true" />
      </button>
    </div>
  );
}

/* ---------- Сегментированный контрол ---------- */

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (next: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="ui-seg" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={active ? 'ui-seg-btn is-active' : 'ui-seg-btn'}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Свотчи материала ---------- */

export interface SwatchOption<T extends string> {
  id: T;
  label: string;
  color: string;
  dotStyle?: CSSProperties;
}

interface SwatchGroupProps<T extends string> {
  label: string;
  name: string;
  value: T;
  options: Array<SwatchOption<T>>;
  onChange: (next: T) => void;
}

export function SwatchGroup<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: SwatchGroupProps<T>) {
  return (
    <div className="ui-swatches" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <label key={option.id} className={active ? 'ui-swatch is-active' : 'ui-swatch'}>
            <input
              type="radio"
              className="ui-swatch-input"
              name={name}
              value={option.id}
              checked={active}
              onChange={() => onChange(option.id)}
            />
            <span
              className="ui-swatch-dot"
              style={option.dotStyle ?? { background: option.color }}
              aria-hidden="true"
            />
            <span className="ui-swatch-name">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

/* ---------- Чип-пресет ---------- */

interface ChipProps {
  label: string;
  /** подсказка в title — пресеты коротко поясняют себя при наведении */
  hint?: string;
  active: boolean;
  onClick: () => void;
}

export function Chip({ label, hint, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={active ? 'ui-chip is-active' : 'ui-chip'}
      aria-pressed={active}
      title={hint ? `${label} — ${hint}` : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
