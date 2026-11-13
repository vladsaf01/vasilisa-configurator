/** Общая геометрия наполнения секций (шкаф и комод). */

/**
 * Центры полок между yBottom и yTop. Больше полок, чем позволяет высота,
 * не ставим: минимальный шаг — 120 мм.
 */
export function shelfPositions(yBottom: number, yTop: number, count: number): number[] {
  if (count <= 0) return [];
  const usable = yTop - yBottom;
  if (usable < 100) return [];
  const maxCount = Math.max(1, Math.min(count, Math.floor(usable / 120)));
  const positions: number[] = [];
  for (let i = 1; i <= maxCount; i += 1) {
    positions.push(yBottom + (i * usable) / (maxCount + 1));
  }
  return positions;
}
