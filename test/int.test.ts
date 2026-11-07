import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAC, fraction, idiv, isqrt, lerp, mul, smooth } from '../src/sim/index.ts';

test('idiv floors and refuses values where doubles stop being exact', () => {
  assert.equal(idiv(7, 2), 3);
  assert.equal(idiv(-7, 2), -4);
  assert.equal(idiv(2 ** 53 - 1, 3), Math.floor((2 ** 53 - 1) / 3));
  assert.throws(() => idiv(2 ** 53, 3));
  assert.throws(() => idiv(1.5, 1));
  assert.throws(() => idiv(1, 0));
  assert.throws(() => mul(2 ** 30, 2 ** 30));
});

test('isqrt is exact', () => {
  for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 1e12, 1e12 - 1, 2 ** 52 + 12345]) {
    const r = isqrt(n);
    assert.ok(r * r <= n && (r + 1) * (r + 1) > n, `isqrt(${n}) = ${r}`);
  }
  assert.throws(() => isqrt(-1));
});

test('smooth eases from 0 to FRAC', () => {
  assert.equal(smooth(0), 0);
  assert.equal(smooth(FRAC), FRAC);
  assert.equal(smooth(FRAC / 2), FRAC / 2);
  let prev = -1;
  for (let f = 0; f <= FRAC; f += 512) {
    const v = smooth(f);
    assert.ok(v >= prev);
    prev = v;
  }
  assert.equal(lerp(100, 300, FRAC / 2), 200);
  assert.equal(fraction(5, 0, 10), FRAC / 2);
  assert.equal(fraction(50, 0, 10), FRAC);
  assert.equal(fraction(-5, 0, 10), 0);
});
