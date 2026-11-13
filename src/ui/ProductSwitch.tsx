/**
 * Переключатель типа мебели в шапке панели:
 * встроенный шкаф ↔ комод ↔ тумба ↔ кровать.
 * Локального состояния нет: активный тип приходит из App, смена уходит
 * наверх одним значением через onChange.
 *
 * Доступность: role="group" + aria-pressed на кнопках, нативные тап-зоны,
 * стрелки ← / → и Home / End переводят выбор (Tab и Enter работают штатно).
 */
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { ProductKind, ProductSwitchProps } from '../lib/ui-contract';
import './ui.css';

interface ProductOption {
  id: ProductKind;
  /** полная подпись для aria-label и широкой панели */
  label: string;
  /** короткая подпись для узких экранов */
  short: string;
}

const OPTIONS: ProductOption[] = [
  { id: 'wardrobe', label: 'Встроенный шкаф', short: 'Шкаф' },
  { id: 'dresser', label: 'Комод', short: 'Комод' },
  { id: 'tumba', label: 'Тумба', short: 'Тумба' },
  { id: 'bed', label: 'Кровать', short: 'Кровать' },
];

/**
 * Монохромные иконки-символы: рисуются currentColor.
 * Никаких эмодзи, шрифтовых иконок и внешних ассетов.
 */
function ProductGlyph({ product }: { product: ProductKind }) {
  if (product === 'wardrobe') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="4.5" y="3" width="15" height="18" rx="1.2" />
        <path d="M12 3v18" />
        <path d="M9.6 10.5v3" />
        <path d="M14.4 10.5v3" />
      </svg>
    );
  }

  if (product === 'dresser') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3" y="6.5" width="18" height="12.5" rx="1.2" />
        <path d="M3 12.75h18" />
        <path d="M7.5 9.6h3.5" />
        <path d="M7.5 16h3.5" />
        <path d="M17.5 9.6h1.5" />
        <path d="M17.5 16h1.5" />
        <path d="M6 19v2" />
        <path d="M18 19v2" />
      </svg>
    );
  }

  // Тумба: тот же язык, что у комода, но корпус ниже и компактнее.
  if (product === 'tumba') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3" y="7.5" width="18" height="9.5" rx="1.2" />
        <path d="M3 12.25h18" />
        <path d="M7.5 9.9h3" />
        <path d="M13.5 9.9h3" />
        <path d="M7.5 14.6h3" />
        <path d="M13.5 14.6h3" />
        <path d="M6 17v2" />
        <path d="M18 17v2" />
      </svg>
    );
  }

  // Кровать в профиль: изголовье слева, спальное место, ящики и ножки.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.5 19.5V6.5" />
      <path d="M3.5 6.5h2.4" />
      <rect x="6" y="8.1" width="5.2" height="2.4" rx="0.9" />
      <path d="M3.5 12.5h17" />
      <path d="M20.5 12.5v3.9" />
      <path d="M3.5 16.4h17" />
      <path d="M6 16.4v3.1" />
      <path d="M18 16.4v3.1" />
      <path d="M10.5 16.4v-2.2" />
      <path d="M14 16.4v-2.2" />
    </svg>
  );
}

export function ProductSwitch({ product, onChange }: ProductSwitchProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (next: ProductKind, focus = true): void => {
    if (next !== product) onChange(next);
    if (!focus) return;
    const index = OPTIONS.findIndex((option) => option.id === next);
    buttons.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Отсчёт идёт от кнопки в фокусе, а если фокус вне группы — от выбранного типа.
    const focusedIndex = buttons.current.findIndex(
      (node) => node !== null && node === document.activeElement,
    );
    const current =
      focusedIndex >= 0
        ? focusedIndex
        : Math.max(
            0,
            OPTIONS.findIndex((option) => option.id === product),
          );

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      select(OPTIONS[(current + 1) % OPTIONS.length].id);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      select(OPTIONS[(current - 1 + OPTIONS.length) % OPTIONS.length].id);
    } else if (event.key === 'Home') {
      event.preventDefault();
      select(OPTIONS[0].id);
    } else if (event.key === 'End') {
      event.preventDefault();
      select(OPTIONS[OPTIONS.length - 1].id);
    }
  };

  // Три-четыре изделия не помещаются в строку с иконкой — включаем столбиковую
  // раскладку (для четырёх — четыре равные колонки с короткими подписями).
  const rootClass =
    OPTIONS.length > 3
      ? 'ui-product-switch ui-product-switch--four'
      : OPTIONS.length > 2
        ? 'ui-product-switch ui-product-switch--three'
        : 'ui-product-switch';

  return (
    <div className={rootClass} role="group" aria-label="Тип мебели" onKeyDown={handleKeyDown}>
      {OPTIONS.map((option, index) => {
        const active = option.id === product;
        return (
          <button
            key={option.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            className={active ? 'ui-product-switch-btn is-active' : 'ui-product-switch-btn'}
            aria-pressed={active}
            aria-label={option.label}
            onClick={() => select(option.id, false)}
          >
            <span className="ui-product-switch-icon" aria-hidden="true">
              <ProductGlyph product={option.id} />
            </span>
            <span className="ui-product-switch-label">
              <span className="ui-product-switch-long">{option.label}</span>
              <span className="ui-product-switch-short">{option.short}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ProductSwitch;
