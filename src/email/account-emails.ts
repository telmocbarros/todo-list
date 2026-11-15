import type { IEmailSender } from './email-sender.js';

/** The emails about a user's account, with links into the app at `appUrl`. */
export class AccountEmails {
  constructor(
    private readonly sender: IEmailSender,
    private readonly appUrl: string,
  ) {}

  verifyEmail(to: string, token: string): Promise<void> {
    return this.sender.send({
      to,
      subject: 'Confirm your email',
      text: [
        'Welcome! Confirm your email to finish creating your account:',
        '',
        this.link('/verify-email', token),
        '',
        'The link works once and expires in 24 hours. If you did not sign up, ignore this email.',
      ].join('\n'),
    });
  }

  /** Sent instead of a verification link when the address already has an account. */
  signupAttempt(to: string): Promise<void> {
    return this.sender.send({
      to,
      subject: 'Someone tried to sign up with your email',
      text: [
        'Someone tried to sign up with this email address, but it already has an account.',
        '',
        `If it was you, log in instead, or reset your password at ${this.appUrl}/forgot-password.`,
        'If it was not you, you can ignore this email: nothing has changed.',
      ].join('\n'),
    });
  }

  /** Sent to a new address whose chosen username belongs to someone else. */
  usernameTaken(to: string, username: string): Promise<void> {
    return this.sender.send({
      to,
      subject: 'Choose another username',
      text: [
        `The username "${username}" is already taken, so no account was created.`,
        '',
        `Sign up again with another username at ${this.appUrl}/signup.`,
      ].join('\n'),
    });
  }

  passwordReset(to: string, token: string): Promise<void> {
    return this.sender.send({
      to,
      subject: 'Reset your password',
      text: [
        'Someone asked to reset the password for your account. To choose a new one, open:',
        '',
        this.link('/reset-password', token),
        '',
        'The link works once and expires in 1 hour. Resetting signs you out everywhere.',
        'If you did not ask for this, ignore this email: your password has not changed.',
      ].join('\n'),
    });
  }

  private link(path: string, token: string): string {
    return `${this.appUrl}${path}?token=${token}`;
  }
}
