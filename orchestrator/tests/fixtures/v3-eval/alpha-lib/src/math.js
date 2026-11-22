export function add(a, b) { return a + b; }
export function mul(a, b) { return a * b; }
// BUG: clamp incorrectly allows below min
export function clamp(n, min, max) {
  if (n > max) return max;
  return n;
}
