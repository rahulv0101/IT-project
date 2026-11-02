import { describe, expect, it } from 'vitest';
import { normalizeQuery } from '../src/serverless-request.js';

describe('Vercel request normalization', () => {
  it('excludes platform rewrite captures from strict API query validation', () => {
    const req = {
      url: '/api/v1/me/sessions?pageSize=3',
      query: { path: ['me', 'sessions'], pageSize: '3' },
    };
    normalizeQuery(req);
    expect(req.query).toEqual({ pageSize: '3' });
  });
  it('preserves caller-supplied unexpected fields and duplicate query values', () => {
    const req = {
      url: '/api/v1/labs?path=unexpected&pageSize=3&pageSize=4',
      query: {},
    };
    normalizeQuery(req);
    expect(req.query).toEqual({ path: 'unexpected', pageSize: ['3', '4'] });
  });
});
