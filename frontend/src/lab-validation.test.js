import { describe, expect, it } from 'vitest';
import { validateLabHtml } from './lab-validation.js';

describe('practice lab HTML validation', () => {
  it('reports the malformed source from the student screenshot with a location', () => {
    const errors = validateLabHtml(
      'Html code;\n<!DOCTYPE html>\n<head>\n<title>My First Webpage</title>\nhead>\n<h1>word<h1>',
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].text).toContain('HTML line 2, column 1:');
  });
  it.each([
    '<h1>word<h1>',
    '<div><span>Hello</div>',
    '<p id="a" id="b">Text</p>',
  ])('reports broken markup: %s', (html) => {
    expect(validateLabHtml(html).length).toBeGreaterThan(0);
  });
  it.each([
    '<h1>Heading</h1><p>Paragraph</p>',
    '<!doctype html><html><head><title>Test</title></head><body><h1>Heading</h1><p>Paragraph</p></body></html>',
    '<ul><li>One<li>Two</ul>',
    '<p>Optional paragraph closing tag',
  ])('accepts valid full documents and fragments: %s', (html) => {
    expect(validateLabHtml(html)).toEqual([]);
  });
});
