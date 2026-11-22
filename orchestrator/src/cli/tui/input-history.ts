/** Session prompt history helpers (max 20, newest last). */

export const INPUT_HISTORY_CAP = 20;

export function pushInputHistory(
  prev: string[],
  entry: string,
  cap = INPUT_HISTORY_CAP,
): string[] {
  const t = entry.trim();
  if (!t) return prev;
  const withoutDup = prev.filter((x) => x !== t);
  return [...withoutDup, t].slice(-cap);
}
