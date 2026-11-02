import { parse } from 'node:querystring';

/** Vercel includes rewrite captures in req.query. Express validators must see
 * only the query actually supplied by the caller, including duplicate values.
 * @param {{ url?: string, query?: object }} req
 */
export function normalizeQuery(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  Object.defineProperty(req, 'query', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: parse(url.search.slice(1)),
  });
}
