import { get, set } from '../lib/store.js';
export function addItem(id, qty) {
  const cur = get(id) || 0;
  set(id, cur + qty);
  return get(id);
}
export function totalItems(ids) {
  return ids.reduce((s, id) => s + (get(id) || 0), 0);
}
// BUG: removeItem does not delete when qty reaches 0
export function removeItem(id, qty) {
  const cur = get(id) || 0;
  set(id, Math.max(0, cur - qty));
  return get(id);
}
