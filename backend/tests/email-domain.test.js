import { describe, expect, it, vi } from 'vitest';
import { emailDomainStatus } from '../src/validation/email-domain.js';

/** @param {string} code */
const failure = (code) => Object.assign(new Error(code), { code });
const resolver = () => ({
  resolveMx: vi
    .fn()
    .mockResolvedValue([{ exchange: 'mx.school.ac.za', priority: 10 }]),
  resolve4: vi.fn().mockRejectedValue(failure('ENODATA')),
  resolve6: vi.fn().mockRejectedValue(failure('ENODATA')),
});

describe('email domain mail routing', () => {
  it('accepts mail domains without restricting providers', async () => {
    const dns = resolver();
    expect(await emailDomainStatus('learner@school.ac.za', dns)).toBe('valid');
    expect(dns.resolveMx).toHaveBeenCalledWith('school.ac.za');
    expect(dns.resolve4).not.toHaveBeenCalled();
  });
  it('rejects nonexistent domains and explicit null MX records', async () => {
    const dns = resolver();
    dns.resolveMx.mockRejectedValueOnce(failure('ENOTFOUND'));
    expect(await emailDomainStatus('learner@gmail.con', dns)).toBe('invalid');
    for (const exchange of ['', '.']) {
      dns.resolveMx.mockResolvedValueOnce([{ exchange, priority: 0 }]);
      expect(await emailDomainStatus('learner@example.com', dns)).toBe(
        'invalid',
      );
    }
    expect(dns.resolve4).not.toHaveBeenCalled();
  });
  it('accepts implicit MX only with an IPv4 or IPv6 address', async () => {
    for (const family of /** @type {const} */ (['resolve4', 'resolve6'])) {
      const dns = resolver();
      dns.resolveMx.mockRejectedValue(failure('ENODATA'));
      dns[family].mockResolvedValue(['address']);
      expect(await emailDomainStatus('learner@school.ac.za', dns)).toBe(
        'valid',
      );
    }
    const dns = resolver();
    dns.resolveMx.mockResolvedValue([]);
    expect(await emailDomainStatus('learner@school.ac.za', dns)).toBe(
      'invalid',
    );
  });
  it('distinguishes temporary DNS failures from invalid domains', async () => {
    const dns = resolver();
    dns.resolveMx.mockRejectedValueOnce(failure('ETIMEOUT'));
    expect(await emailDomainStatus('learner@school.ac.za', dns)).toBe(
      'unavailable',
    );
    dns.resolveMx.mockResolvedValueOnce([]);
    dns.resolve4.mockRejectedValueOnce(failure('ESERVFAIL'));
    expect(await emailDomainStatus('learner@school.ac.za', dns)).toBe(
      'unavailable',
    );
  });
});
