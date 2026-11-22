import test from 'node:test';
import assert from 'node:assert/strict';
import { clear } from '../lib/store.js';
import { addItem } from '../src/cart.js';
import { canCheckout, shippingCost } from '../src/checkout.js';
test('checkout', () => { clear(); assert.equal(canCheckout(['x']), false); addItem('x', 1); assert.equal(canCheckout(['x']), true); assert.equal(shippingCost(['x']), 5); });
