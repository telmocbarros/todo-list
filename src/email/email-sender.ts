export interface IEmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface IEmailSender {
  send(message: IEmailMessage): Promise<void>;
}

/** The default in development: writes each message to the log, so nothing is sent by accident. */
export class ConsoleEmailSender implements IEmailSender {
  constructor(private readonly log: (line: string) => void = console.log) {}

  async send({ to, subject, text }: IEmailMessage): Promise<void> {
    this.log(`To: ${to}\nSubject: ${subject}\n\n${text}`);
  }
}

/**
 * Wraps a sender so `send` returns as soon as the message is handed over, without waiting for delivery.
 * Responses then take the same time whether or not an email went out, which would otherwise reveal
 * whether an address has an account. Failures go to `onError`, since there is no caller left to throw at.
 */
export const sendInBackground = (
  sender: IEmailSender,
  onError: (error: unknown, message: IEmailMessage) => void,
): IEmailSender => ({
  async send(message) {
    sender.send(message).catch((error: unknown) => onError(error, message));
  },
});
