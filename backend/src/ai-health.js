// Serverless Python instances can take several seconds to start. Share probes
// across resource cards and cache success briefly; failed probes remain retryable.
/**
 * @param {{timeoutMs?: number, healthyTtlMs?: number, fetchFn?: typeof fetch, now?: () => number}} [options]
 * @returns {(serviceUrl: string, token: string) => Promise<boolean>}
 */
export function createAiHealthProbe({
  timeoutMs = 15000,
  healthyTtlMs = 30000,
  fetchFn = (url, options) => fetch(url, options),
  now = () => Date.now(),
} = {}) {
  /** @type {Promise<boolean> | undefined} */
  let inFlight;
  /** @type {string | undefined} */
  let activeKey;
  let healthyUntil = 0;
  return async (serviceUrl, token) => {
    const url = `${serviceUrl.replace(/\/+$/, '')}/health`;
    const key = JSON.stringify([url, token]);
    if (activeKey === key) {
      if (healthyUntil > now()) return true;
      if (inFlight) return inFlight;
    }
    activeKey = key;
    healthyUntil = 0;
    const request = (async () => {
      try {
        const response = await fetchFn(url, {
          headers: { 'x-ai-service-token': token },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const healthy = response.ok && (await response.json()).status === 'ok';
        if (activeKey === key && healthy) healthyUntil = now() + healthyTtlMs;
        return healthy;
      } catch {
        return false;
      }
    })();
    inFlight = request;
    try {
      return await request;
    } finally {
      if (inFlight === request) inFlight = undefined;
    }
  };
}
