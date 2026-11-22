import test from 'node:test';
import assert from 'node:assert/strict';
import { clear } from '../lib/store.js';
import { addItem, totalItems, removeItem } from '../src/cart.js';
test('add and total', () => { clear(); addItem('a', 2); addItem('b', 1); assert.equal(totalItems(['a','b']), 3); });
test('remove partial', () => { clear(); addItem('a', 3); assert.equal(removeItem('a', 1), 2); });
