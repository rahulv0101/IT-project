import { expect, it } from 'vitest';
import { selectSourceText } from '../scripts/ai-source.js';

it('bounds oversized extracted source for local model context without using a placeholder', () => {
  const source = 'Database indexing is important. '.repeat(1000);
  const limit = 6000;
  const bounded = selectSourceText(source, limit);
  expect(bounded.length).toBeGreaterThan(0);
  expect(bounded).toContain('important.');
  expect(bounded).not.toContain('Uploaded educational material.');
  expect(bounded.length).toBeLessThanOrEqual(limit);
  for (const excerpt of bounded.split('\n\n'))
    expect(source).toContain(excerpt);
});

it('retains short documents exactly and samples the middle of long documents', () => {
  expect(selectSourceText('A primary key identifies each row.')).toBe(
    'A primary key identifies each row.',
  );
  const source =
    'opening '.repeat(1000) + 'middle '.repeat(2000) + 'ending '.repeat(1000);
  expect(selectSourceText(source)).toContain('middle');
  expect(() => selectSourceText(source, -1)).toThrow('Invalid source limit');
});
