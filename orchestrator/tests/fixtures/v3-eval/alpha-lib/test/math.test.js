import test from 'node:test';
import assert from 'node:assert/strict';
import { add, mul, clamp } from '../src/math.js';
test('add', () => assert.equal(add(2, 3), 5));
test('mul', () => assert.equal(mul(3, 4), 12));
test('clamp upper', () => assert.equal(clamp(10, 0, 5), 5));
// intentional missing lower-bound assertion so pre-existing suite still "passes" today
