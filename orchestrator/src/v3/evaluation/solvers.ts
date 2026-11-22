/**
 * Deterministic task solvers for CI evaluation fixtures.
 * Labeled DETERMINISTIC_SOLVER — not an LLM; proves Core orchestration on real multi-file repos.
 */

import type { EngineeringWorkspace } from "../engineering/workspace.js";

export type SolverResult = { ok: boolean; files_changed: string[]; notes: string };

export function applyTaskSolution(ws: EngineeringWorkspace, taskId: string): SolverResult {
  switch (taskId) {
    case "T01":
      ws.writeFile(
        "src/math.js",
        [
          "export function add(a, b) { return a + b; }",
          "export function mul(a, b) { return a * b; }",
          "export function clamp(n, min, max) {",
          "  if (n < min) return min;",
          "  if (n > max) return max;",
          "  return n;",
          "}",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "test/clamp-lower.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { clamp } from '../src/math.js';",
          "test('clamp lower', () => assert.equal(clamp(-1, 0, 5), 0));",
          "",
        ].join("\n"),
      );
      return { ok: true, files_changed: ["src/math.js", "test/clamp-lower.test.js"], notes: "fixed clamp" };

    case "T02":
      ws.writeFile(
        "src/math.js",
        [
          "export function add(a, b) { return a + b; }",
          "export function sub(a, b) { return a - b; }",
          "export function mul(a, b) { return a * b; }",
          "export function clamp(n, min, max) {",
          "  if (n < min) return min;",
          "  if (n > max) return max;",
          "  return n;",
          "}",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "src/index.js",
        "export { add, mul, clamp, sub } from './math.js';\nexport function formatPair(a, b) { return `${a}:${b}`; }\n",
      );
      ws.writeFile(
        "test/sub.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { sub } from '../src/index.js';",
          "test('sub', () => assert.equal(sub(5, 2), 3));",
          "",
        ].join("\n"),
      );
      return {
        ok: true,
        files_changed: ["src/math.js", "src/index.js", "test/sub.test.js"],
        notes: "added sub",
      };

    case "T03":
      ws.writeFile(
        "src/index.js",
        "export { add, mul, clamp } from './math.js';\nexport function formatPair(a, b) { return `${a}-${b}`; }\n",
      );
      ws.writeFile(
        "test/format.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { formatPair } from '../src/index.js';",
          "test('formatPair dash', () => assert.equal(formatPair(1, 2), '1-2'));",
          "",
        ].join("\n"),
      );
      return { ok: true, files_changed: ["src/index.js", "test/format.test.js"], notes: "formatPair hardened" };

    case "T04":
      ws.writeFile(
        "lib/store.js",
        [
          "const db = new Map();",
          "export function set(k, v) { db.set(k, v); return true; }",
          "export function get(k) { return db.has(k) ? db.get(k) : null; }",
          "export function has(k) { return db.has(k); }",
          "export function del(k) { return db.delete(k); }",
          "export function clear() { db.clear(); }",
          "export function keys() { return [...db.keys()]; }",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "src/cart.js",
        [
          "import { get, set, del } from '../lib/store.js';",
          "export function addItem(id, qty) {",
          "  const cur = get(id) || 0;",
          "  set(id, cur + qty);",
          "  return get(id);",
          "}",
          "export function totalItems(ids) {",
          "  return ids.reduce((s, id) => s + (get(id) || 0), 0);",
          "}",
          "export function removeItem(id, qty) {",
          "  const cur = get(id) || 0;",
          "  const next = Math.max(0, cur - qty);",
          "  if (next === 0) { del(id); return null; }",
          "  set(id, next);",
          "  return get(id);",
          "}",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "test/remove-zero.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { clear, has } from '../lib/store.js';",
          "import { addItem, removeItem } from '../src/cart.js';",
          "test('remove to zero deletes', () => { clear(); addItem('a', 2); assert.equal(removeItem('a', 2), null); assert.equal(has('a'), false); });",
          "",
        ].join("\n"),
      );
      return {
        ok: true,
        files_changed: ["lib/store.js", "src/cart.js", "test/remove-zero.test.js"],
        notes: "removeItem delete",
      };

    case "T05":
      ws.writeFile(
        "src/checkout.js",
        [
          "import { totalItems } from './cart.js';",
          "export function canCheckout(ids) { return totalItems(ids) > 0; }",
          "export function shippingCost(ids) {",
          "  if (!canCheckout(ids)) return 0;",
          "  if (totalItems(ids) >= 10) return 0;",
          "  return 5;",
          "}",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "test/discount.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { clear } from '../lib/store.js';",
          "import { addItem } from '../src/cart.js';",
          "import { shippingCost } from '../src/checkout.js';",
          "test('free shipping', () => { clear(); addItem('a', 10); assert.equal(shippingCost(['a']), 0); });",
          "",
        ].join("\n"),
      );
      return { ok: true, files_changed: ["src/checkout.js", "test/discount.test.js"], notes: "discount" };

    case "T06":
      ws.writeFile(
        "lib/store.js",
        [
          "const db = new Map();",
          "export function set(k, v) { db.set(k, v); return true; }",
          "export function get(k) { return db.has(k) ? db.get(k) : null; }",
          "export function has(k) { return db.has(k); }",
          "export function del(k) { return db.delete(k); }",
          "export function clear() { db.clear(); }",
          "export function keys() { return [...db.keys()]; }",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "src/cart.js",
        [
          "import { get, set, keys } from '../lib/store.js';",
          "export function addItem(id, qty) {",
          "  const cur = get(id) || 0;",
          "  set(id, cur + qty);",
          "  return get(id);",
          "}",
          "export function totalItems(ids) {",
          "  const setIds = new Set(ids);",
          "  return keys().filter((k) => setIds.has(k)).reduce((s, id) => s + (get(id) || 0), 0);",
          "}",
          "export function removeItem(id, qty) {",
          "  const cur = get(id) || 0;",
          "  set(id, Math.max(0, cur - qty));",
          "  return get(id);",
          "}",
          "",
        ].join("\n"),
      );
      return { ok: true, files_changed: ["lib/store.js", "src/cart.js"], notes: "refactor totalItems" };

    case "T07":
      ws.writeFile(
        "src/router.js",
        [
          "import { loadConfig } from './config.js';",
          "import { isAuthorized } from './auth.js';",
          "export function handle(req) {",
          "  const cfg = loadConfig();",
          "  if (!isAuthorized(req.token, cfg.featureFlags)) return { status: 401, body: 'denied' };",
          "  if (req.path === '/health') return { status: 200, body: 'ok' };",
          "  if (req.path === '/version') return { status: 200, body: cfg.version };",
          "  if (req.path === '/echo') return { status: 200, body: req.body ?? '' };",
          "  return { status: 404, body: 'missing' };",
          "}",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "test/echo.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { handle } from '../src/router.js';",
          "test('echo', () => assert.equal(handle({ path: '/echo', token: 'secret', body: 'hi' }).body, 'hi'));",
          "test('echo denied', () => assert.equal(handle({ path: '/echo', token: 'x', body: 'hi' }).status, 401));",
          "",
        ].join("\n"),
      );
      return { ok: true, files_changed: ["src/router.js", "test/echo.test.js"], notes: "echo route" };

    case "T08":
      ws.writeFile(
        "src/auth.js",
        [
          "export function isAuthorized(token, flags) {",
          "  if (!flags.auth) return true;",
          "  if (flags.cache === true && token === 'cached') return true;",
          "  return token === 'secret';",
          "}",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "test/auth-cache.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { isAuthorized } from '../src/auth.js';",
          "test('cache token', () => assert.equal(isAuthorized('cached', { auth: true, cache: true }), true));",
          "test('secret still', () => assert.equal(isAuthorized('secret', { auth: true, cache: true }), true));",
          "test('denied', () => assert.equal(isAuthorized('x', { auth: true, cache: true }), false));",
          "",
        ].join("\n"),
      );
      return { ok: true, files_changed: ["src/auth.js", "test/auth-cache.test.js"], notes: "cache short-circuit" };

    case "T09":
      ws.writeFile(
        "config.json",
        JSON.stringify(
          { port: 3000, featureFlags: { auth: true, cache: false }, version: "1.1.0" },
          null,
          2,
        ) + "\n",
      );
      // Update pre-existing assertion — required to avoid silent regression
      ws.writeFile(
        "test/router.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { handle } from '../src/router.js';",
          "test('health', () => assert.equal(handle({ path: '/health', token: 'secret' }).status, 200));",
          "test('denied', () => assert.equal(handle({ path: '/health', token: 'x' }).status, 401));",
          "test('version', () => assert.equal(handle({ path: '/version', token: 'secret' }).body, '1.1.0'));",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "test/version-bump.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { handle } from '../src/router.js';",
          "test('version bump', () => assert.equal(handle({ path: '/version', token: 'secret' }).body, '1.1.0'));",
          "",
        ].join("\n"),
      );
      return {
        ok: true,
        files_changed: ["config.json", "test/router.test.js", "test/version-bump.test.js"],
        notes: "version bump",
      };

    case "T10":
      ws.writeFile(
        "src/checkout.js",
        [
          "import { totalItems } from './cart.js';",
          "export function canCheckout(ids) { return totalItems(ids) > 0; }",
          "export function shippingCost(ids) {",
          "  const raw = canCheckout(ids) ? 5 : 0;",
          "  return Math.max(0, raw);",
          "}",
          "",
        ].join("\n"),
      );
      ws.writeFile(
        "test/shipping-nonneg.test.js",
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { clear } from '../lib/store.js';",
          "import { shippingCost } from '../src/checkout.js';",
          "test('nonneg', () => { clear(); assert.ok(shippingCost([]) >= 0); });",
          "",
        ].join("\n"),
      );
      return {
        ok: true,
        files_changed: ["src/checkout.js", "test/shipping-nonneg.test.js"],
        notes: "nonneg shipping",
      };

    default:
      return { ok: false, files_changed: [], notes: `no solver for ${taskId}` };
  }
}
