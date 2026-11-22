const db = new Map();
export function set(k, v) { db.set(k, v); return true; }
export function get(k) { return db.has(k) ? db.get(k) : null; }
export function has(k) { return db.has(k); }
export function clear() { db.clear(); }
