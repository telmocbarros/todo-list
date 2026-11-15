export const EMAIL_TOKEN_TYPES = ['verify', 'reset'] as const;
export type TEmailTokenType = (typeof EMAIL_TOKEN_TYPES)[number];

export interface EmailTokenModel {
  id: string;
  userId: string;
  /** `verify` confirms the email address; `reset` sets a new password. */
  type: TEmailTokenType;
  /** SHA-256 hash of the token in the link, so a leaked database does not leak working links. */
  tokenHash: string;
  expiresAt: string;
  /** Set when the link is followed. Tokens are single use. */
  usedAt: string | null;
  createdAt: string;
}
