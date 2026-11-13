/** Форматирование чисел, размеров и цен по-русски. */

const ru = (value: number, digits = 0): string =>
  value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** 1234 → «1 234» */
export function num(value: number): string {
  return ru(value, 0);
}

/** 108500 → «108 500 ₽» */
export function rub(value: number): string {
  return `${ru(Math.round(value), 0)} ₽`;
}

/** 2600 → «2 600 мм» */
export function mm(value: number): string {
  return `${ru(Math.round(value), 0)} мм`;
}

/** «2 000 × 2 600 × 600 мм» */
export function dims(w: number, h: number, d: number): string {
  return `${ru(w, 0)} × ${ru(h, 0)} × ${ru(d, 0)} мм`;
}

/** 6.88 → «6,88 м²» */
export function areaM2(value: number): string {
  return `${ru(value, 2)} м²`;
}

/** Проценты без лишних нулей: 0.12 → «12%» */
export function percent(rate: number): string {
  return `${ru(rate * 100, 0)}%`;
}

/** Площадь в м² с точностью до сотых (округление, не форматирование). */
export function m2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Округление денег до 100 ₽. */
export function round100(value: number): number {
  return Math.round(value / 100) * 100;
}
