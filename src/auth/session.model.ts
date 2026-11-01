export interface SessionModel {
  /** SHA-256 hash of the token in the cookie. The token itself is never stored. */
  id: string;
  userId: string;
  /** Also the start of the absolute cap: no session outlives `createdAt` + 30 days. */
  createdAt: string;
  /** The idle deadline. It slides forward while the session is used, but never past the absolute cap. */
  expiresAt: string;
}
