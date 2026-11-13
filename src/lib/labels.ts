/**
 * Русские подписи с правильной формой слова: «1 ящик / 2 ящика / 5 ящиков».
 * Вынесено из dresser.ts, чтобы панель и заявка не дублировали склонения.
 */

/** Правильная форма слова по числу. */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** 3 → «3 ящика» */
export function drawersLabel(count: number): string {
  return `${count} ${plural(count, 'ящик', 'ящика', 'ящиков')}`;
}

/** 2 → «2 двери» */
export function doorsLabel(count: number): string {
  return `${count} ${plural(count, 'дверь', 'двери', 'дверей')}`;
}

/** 4 → «4 полки» */
export function shelvesLabel(count: number): string {
  return `${count} ${plural(count, 'полка', 'полки', 'полок')}`;
}

/** 2 → «2 створки» */
export function leavesLabel(count: number): string {
  return `${count} ${plural(count, 'створка', 'створки', 'створок')}`;
}
