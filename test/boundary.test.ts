// The rules must stay loadable by a server on their own: src/sim imports nothing outside
// itself, and nothing that could differ between machines.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dir = fileURLToPath(new URL('../src/sim/', import.meta.url));

test('the rules import only each other', () => {
  for (const file of readdirSync(dir)) {
    const text = readFileSync(join(dir, file), 'utf8');
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      assert.match(m[1]!, /^\.\/[a-z-]+\.ts$/, `${file} imports ${m[1]}`);
    }
  }
});

test('the rules use no clock, no randomness and no floating-point maths', () => {
  const banned = /\b(Date|performance|Math\.random|crypto|Math\.(sin|cos|tan|atan2|exp|log|pow|hypot|cbrt))\b/;
  for (const file of readdirSync(dir)) {
    const lines = readFileSync(join(dir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
      assert.doesNotMatch(line, banned, `${file}:${i + 1}`);
    });
  }
});
