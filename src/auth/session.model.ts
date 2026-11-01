export interface SessionModel {
  /** SHA-256 hash of the token in the cookie. The token itself is never stored. */
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}
