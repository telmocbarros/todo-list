import { LIMITS, TOKEN } from './input.js';

/**
 * The one answer to every request that may send an email (signup, resend, forgot password), whatever
 * happened: the outcome goes to the inbox, so the response cannot reveal whether an account exists.
 */
export const CHECK_EMAIL = { message: 'Check your email to continue' } as const;

/** A password being chosen. The upper bound stops a huge password from making argon2 burn CPU and memory. */
export const newPasswordSchema = {
  type: 'string',
  minLength: LIMITS.passwordMinLength,
  maxLength: LIMITS.passwordMaxLength,
} as const;

/** The token from an emailed link. */
export const emailTokenSchema = { type: 'string', maxLength: LIMITS.tokenLength, pattern: TOKEN } as const;

export interface IIdParams {
  id: string;
}

export const idParams = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
} as const;
