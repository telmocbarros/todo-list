export type LoginDTO = {
  email: string;
  password: string;
};

export type ForgotPasswordDTO = {
  email: string;
};

export type ResetPasswordDTO = {
  token: string;
  password: string;
};
