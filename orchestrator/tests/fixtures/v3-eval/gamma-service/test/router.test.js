import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/router.js';
test('health', () => assert.equal(handle({ path: '/health', token: 'secret' }).status, 200));
test('denied', () => assert.equal(handle({ path: '/health', token: 'x' }).status, 401));
test('version', () => assert.equal(handle({ path: '/version', token: 'secret' }).body, '1.0.0'));
