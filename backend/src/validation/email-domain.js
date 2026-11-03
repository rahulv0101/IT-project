import { Resolver } from 'node:dns/promises';

// Bound DNS work so an unavailable resolver cannot stall registration.
export const emailDns = new Resolver({ timeout: 2000, tries: 1 });
/** @param {unknown} error */
const dnsCode = (error) =>
  error && typeof error === 'object' && 'code' in error
    ? error.code
    : undefined;
/** @param {unknown} error */
const missing = (error) =>
  ['ENOTFOUND', 'ENODATA'].some((code) => code === dnsCode(error));

/**
 * DNS proves domain mail routing, while the verification code proves ownership.
 * @param {string} email
 * @param {{resolveMx: (domain: string) => Promise<Array<{exchange: string}>>, resolve4: (domain: string) => Promise<string[]>, resolve6: (domain: string) => Promise<string[]>}} resolver
 */
export async function emailDomainStatus(email, resolver = emailDns) {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  try {
    const records = await resolver.resolveMx(domain);
    if (records.length)
      return records.some(
        (record) => record.exchange && record.exchange !== '.',
      )
        ? 'valid'
        : 'invalid'; // A null MX explicitly refuses mail.
  } catch (error) {
    if (dnsCode(error) === 'ENOTFOUND') return 'invalid';
    if (!missing(error)) return 'unavailable';
  }
  // SMTP permits an implicit MX when a domain has address records only.
  const addresses = await Promise.allSettled([
    resolver.resolve4(domain),
    resolver.resolve6(domain),
  ]);
  if (
    addresses.some(
      (result) => result.status === 'fulfilled' && result.value.length,
    )
  )
    return 'valid';
  return addresses.some(
    (result) => result.status === 'rejected' && !missing(result.reason),
  )
    ? 'unavailable'
    : 'invalid';
}

/** The same mail-routing validation and inline feedback for every creation form.
 * @param {string} email
 */
export async function emailDomainValidation(email) {
  const status = await emailDomainStatus(email);
  if (status === 'valid') return null;
  return {
    status: status === 'invalid' ? 422 : 503,
    code:
      status === 'invalid'
        ? 'INVALID_EMAIL_DOMAIN'
        : 'EMAIL_DOMAIN_UNAVAILABLE',
    message:
      status === 'invalid'
        ? 'This email domain cannot receive mail. Check the spelling of your email address.'
        : 'We could not verify this email domain right now. Please try again.',
  };
}
