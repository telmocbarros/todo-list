export interface UserModel {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  /** When the user followed the verification link; null until then, and they cannot log in. */
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What may leave the API: a user without their password hash. */
export type TPublicUser = Omit<UserModel, 'passwordHash'>;

export const toPublicUser = ({ passwordHash: _passwordHash, ...user }: UserModel): TPublicUser => user;
