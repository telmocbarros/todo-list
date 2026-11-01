export interface UserModel {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

/** What may leave the API: a user without their password hash. */
export type TPublicUser = Omit<UserModel, 'passwordHash'>;
