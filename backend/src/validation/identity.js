// @ts-nocheck - shared runtime validation schemas intentionally infer from Zod.
import { z } from 'zod';
import { noProfanity, profanityMessage } from '../profanity/index.js';

export const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(
    /^[\p{L}]+(?:[ '\u002D][\p{L}]+)*$/u,
    'Must contain only letters, spaces, hyphens, or apostrophes.',
  )
  .refine(noProfanity(), { message: profanityMessage });

export const emailSchema = z.string().trim().toLowerCase().max(254).email();

export const passwordSchema = z
  .string()
  .min(10)
  .max(200)
  .regex(/[A-Z]/, 'Password needs an uppercase letter.')
  .regex(/[a-z]/, 'Password needs a lowercase letter.')
  .regex(/[0-9]/, 'Password needs a number.')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character.');

export const normalizePersonName = (value) => value.trim().replace(/\s+/g, ' ');
export const splitLegacyName = (value) => {
  const normalized = normalizePersonName(value);
  const firstSpace = normalized.indexOf(' ');
  return firstSpace < 0
    ? { firstName: normalized, lastName: null }
    : {
        firstName: normalized.slice(0, firstSpace),
        lastName: normalized.slice(firstSpace + 1),
      };
};

export const commonPasswords = new Set([
  'password123!',
  'password1234!',
  'qwerty1234!',
  'welcome123!',
  'letmein123!',
]);

export const passwordIsAllowed = (password, email, firstName) => {
  const lowered = password.toLowerCase();
  return (
    !commonPasswords.has(lowered) &&
    !lowered.includes(email.toLowerCase()) &&
    !lowered.includes(firstName.toLowerCase())
  );
};
