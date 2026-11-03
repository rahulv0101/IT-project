import { emailDns } from '../../src/validation/email-domain.js';

// This entry point is used only by the isolated browser test stack.
// Keep fixture registrations offline without bypasses in the application server.
emailDns.resolveMx = async (domain) => {
  if (domain === 'example.com')
    return [{ exchange: 'mx.example.com', priority: 0 }];
  throw Object.assign(new Error('Fixture domain does not exist'), {
    code: 'ENOTFOUND',
  });
};
await import('../../src/index.js');
