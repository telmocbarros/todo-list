import type { UserModel } from './user.model.js';

export type SignupDTO = Pick<UserModel, 'email' | 'username' | 'firstName' | 'lastName'> & {
  password: string;
};

export type VerifyEmailDTO = {
  token: string;
};

export type ResendVerificationDTO = {
  email: string;
};
